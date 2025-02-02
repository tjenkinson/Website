<?php namespace uk\co\la1tv\website\controllers\home\admin\livestreams;

use View;
use FormHelpers;
use ObjectHelpers;
use Config;
use DB;
use Validator;
use Redirect;
use Response;
use Auth;
use App;
use JsonHelpers;
use Upload;
use EloquentHelpers;
use uk\co\la1tv\website\models\LiveStream;
use uk\co\la1tv\website\models\LiveStreamUri;
use uk\co\la1tv\website\models\QualityDefinition;
use uk\co\la1tv\website\models\MediaItem;

class LiveStreamsController extends LiveStreamsBaseController {

	public function getIndex() {
		
		Auth::getUser()->hasPermissionOr401(Config::get("permissions.liveStreams"), 0);
	
		$view = View::make('home.admin.livestreams.index');
		$tableData = array();
		
		$pageNo = FormHelpers::getPageNo();
		$searchTerm = FormHelpers::getValue("search", "", false, true);
		
		// get shared lock on records so that they can't be deleted before query runs to get specific range
		// (this doesn't prevent new ones getting added but that doesn't really matter too much)
		$noLiveStreams = LiveStream::search($searchTerm)->sharedLock()->count();
		$noPages = FormHelpers::getNoPages($noLiveStreams);
		if ($pageNo > 0 && FormHelpers::getPageStartIndex() > $noLiveStreams-1) {
			App::abort(404);
			return;
		}
		
		$liveStreams = LiveStream::search($searchTerm)->usePagination()->orderBy("name", "asc")->orderBy("description", "asc")->orderBy("created_at", "desc")->sharedLock()->get();
		
		foreach($liveStreams as $a) {
			$enabled = (boolean) $a->enabled;
			$enabledStr = $enabled ? "Yes" : "No";
			$shownAsLivestream = (boolean) $a->shown_as_livestream;
			$shownAsLivestreamStr = $shownAsLivestream ? "Yes" : "No";
			
			$tableData[] = array(
				"enabled"		=> $enabledStr,
				"enabledCss"	=> $enabled ? "text-success" : "text-danger",
				"shownAsLivestream"	=> $shownAsLivestreamStr,
				"shownAsLivestreamCss"	=> $shownAsLivestream ? "text-success" : "text-danger",
				"name"			=> $a->name,
				"description"	=> !is_null($a->description) ? $a->description : "[No Description]",
				"timeCreated"	=> $a->created_at->toDateTimeString(),
				"playerUri"		=> Config::get("custom.admin_base_url") . "/livestreams/player/" . $a->id,
				"editUri"		=> Config::get("custom.admin_base_url") . "/livestreams/edit/" . $a->id,
				"id"			=> $a->id
			);
		}
		$view->tableData = $tableData;
		$view->editEnabled = Auth::getUser()->hasPermission(Config::get("permissions.liveStreams"), 1);
		$view->pageNo = $pageNo;
		$view->noPages = $noPages;
		$view->createUri = Config::get("custom.admin_base_url") . "/livestreams/edit";
		$view->deleteUri = Config::get("custom.admin_base_url") . "/livestreams/delete";
		$this->setContent($view, "livestreams", "livestreams");
	}
	
	public function getPlayer($id) {

		Auth::getUser()->hasPermissionOr401(Config::get("permissions.liveStreams"), 0);
	
		$liveStream = LiveStream::find($id);
		if (is_null($liveStream)) {
			App::abort(404);
			return;
		}
		
		$streamName = $liveStream->name;
	
		$streamAccessible = $liveStream->getIsAccessible();
		$streamUris = null;
		$streamUris = array();
		foreach($liveStream->getQualitiesWithUris(array("live", "nativeDvr")) as $qualityWithUris) {
			$streamUris[] = array(
				"quality"	=> array(
					"id"	=> intval($qualityWithUris['qualityDefinition']->id),
					"name"	=> $qualityWithUris['qualityDefinition']->name
				),
				"uris"		=> $qualityWithUris['uris']
			);
		}
		
		$streamUris = json_encode($streamUris);
	
		$view = View::make('home.admin.livestreams.player');
		$view->streamName = $streamName;
		$view->streamAccessible = $streamAccessible;
		$view->coverArtUri = Config::get("custom.default_cover_uri");
		$view->streamUris = $streamUris;
		$view->backUri = Config::get("custom.admin_base_url") . "/livestreams";
		$this->setContent($view, "livestreams", "livestreams-player");
	}
	
