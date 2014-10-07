<?php namespace uk\co\la1tv\website\serviceProviders\upload;

use Response;
use Session;
use Config;
use DB;
use FormHelpers;
use Exception;
use Csrf;
use EloquentHelpers;
use Auth;
use uk\co\la1tv\website\models\UploadPoint;
use uk\co\la1tv\website\models\File;

class UploadManager {

	private static $maxFileLength = 50; // length of varchar in db
	
	private $processCalled = false;
	private $responseData = array();
	
	// process the file that has been uploaded
	// Returns true if succeeds or false otherwise
	public function process($allowedIds=null) {
		
		if ($this->processCalled) {
			throw(new Exception("'process' can only be called once."));
		}
		$this->processCalled = true;
		
		$this->responseData = array("success"=> false);
		$success = false;
		
		$uploadPointId = FormHelpers::getValue("upload_point_id");
		
		if (Csrf::hasValidToken() && !is_null($uploadPointId) && (is_null($allowedIds) || in_array($uploadPointId, $allowedIds, true))) {
			
			$uploadPointId = intval($uploadPointId, 10);
			$uploadPoint = UploadPoint::with("fileType", "fileType.extensions")->find($uploadPointId);
			
			if (!is_null($uploadPoint) && isset($_FILES['file']) && strlen($_FILES['file']['name']) <= self::$maxFileLength && isset($_FILES['file']['tmp_name'])) {
				
				$fileLocation = $_FILES['file']['tmp_name'];
				$fileName = $_FILES['file']['name'];
				$fileSize = filesize($fileLocation);
				
				$extension = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
				$extensions = array();
				$extensionModels = $uploadPoint->fileType->extensions;
				if (!is_null($extensionModels)) {
					foreach($extensionModels as $a) {
						$extensions[] = $a->extension;
					}
				}
				if (in_array($extension, $extensions) && $fileSize != FALSE && $fileSize > 0) {

					try {
						DB::beginTransaction();
						
						// create the file reference in the db
						$fileDb = new File(array(
							"in_use"	=> false,
							"filename"	=> $fileName,
							"size"		=> $fileSize,
							"session_id"	=> Session::getId() // the laravel session id
						));
						$fileDb->fileType()->associate($uploadPoint->fileType);
						$fileDb->uploadPoint()->associate($uploadPoint);
						if ($fileDb->save() !== FALSE) {
							
							// commit transaction so file record is committed to database
							DB::commit();
							
							DB::beginTransaction();
							// another transaction to make sure the session doesn't become null on the model (which would result in the upload processor trying to delete it, and failing silently if it can't find the file) whilst the file is being moved.
							$fileDb = File::find($fileDb->id);
							if (is_null($fileDb)) {
								throw(new Exception("File model has been deleted!"));
							}
							if ($fileDb->session_id !== Session::getId()) {
								throw(new Exception("Session has changed between transactions!"));
							}
							// move the file providing the file record created successfully.
							// it is important there's always a file record for each file. if there ends up being a file record without a corresponding file that's ok as the record will just get deleted either.
							if (move_uploaded_file($fileLocation, Config::get("custom.pending_files_location") . DIRECTORY_SEPARATOR . $fileDb->id)) {
								// set ready_for_processing to true so that processing can start.
								// this means if the file was copied and then the server crashed before here, the file will still get deleted in the future (when the linked session becomes null)
								$fileDb->ready_for_processing = true;
								$fileDb->save();
								DB::commit();
								
								// success
								$success = true;
								$this->responseData['success'] = true;
								$this->responseData['id'] = $fileDb->id;
								$this->responseData['fileName'] = $fileName;
								$this->responseData['fileSize'] = $fileSize;
								$this->responseData['processInfo'] = $fileDb->getProcessInfo();
							}
							else {
								DB::rollback();
							}
						}
						else {
							DB::rollback();
						}
					}
					catch (\Exception $e) {
						DB::rollback();
						throw($e);
					}
				}
			}
		}
		return $success;
	}
	
	// get the Laravel response (json) object to be returned to the user
	public function getResponse() {
		if (!$this->processCalled) {
			throw(new Exception("'process' must have been called first."));
		}
		return Response::json($this->responseData);
	}
	
	// get an array containing information about the last upload
	// returns array or null if there was an error processing
	public function getInfo() {
		if (!$this->processCalled) {
			throw(new Exception("'process' must have been called first."));
		}
		$data = $this->responseData;
		return $data['success'] ? array("fileName"=>$data['fileName'], "fileSize"=>$data['fileSize']) : null;
	}
	
