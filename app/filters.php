<?php

/*
|--------------------------------------------------------------------------
| Application & Route Filters
|--------------------------------------------------------------------------
|
| Below you will find the "before" and "after" events for the application
| which may be used to do any work before or after a request into your
| application. Here you may also register your custom route filters.
|
*/
App::before(function($request)
{
	//
});


App::after(function($request, $response)
{
	//
});

/*
|--------------------------------------------------------------------------
| Authentication Filters
|--------------------------------------------------------------------------
*/

// redirect to login page if not logged in
Route::filter('auth', function()
{
	if (is_null(Auth::getUser()) || Auth::getUserState() !== 0) {
		if (Request::wantsJson()) {
			App::abort(401); // unauthorized
			return;
		}
		else {
			return Redirect::to("/admin/login")->with("authRequestFromFilter", true);
		}
	}
});


/*
|--------------------------------------------------------------------------
| CSRF Protection Filter
|--------------------------------------------------------------------------
|
| The CSRF filter is responsible for protecting your application against
| cross-site request forgery attacks. If this special token in a user
| session does not match the one given in this request, we'll bail.
|
*/

Route::filter('csrf', function()
{
	if (Request::isMethod('get')) {
		return;
	}
	
	// throws exception if token invalid
	Csrf::check();
});
