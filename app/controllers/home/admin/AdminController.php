<?php namespace uk\co\la1tv\website\controllers\home\admin;

use View;

class AdminController extends AdminBaseController {
	
	public function getIndex() {
		$this->setContent(View::make('admin.index'), "index", "index");
	}
}