	public function anyEdit($id=null) {
		
		Auth::getUser()->hasPermissionOr401(Config::get("permissions.liveStreams"), 1);
		
		$liveStream = null;
		$editing = false;
		if (!is_null($id)) {
			$liveStream = LiveStream::find($id);
			if (is_null($liveStream)) {
				App::abort(404);
				return;
			}
			$editing = true;
		}
		
		$formSubmitted = isset($_POST['form-submitted']) && $_POST['form-submitted'] === "1"; // has id 1

		// populate $formData with default values or received values
		$formData = FormHelpers::getFormData(array(
			array("enabled", ObjectHelpers::getProp(false, $liveStream, "enabled")?"y":""),
			array("shownAsLivestream", ObjectHelpers::getProp(false, $liveStream, "shown_as_livestream")?"y":""),
			array("name", ObjectHelpers::getProp("", $liveStream, "name")),
			array("description", ObjectHelpers::getProp("", $liveStream, "description")),
			array("cover-art-id", ObjectHelpers::getProp("", $liveStream, "coverArtFile", "id")),
			array("inherited-live-media-item-id", ObjectHelpers::getProp("", $liveStream, "inheritedLiveMediaItem", "id")),
			array("urls", json_encode(array())),
		), !$formSubmitted);
		
		// this will contain any additional data which does not get saved anywhere
		$additionalFormData = array(
			"coverArtFile"		=> FormHelpers::getFileInfo($formData['cover-art-id']),
			"urlsInput"			=> null,
			"inheritedLiveMediaItemText"	=> !is_null($liveStream) && !is_null($liveStream->inheritedLiveMediaItem) ? $liveStream->inheritedLiveMediaItem->getNameWithInfo() : "",
			"urlsInitialData"	=> null
		);

		if (!$formSubmitted) {
			$additionalFormData['urlsInput'] = ObjectHelpers::getProp(json_encode(array()), $liveStream, "urls_for_input");
			$additionalFormData['urlsInitialData'] = ObjectHelpers::getProp(json_encode(array()), $liveStream, "urls_for_orderable_list");
		}
		else {
			$additionalFormData['urlsInput'] = LiveStream::generateInputValueForUrlsOrderableList(JsonHelpers::jsonDecodeOrNull($formData['urls'], true));
			$additionalFormData['urlsInitialData'] = LiveStream::generateInitialDataForUrlsOrderableList(JsonHelpers::jsonDecodeOrNull($formData["urls"], true));
		}
		
		$errors = null;
		
		if ($formSubmitted) {
			$modelCreated = DB::transaction(function() use (&$formData, &$liveStream, &$errors) {
				
				Validator::extend('valid_file_id', FormHelpers::getValidFileValidatorFunction());
				Validator::extend('valid_urls', function($attribute, $value, $parameters) {
					return LiveStream::isValidDataFromUrlsOrderableList(JsonHelpers::jsonDecodeOrNull($value, true));
				});

				Validator::extend('valid_media_item_id', function($attribute, $value, $parameters) {
					return !is_null(MediaItem::find($value));
				});
				
				$validator = Validator::make($formData,	array(
					'name'				=> array('required', 'max:50'),
					'description'		=> array('max:500'),
					'cover-art-id'		=> array('valid_file_id'),
					'inherited-live-media-item-id'		=> array('valid_media_item_id'),
					'urls'				=> array('required', 'valid_urls')
				), array(
					'name.required'			=> FormHelpers::getRequiredMsg(),
					'name.max'				=> FormHelpers::getLessThanCharactersMsg(50),
					'description.max'		=> FormHelpers::getLessThanCharactersMsg(500),
					'cover-art-id.valid_file_id'	=> FormHelpers::getInvalidFileMsg(),
					'inherited-live-media-item-id.valid_media_item_id'	=> FormHelpers::getGenericInvalidMsg(),
					'urls.required'			=> FormHelpers::getGenericInvalidMsg(),
					'urls.valid_urls'		=> FormHelpers::getGenericInvalidMsg()
				));
				
				if (!$validator->fails()) {
					// everything is good. save/create model
					if (is_null($liveStream)) {
						$liveStream = new LiveStream();
					}
					
					$liveStream->name = $formData['name'];
					$liveStream->description = FormHelpers::nullIfEmpty($formData['description']);
					$liveStream->enabled = FormHelpers::toBoolean($formData['enabled']);
					$liveStream->shown_as_livestream = FormHelpers::toBoolean($formData['shownAsLivestream']);
					
					$coverArtFileId = FormHelpers::nullIfEmpty($formData['cover-art-id']);
					$file = Upload::register(Config::get("uploadPoints.coverArt"), $coverArtFileId, $liveStream->coverArtFile);
					EloquentHelpers::associateOrNull($liveStream->coverArtFile(), $file);

					$inheritedLiveMediaItemId = FormHelpers::nullIfEmpty($formData['inherited-live-media-item-id']);
					$inheritedLiveMediaItem = !is_null($inheritedLiveMediaItemId) ? MediaItem::find($inheritedLiveMediaItemId) : null;
					EloquentHelpers::associateOrNull($liveStream->inheritedLiveMediaItem(), $inheritedLiveMediaItem);

					if ($liveStream->save() === false) {
						throw(new Exception("Error saving LiveStream."));
					}
					
					$liveStream->liveStreamUris()->delete(); // detaches all. this causes any corresponding dvrBridgeServiceUrl's to be deleted as well which must happen on any change
					$urlsData = json_decode($formData['urls'], true);
					foreach($urlsData as $a) {
						$qualityDefinition = QualityDefinition::find(intval($a['qualityState']['id']));
						$url = $a['url'];
						$dvrBridgeServiceUri = $a['dvrBridgeServiceUrl'];
						$nativeDvr = $a['nativeDvr'];
						$type = $a['type'];
						$support = $a['support'];
						$supportedDevices = null;
						if ($support === "pc") {
							$supportedDevices = "desktop";
						}
						else if ($support === "mobile") {
							$supportedDevices = "mobile";
						}
						$liveStreamUri = new LiveStreamUri(array(
							"uri"						=> $url,
							"dvr_bridge_service_uri"	=> $dvrBridgeServiceUri,
							"has_dvr"					=> $nativeDvr,
							"type"						=> $type,
							"supported_devices"			=> $supportedDevices,
							"enabled"					=> $support !== "none"
						));
						$liveStreamUri->qualityDefinition()->associate($qualityDefinition);
						$liveStream->liveStreamUris()->save($liveStreamUri);
					}
					
					// the transaction callback result is returned out of the transaction function
					return true;
				}
				else {
					$errors = $validator->messages();
					return false;
				}
			});
			
			if ($modelCreated) {
				return Redirect::to(Config::get("custom.admin_base_url") . "/livestreams");
			}
			// if not valid then return form again with errors
		}
		
		$view = View::make('home.admin.livestreams.edit');
		$view->editing = $editing;
		$view->form = $formData;
		$view->additionalForm = $additionalFormData;
		$view->coverArtUploadPointId = Config::get("uploadPoints.coverArt");
		$view->formErrors = $errors;
		$view->cancelUri = Config::get("custom.admin_base_url") . "/livestreams";
		$view->mediaItemsAjaxSelectDataUri = Config::get("custom.admin_base_url") . "/media/ajaxselect";

		$this->setContent($view, "livestreams", "livestreams-edit");
	}
	