	// register a file as now in use by its id. It assumed that this id is valid. an exception is thrown otherwise
	// if the file has already been registered then an exception is thrown, unless the $fileToReplace is the same file.
	// the first parameter is the upload point id and this is used to check that the file being registered is one that was uploaded at the expected upload point
	// optionally pass in the File object of a file that this will be replacing.
	// returns the File model of the registered file or null if $fileId was null
	// if the $fileId is null then the $fileToReplace will be removed and null will be returned.
	public static function register($uploadPointId, $fileId, File $fileToReplace=null) {
		
		$uploadPoint = UploadPoint::with("fileType", "fileType.extensions")->find($uploadPointId);	
	
		if (is_null($uploadPoint)) {
			throw(new Exception("Invalid upload point."));
		}
		
		if (!is_null($fileToReplace) && !is_null($fileId) && intval($fileToReplace->id, 10) === intval($fileId, 10)) {
			// if we are replacing the file with the same file then nothing to do.
			// just return the model
			return $fileToReplace;
		}
		
		$file = null;
		if (!is_null($fileId)) {
			$fileId = intval($fileId, 10);
			$file = File::with("uploadPoint")->find($fileId);
			if (is_null($file)) {
				throw(new Exception("File model could not be found."));
			}
			else if (is_null($file->uploadPoint)) {
				throw(new Exception("This file doesn't have an upload point. This probably means it was created externally and 'register' should not be used on it."));
			}
			else if ($file->in_use) {
				throw(new Exception("This file has already been registered."));
			}
			else if ($file->uploadPoint->id !== $uploadPoint->id) {
				throw(new Exception("Upload points don't match. This could happen if a file was uploaded at one upload point and now the file with that id is being registered somewhere else."));
			}
		}
		
		if (!is_null($file)) {
			$file->in_use = true; // mark file as being in_use now
		}
		DB::transaction(function() use (&$file, &$fileToReplace) {
			
			if (!is_null($file)) {
				if ($file->save() === false) {
					throw(new Exception("Error saving file model."));
				}
			}
			if (!is_null($fileToReplace)) {
				self::delete($fileToReplace);
			}
		});
		
		return $file;
	}
	
	// mark the files/file past in for deletion
	// will ignore any null models
	public static function delete($files) {
		if (!is_array($files)) {
			$files = array($files);
		}
		foreach($files as $a) {
			if (!is_null($a)) {
				$a->markReadyForDelete();
				$a->save();
			}
		}
	}
	
	// returns the File object for a file if the security checks pass.
	// returns the File model or null
	public static function getFile($fileId) {
		
		// the file must be a render (ie have a source file) file to be valid. Then the security checks are performed on the source file.

		$relationsToLoad = array(
			"sourceFile",
			"sourceFile.mediaItemWithBanner",
			"sourceFile.mediaItemWithCover",
			"sourceFile.mediaItemWithCoverArt",
			"sourceFile.playlistWithBanner",
			"sourceFile.playlistWithCover",
			"sourceFile.mediaItemVideoWithFile.mediaItem"
		);

		$requestedFile = File::with($relationsToLoad)->finishedProcessing()->find($fileId);
		if (is_null($requestedFile)) {
			return null;
		}
		
		$sourceFile = $requestedFile->sourceFile;
		if (is_null($sourceFile)) {
			return null;
		}
		
		$user = Auth::getUser();
		$hasMediaItemsPermission = false;
		$hasPlaylistsPermission = false;
		if (!is_null($user)) {
			$hasMediaItemsPermission = Auth::getUser()->hasPermission(Config::get("permissions.mediaItems"), 0);
			$hasPlaylistsPermission = Auth::getUser()->hasPermission(Config::get("permissions.playlists"), 0);
		}
		
		$accessAllowed = false;
		
		// see if the file should be accessible
		if (!is_null($sourceFile->mediaItemWithBanner)) {
			if ($sourceFile->mediaItemWithBanner->getIsAccessible()) {
				$accessAllowed = true;
			}
		}
		else if (!is_null($sourceFile->mediaItemWithCover)) {
			if ($sourceFile->mediaItemWithCover->getIsAccessible()) {
				$accessAllowed = true;
			}
		}
		else if (!is_null($sourceFile->mediaItemWithCoverArt)) {
			if ($sourceFile->mediaItemWithCoverArt->getIsAccessible()) {
				$accessAllowed = true;
			}
		}
		else if (!is_null($sourceFile->mediaItemVideoWithFile)) {
			if ($sourceFile->mediaItemVideoWithFile->mediaItem->getIsAccessible() && ($sourceFile->mediaItemVideoWithFile->getIsLive() || $hasMediaItemsPermission)) {
				$accessAllowed = true;
			}
		}
		else if (!is_null($sourceFile->playlistWithBanner)) {
			if ($sourceFile->playlistWithBanner->getIsAccessible() && ($sourceFile->playlistWithBanner->getIsAccessibleToPublic() || $hasPlaylistsPermission)) {
				$accessAllowed = true;
			}
		}
		else if (!is_null($sourceFile->playlistWithCover)) {
			if ($sourceFile->playlistWithCover->getIsAccessible() && ($sourceFile->playlistWithCover->getIsAccessibleToPublic() || $hasPlaylistsPermission)) {
				$accessAllowed = true;
			}
		}
		else if (!is_null($sourceFile->playlistWithCoverArt)) {
			if ($sourceFile->playlistWithCoverArt->getIsAccessible() && ($sourceFile->playlistWithCoverArt->getIsAccessibleToPublic() || $hasPlaylistsPermission)) {
				$accessAllowed = true;
			}
		}
		return $accessAllowed ? $requestedFile : null;
	}
	
	// helper that returns true if the current user should have access to this file
	public static function hasAccessToFile($fileId) {
		return !is_null(self::getFile($fileId));
	}
	
	// returns the file laravel response that should be returned to the user.
	// this will either be the file (with cache header to cache for a year), or a 404
	public static function getFileResponse($fileId) {
		$file = self::getFile($fileId);
		if (is_null($file)) {
			// return 404 response
			return Response::make("", 404);
		}
		// return response with cache header set for client to cache for a year
		return Response::download(Config::get("custom.files_location") . DIRECTORY_SEPARATOR . $file->id, "la1tv-".$file->id)->setContentDisposition("inline")->setClientTtl(31556926)->setTtl(31556926)->setEtag($file->id);
	}
}