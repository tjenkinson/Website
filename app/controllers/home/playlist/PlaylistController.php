<?php namespace uk\co\la1tv\website\controllers\home\playlist;

use uk\co\la1tv\website\controllers\home\HomeBaseController;
use View;
use App;

class PlaylistController extends HomeBaseController {

	public function getIndex($id, $mediaItemId=null) {
		$this->setContent(View::make("home.playlist.index"), "playlist", "playlist");
	}
	
	public function missingMethod($parameters=array()) {
		// redirect /[integer]/[anything] to /index/[integer]/[anything]
		if (count($parameters) >= 1 && ctype_digit($parameters[0])) {
			call_user_func_array(array($this, "getIndex"), $parameters);
		}
		else {
			App::abort(404);
		}
	}
}