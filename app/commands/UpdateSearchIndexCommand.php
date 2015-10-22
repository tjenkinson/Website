<?php namespace uk\co\la1tv\website\commands;

use Illuminate\Console\Command;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Input\InputArgument;
use Elasticsearch;
use Config;
use Exception;
use uk\co\la1tv\website\models\MediaItem;

class UpdateSearchIndexCommand extends Command {

	/**
	 * The console command name.
	 *
	 * @var string
	 */
	protected $name = 'searchIndex:update';

	/**
	 * The console command description.
	 *
	 * @var string
	 */
	protected $description = 'Updates the search index.';

	private $esClient = null;

	/**
	 * Create a new command instance.
	 *
	 * @return void
	 */
	public function __construct()
	{
		parent::__construct();
	}

	/**
	 * Execute the console command.
	 *
	 * @return mixed
	 */
	public function fire()
	{
		$this->info('Updating search index.');

		$this->esClient = Elasticsearch\ClientBuilder::create()
			->setHosts(array("127.0.0.1:9200"))
			->build();

		// the width and height of images to retrieve for the cover art
		$coverArtResolutions = Config::get("imageResolutions.coverArt");
		$coverArtWidth = $coverArtResolutions['thumbnail']['w'];
		$coverArtHeight = $coverArtResolutions['thumbnail']['h'];

		// update/create/remove media items in index
		$entries = [];
		$entryIdsToRemove = [];
		$changedMediaItems = MediaItem::with("playlists", "playlists.show")->needsReindexing()->get();
		foreach($changedMediaItems as $mediaItem) {
			if ($mediaItem->getIsAccessible()) {
				$entries[] = $this->getMediaItemData($mediaItem, $coverArtWidth, $coverArtHeight);
			}
			else {
				// this item is no longer accessible so remove it from the index
				$entryIdsToRemove[] = intval($mediaItem->id);
			}
		}

		$this->syncIndexType("mediaItem", new MediaItem(), $changedMediaItems, $entries, $entryIdsToRemove);

		// TODO sync playlists index
		// TODO sync shows index


		$this->info('Done.');
	}

	private function updateIndexType($type, $entries) {
		if (count($entries) > 0) {
			// https://www.elastic.co/guide/en/elasticsearch/client/php-api/2.0/_indexing_documents.html
			$params = ["body"	=> []];
			foreach($entries as $a) {
				$params["body"][] = [
					'index'	=> [
						'_index' => 'website',
						'_type' => $type,
						'_id' => $a["id"]
					]
				];
				$params["body"][] = $a;
				$this->info('Indexing "'.$type.'" with id '.$a["id"].'.');
			}
			$response = $this->esClient->bulk($params);

			if (count($response["items"]) !== count($entries) || $response["errors"]) {
				throw(new Exception("Something went wrong indexing items."));
			}
		}
	}

	private function syncIndexType($type, $model, $changedModels, $entries, $entryIdsToRemove) {
		$this->updateIndexType($type, $entries);
		// get the ids of everything stored in index
		$ids = $this->getIdsInIndexType($type);
		// get media items with those ids from the datase
		$removedModelIds = $this->getNonexistantModelIds($model, $ids);
		$entryIdsToRemove = array_unique(array_merge($entryIdsToRemove, $removedModelIds));
		$this->removeFromIndexType($type, $entryIdsToRemove);
		// this must be the last thing to happen to make sure version numbers are only updated if there are no errors
		$this->updateModelVersionNumbers($changedModels);
	}

	private function removeFromIndexType($type, $ids) {
		if (count($ids) > 0) {
			$params = ["body"	=> []];
			foreach($ids as $id) {
				$params["body"][] = [
					'delete'	=> [
						'_index' => 'website',
						'_type' => $type,
						'_id' => $id
					]
				];
				$this->info('Removing "'.$type.'" with id '.$id.' from index.');
			}
			$response = $this->esClient->bulk($params);
			if (count($response["items"]) !== count($ids) || $response["errors"]) {
				throw(new Exception("Something went wrong deleting items from index type."));
			}
		}
	}

	private function getIdsInIndexType($type) {
		$params = [
			'index' => 'website',
			'type' => $type,
			'body' => [
				'query' => [
					'match_all' => new \stdClass()
				],
				'fields' => []
			]
		];

		$results = $this->esClient->search($params);
		if ($results["timed_out"]) {
			throw(new Exception("Search request to get ids timed out."));
		}

		$ids = [];
		if ($results["hits"]["total"] > 0) {
			foreach($results["hits"]["hits"] as $a) {
				$ids[] = intval($a["_id"]);
			}
		}
		return $ids;
	}

	private function getNonexistantModelIds($model, $ids) {
		$foundModelIds = array_pluck($model::whereIn("id", $ids)->select("id")->get(), "id");
		return array_diff($ids, $foundModelIds);
	}

	private function updateModelVersionNumbers($models) {
		foreach($models as $item) {
			$item->current_search_index_version = intval($item->pending_search_index_version);
			if (!$item->save()) {
				throw(new Exception("Error updating model version numbers."));
			}
		}
	}

	private function getShowData($show) {
		return [
			"id"			=> intval($show->id),
			"name"			=> $show->name,
			"description"	=> $show->description,
			"url"			=> $show->getUri()
		];
	}

	private function getPlaylistData($playlist, $coverArtWidth, $coverArtHeight) {
		$showData = null;
		$show = $playlist->show;
		if (!is_null($show)) {
			$showData = $this->getShowData($show);
		}

		return [
			"id"			=> intval($playlist->id),
			"name"			=> $playlist->generateName(),
			"description"	=> $playlist->description,
			"coverArtUri"	=> $playlist->getCoverArtUri($coverArtWidth, $coverArtHeight),
			// elastic search expects milliseconds
			"scheduledPublishTime"	=> $playlist->scheduled_publish_time->timestamp * 1000,
			"seriesNo"		=> !is_null($playlist->series_no) ? intval($playlist->series_no) : null,
			"url"			=> $playlist->getUri(),
			"show"			=> $showData
		];
	}

	private function getMediaItemData($mediaItem, $coverArtWidth, $coverArtHeight) {
		$playlists = $mediaItem->playlists;
		$playlistsData = [];
		foreach($playlists as $playlist) {
			if (!$playlist->getIsAccessible()) {
				continue;
			}
			$playlistsData[] = [
				"generatedName"	=> $playlist->generateEpisodeTitle($mediaItem),
				"coverArtUri"	=> $playlist->getMediaItemCoverArtUri($mediaItem, $coverArtWidth, $coverArtHeight),
				"url"			=> $playlist->getMediaItemUri($mediaItem),
				"playlist"		=> $this->getPlaylistData($playlist, $coverArtWidth, $coverArtHeight)
			];
		}

		return [
			"id"			=> intval($mediaItem->id),
			"name"			=> $mediaItem->name,
			"description"	=> $mediaItem->description,
			"scheduledPublishTime"	=> $mediaItem->scheduled_publish_time->timestamp * 1000,
			"playlists"		=> $playlistsData
		];
	}

	/**
	 * Get the console command arguments.
	 *
	 * @return array
	 */
	protected function getArguments()
	{
		return array();
	}

	/**
	 * Get the console command options.
	 *
	 * @return array
	 */
	protected function getOptions()
	{
		return array();
	}

}
