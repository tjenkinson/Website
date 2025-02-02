<?php namespace uk\co\la1tv\website\controllers\home\ajax;

use uk\co\la1tv\website\controllers\BaseController;
use View;
use Response;
use FormHelpers;
use Config;
use Session;
use Elasticsearch;
use App;
use DB;
use Redis;
use Exception;
use Log;
use uk\co\la1tv\website\models\PushNotificationRegistrationEndpoint;

class AjaxController extends BaseController {
	
	// used as an endpoint to ping to keep a users session alive
	public function postHello() {
		return Response::json(array(
			"data"	=> "hi"
		));
	}
	
	// retrieves log data from javascript running in the clients
	public function postLog() {
	
		$logger = $this->getLogValue(FormHelpers::getValue("logger"));
		$timestamp = $this->formatLogDate(FormHelpers::getValue("timestamp"), true);
		$level = $this->getLogValue(FormHelpers::getValue("level"));
		$url = $this->getLogValue(FormHelpers::getValue("url"));
		$debugId = $this->getLogValue(FormHelpers::getValue("debug_id"));
		$message = $this->getLogValue(FormHelpers::getValue("message"), true);
	
		$logStr = "Server time: ".$this->formatLogDate(time())."  Session id: \"".Session::getId()."\"  Log level: ".$level."  Client time: ".$timestamp."  Url: ".$url."  Debug id: ".$debugId."  Message: ".$message;
		
		// append to the js log file.
		file_put_contents(Config::get("custom.js_log_file_path"), $logStr . "\r\n", FILE_APPEND | LOCK_EX);
		
		return Response::json(array("success"=>true));
	}

	public function postSearch() {
		$enabled = Config::get("search.enabled");

		if (!$enabled) {
			App::abort(404);
			return;
		}

		$term = isset($_POST["term"]) ? $_POST["term"] : "";

		$client = Elasticsearch\ClientBuilder::create()
		->setHosts(Config::get("search.hosts"))
		->build();

		$params = [
			'index' => 'website',
			'type' => 'mediaItem',
			'body' => [
				'query' => [
					'dis_max' => [
						'tie_breaker' => 0.3,
						'queries' => [
							[
								'dis_max' => [
									'tie_breaker' => 0.3,
									'queries' => [
										[
											'multi_match' => [
												'query' => $term,
												'type' => 'most_fields',
												'fields' => ['name^10', 'name.std'],
												'boost' => 13
											]
										],
										[
											'multi_match' => [
												'query' => $term,
												'type' => 'most_fields',
												'fields' => ['description^10', 'description.std'],
												'boost' => 11
											]
										]
									]
								]
							],
							[
								'nested' => [
									'path' => 'playlists.playlist',
									'query' => [
										'dis_max' => [
											'tie_breaker' => 0.3,
											'queries' => [
												[
													'multi_match' => [
														'query' => $term,
														'type' => 'most_fields',
														'fields' => ['playlists.playlist.name^10', 'playlists.playlist.name.std'],
														'boost' => 8
													]
												],
												[
													'multi_match' => [
														'query' => $term,
														'type' => 'most_fields',
														'fields' => ['playlists.playlist.description^10', 'playlists.playlist.description.std'],
														'boost' => 6
													]
												]
											]
										]
									]
								]
							],
							[
								'nested' => [
									'path' => 'playlists.playlist.show',
									'query' => [
										'dis_max' => [
											'tie_breaker' => 0.3,
											'queries' => [
												[
													'multi_match' => [
														'query' => $term,
														'type' => 'most_fields',
														'fields' => ['playlists.playlist.show.name^10', 'playlists.playlist.show.name.std'],
														'boost' => 3
													]
												],
												[
													'multi_match' => [
														'query' => $term,
														'type' => 'most_fields',
														'fields' => ['playlists.playlist.show.description^10', 'playlists.playlist.show.description.std'],
														'boost' => 1
													]
												]
											]
										]
									]
								]
							]
						]
					]
				]
			]
		];
		
		$result = $client->search($params);
		if ($result["timed_out"]) {
			App::abort(500); // server error
			return;
		}

		$results = array();
		if ($result["hits"]["total"] > 0) {
			foreach($result["hits"]["hits"] as $hit) {
				$source = $hit["_source"];
				$result = array(
					"title"			=> $source["name"],
					"description"	=> $source["description"],
					"thumbnailUri"	=> $source["playlists"][0]["coverArtUri"],
					"url"			=> $source["playlists"][0]["url"]
				);
				$results[] = $result;
			}
		}
		
		return Response::json(array(
			"results"	=> $results
		));
	}

	public function postRegisterPushNotificationEndpoint() {
		if (!Config::get("pushNotifications.enabled")) {
			App::abort(404);
			return;
		}

		$url = isset($_POST["url"]) ? $_POST["url"] : null;
		if (is_null($url) || filter_var($url, FILTER_VALIDATE_URL) === false) {
			// no url/invalid url
			App::abort(500); // server error
			return;
		}

		$endpointWhiteList = Config::get("pushNotifications.endpointWhiteList");
		$urlAllowed = false;
		foreach($endpointWhiteList as $urlStart) {
			if (substr($url, 0, strlen($urlStart)) === $urlStart) {
				$urlAllowed = true;
				break;
			}
		}
		if (!$urlAllowed) {
			// url not allowed
			Log::debug("Rejecting push endpoint URL \"" . $url . "\" because not in whitelist.");
			return Response::json(array(
				"success"	=> false
			));
		}

		$sessionId = Session::getId();
		$success = DB::transaction(function() use (&$sessionId, &$url) {
			$model = PushNotificationRegistrationEndpoint::where("session_id", $sessionId)->lockForUpdate()->first();
			if (is_null($model)) {
				$model = new PushNotificationRegistrationEndpoint(array(
					"session_id"	=> $sessionId
				));
			}
			$model->url = $url;
			return $model->save();
		});
		if (!$success) {
			App::abort(500); // server error
			return;
		}
		return Response::json(array(
			"success"	=> true
		));
	}

	public function getNotifications() {
		if (!Config::get("pushNotifications.enabled")) {
			App::abort(404);
			return;
		}
		$payloads = array();
		$redis = Redis::connection();
		$key = "notificationPayloads.".Session::getId();
		$tmpKey = $key.".tmp.".str_random(20);
		try {
			// rename for atomicity
			if ($redis->rename($key, $tmpKey)) {
				$data = $redis->get($tmpKey);
				if (!is_null($data)) {
					$redis->del($key);
					$data = json_decode($data, true);
					$now = time();
					// ignore any notifications which have expired (older than 2 days)
					foreach($data as $a) {
						if ($a["time"] >= ($now-172800)*1000) {
							$payloads[] = $a["payload"];
						}
					}
				}
			}
		} catch(Exception $e) {}
		return Response::json($payloads);
	}
	
	private function formatLogDate($a, $milliseconds=false) {
		$a = intval($a);
		if (is_null($a)) {
			return "[Invalid Date]";
		}
		if ($milliseconds) {
			 $a = floor($a/1000);
		}
		return '"'.date(DATE_RFC2822, $a).'"';
	}
	
	private function getLogValue($a, $quotesAllowed=false) {
		$str = "[None]";
		
		if (!$quotesAllowed && strpos($a, '"') !== FALSE) {
			// " are not allowed in the value as it's only " that distinguish the separate parts of the log. It's fine in the message as that's the last thing in the log line
			$str = "[Invalid]";
		}
		else if (!is_null($a)) {
			$str = '"'.$a.'"';
		}
		return $str;
	}
}