	public function postDelete() {
	
		Auth::getUser()->hasPermissionOr401(Config::get("permissions.liveStreams"), 1);
	
		$resp = array("success"=>false);
		if (FormHelpers::hasPost("id")) {
			$id = intval($_POST["id"], 10);
			DB::transaction(function() use (&$id, &$resp) {
				$liveStream = LiveStream::find($id);
				if (!is_null($liveStream)) {
					if ($liveStream->isDeletable()) {
						if ($liveStream->delete() === false) {
							throw(new Exception("Error deleting LiveStream."));
						}
						$resp['success'] = true;
					}
					else {
						$resp['msg'] = "This live stream cannot be deleted at the moment as it is being used in other places, or it's marked as currently being live.";
					}
				}
			});
		}
		return Response::json($resp);
	}

	// ajax from the admin control box on the live stream page on the main site
	public function postAdminVodControlInheritedLiveMediaItem($id) {
		Auth::getUser()->hasPermissionOr401(Config::get("permissions.liveStreams"), 1);
		
		$liveStream = LiveStream::with("inheritedLiveMediaItem")->find($id);
		if (is_null($liveStream)) {
			App::abort(404);
		}
		
		$id = null;
		if (isset($_POST['id']) && $_POST['id'] !== "") {
			$id = intval($_POST['id']);
		}
		
		$inheritedLiveMediaItem = null;
		if (!is_null($id)) {
			$inheritedLiveMediaItem = MediaItem::find($id);
			if (is_null($inheritedLiveMediaItem)) {
				App::abort(500);
			}
		}
		EloquentHelpers::associateOrNull($liveStream->inheritedLiveMediaItem(), $inheritedLiveMediaItem);
		if (!$liveStream->save()) {
			App::abort(500);
		}

		$resp = array("success" => true);
		return Response::json($resp);
	}
}
