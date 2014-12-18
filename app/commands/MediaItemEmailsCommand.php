<?php namespace uk\co\la1tv\website\commands;

use Illuminate\Console\Command;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Input\InputArgument;

use uk\co\la1tv\website\models\MediaItem;
use uk\co\la1tv\website\models\EmailTasksMediaItem;
use DB;
use Carbon;
use Config;

class MediaItemEmailsCommand extends Command {

	/**
	 * The console command name.
	 *
	 * @var string
	 */
	protected $name = 'mediaItemEmails:checkAndSend';

	/**
	 * The console command description.
	 *
	 * @var string
	 */
	protected $description = 'Determine what emails need sending and send them.';
	
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
		$messageTypeIds = array(
			"liveInFifteen"	=> 1, // show live in 15 minutes
			"liveNow"		=> 2  // show live/vod available now
		);
		
		
		$this->info('Looking for media items that are starting in 15 minutes.');
		$fifteenMinsAgo = Carbon::now()->subMinutes(15);
		$lowerBound = with(new Carbon($fifteenMinsAgo))->subSeconds(90);
		$this->info($lowerBound);
		$upperBound = new Carbon($fifteenMinsAgo);
		$mediaItemsStartingInFifteen = DB::transaction(function() use (&$lowerBound, &$upperBound, &$messageTypeIds) {
			$mediaItemsStartingInFifteen = MediaItem::accessible()->where(function($q) {
				$q->whereHas("emailTasksMediaItem", function($q2) {
					$q2->where("created_at", "<", Carbon::now()->subMinutes(15));
				})->orHas("emailTasksMediaItem", 0);
			})->where("scheduled_publish_time", ">=", $lowerBound)->where("scheduled_publish_time", "<", $upperBound)->orderBy("scheduled_publish_time", "desc")->lockForUpdate()->get();
			
			foreach($mediaItemsStartingInFifteen as $a) {
				$emailTask = new EmailTasksMediaItem(array(
					"message_type_id"	=> $messageTypeIds['liveInFifteen']
				));
				// create an entry in the tasks table for the emails that are going to be sent
				$a->emailTasksMediaItem()->save($emailTask);
			}
			
			return $mediaItemsStartingInFifteen;
		});
		
		foreach($mediaItemsStartingInFifteen as $a) {
			$playlist = $a->getDefaultPlaylist();
			$mediaItemTitle = $playlist->generateEpisodeTitle($a);
			$this->info("Building and sending email for media item with id ".$a->id." and name \"".$a->name."\" which is starting in 15 minutes.");
			$view = View::make("emails.mediaItem");
			$view->heading = "Live shortly!";
			$view->msg = "We will be live in less than 15 minutes!";
			$coverResolution = Config::get("imageResolutions.coverArt")['email'];
			$view->coverImgWidth = $coverResolution['w'];
			$view->coverImgHeight = $coverResolution['h'];
			$view->mediaItemTitle = $mediaItemTitle;
			$view->mediaItemDescription = $a->description;
			$view->mediaItemUri = $playlist->getMediaItemUri($a);
			$view->facebookUri = Config::get("socialMediaUris.facebook");
			$view->twitterUri = Config::get("socialMediaUris.twitter");
			$view->contactEmail = Config::get("contactEmails.general");
			$view->developmentEmail = Config::get("contactEmails.development");
			$view->accountSettingsUri = URL::route('accountSettings');
			$this->info("Sent emails.");
		}
		$this->info("Finished.");
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