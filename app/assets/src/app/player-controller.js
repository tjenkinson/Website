// takes in a Player Component and handles all communication with it.
// has knowledge of the requests to the server and the responses returned

// communicates with a PlayerControllerQualitiesHander to manage quality selection.
// also manages likes and view count

define([
	"jquery",
	"./components/player",
	"./page-data",
	"./synchronised-time",
	"./device-detection",
	"./notification-service",
	"./helpers/build-get-uri",
	"./helpers/ajax-helpers",
	"./google-analytics"
], function($, PlayerComponent, PageData, SynchronisedTime, DeviceDetection, notificationService, buildGetUri, AjaxHelpers, GoogleAnalytics) {
	var PlayerController = null;

	// qualities handler needs to be an object with the following methods:
	// - getChosenQualityId()
	// 		should return the current chosen quality id
	// - setAvailableQualities(qualities)
	//		called with an array of {id, name}
	//		will be an empty array in the case of there being no video
	
	// autoPlayVod and autoPlayStream mean these should automatically play whenever they become active
	// however whenever either of the 2 is paused by the user both autoPlay settings will be flipped to false
	// unless enableSmartAutoPlay is false
	// registerWatchingUri and registerLikeUri can be null to disable these features
	PlayerController = function(playerInfoUri, registerWatchingUri, registerLikeUri, qualitiesHandler, responsive, autoPlayVod, autoPlayStream, vodPlayStartTime, ignoreExternalStreamUrl, initialVodQualityId, initialStreamQualityId, disableFullScreen, placeQualitySelectionComponentInPlayer, showTitleInPlayer, disablePlayerControls, enableSmartAutoPlay, openLinksInNewWindow) {
		
		var self = this;
		
		// callback that will always be called after all the initial data has
		// been retrieved
		this.onLoaded = function(callback) {
			if (loaded) {
				callback();
			}
			else {
				$(self).on("loaded", callback);
			}
		};
		
		// destroys the controller and player and prevents any future requests
		this.destroy = function() {
			destroyed = true;
			if (timerId !== null) {
				clearTimeout(timerId);
			}
			if (analyticsReportTimerId !== null) {
				clearInterval(analyticsReportTimerId);
			}
			if (registerWatchingTimerId !== null) {
				clearTimeout(registerWatchingTimerId);
			}
			unregisterStateChangeNotifications();
			playerComponent.destroy();
		};
		
		this.getPlayerComponentEl = function() {
			if (playerComponent !== null) {
				return playerComponent.getEl();
			}
			return null;
		};
		
		// get the id corresponding to this players content
		this.getContentId = function() {
			return getContentId;
		};
		
		// total number of likes or null if like total is disabled.
		this.getNumLikes = function() {
			if (!registerLikeUri) {
				throw "Likes disabled because registerLikeUri not provided.";
			}
			return numLikes;
		};
		
		// total number of dislikes or null if dislike total is disabled
		this.getNumDislikes = function() {
			if (!registerLikeUri) {
				throw "Likes disabled because registerLikeUri not provided.";
			}
			return numDisikes;
		};
		
		// returns 'like' if person liked this, 'dislike' if disliked, or null if neither
		this.getLikeType = function() {
			if (!registerLikeUri) {
				throw "Likes disabled because registerLikeUri not provided.";
			}
			return likeType;
		};
		
		this.registerLike = function(type, callback) {
			if (!registerLikeUri) {
				throw "Likes are disabled because no registerLikeUri was provided.";
			}
			registerLike(type, callback);
		};
		
		// a date object or null if the publish time is unknown
		this.getScheduledPublishTime = function() {
			return scheduledPublishTime;
		};
		
		this.getStreamViewCount = function() {
			return streamViewCount;
		};
		
		this.getVodViewCount = function() {
			return vodViewCount;
		};
		
		this.getViewCount = function() {
			if (cachedData !== null) {
				var streamCount = self.getStreamViewCount();
				var vodCount = self.getVodViewCount();
				if (streamCount === null && vodCount === null) {
					return null;
				}
				
				var count = 0;
				if (streamCount !== null) {
					count += streamCount;
				}
				if (vodCount !== null) {
					count += vodCount;
				}
				return count;
			}
			return null;
		};
		
		this.getNumWatchingNow = function() {
			return numWatchingNow;
		};
		
		// returns true if a playback error has occurred
		this.hasPlaybackErrorOccurred = function() {
			if (playerComponent !== null) {
				return !!playerComponent.getPlayerError();
			}
			return null;
		};
		
		// returns true if there's something and it's paused
		this.paused = function() {
			if (playerComponent !== null) {
				return playerComponent.paused();
			}
			return null;
		};
		
		// play if there is something
		this.play = function() {
			if (playerComponent !== null) {
				playerComponent.play();
			}
		};
		
		// pause if there is something
		this.pause = function() {
			if (playerComponent !== null) {
				playerComponent.pause();
			}
		};
		
		this.getPlayerType = function() {
			return playerType;
		};
		
		// jump to a specific time (seconds) in the video if it's vod
		// if startPlaying is true then it will start playing if it isn't currently
		this.jumpToTime = function(time, startPlaying) {
			if (playerComponent !== null) {
				playerComponent.jumpToTime(time, startPlaying);
			}
		};
		
		// 1=not live, 2=live, 3=show over, null=no live stream
		this.getStreamState = function() {
			return streamState;
		};
		
		this.getEmbedData = function() {
			return embedData;
		};
		
		this.enableOverrideMode = function(enable) {
			queuedOverrideModeEnabled = enable;
			render();
		};
		
		this.getOverrideModeEnabled = function() {
			return overrideModeEnabled;
		};
		
		this.getAutoPlayVod = function() {
			return autoPlayVod;
		};
		
		this.getAutoPlayStream = function() {
			return autoPlayStream;
		};
		
		this.setAutoPlayVod = function(enabled) {
			autoPlayVod = enabled;
			if (!enabled) {
				resolvedAutoPlayVod = false;
			}
			else if (playerComponent === null || !playerComponent.paused()) {
				resolvedAutoPlayVod = true;
			}
		};
		
		this.setAutoPlayStream = function(enabled) {
			autoPlayStream = enabled;
			if (!enabled) {
				resolvedAutoPlayStream = false;
			}
			else if (playerComponent === null || !playerComponent.paused()) {
				resolvedAutoPlayStream = true;
			}
		};
		
		// get the time that the vod should start at when it is first loaded
		// null means the best time will be determined automatically
		this.getVodStartTime = function() {
			return vodPlayStartTime;
		};

		this.hasEnded = function() {
			if (playerComponent !== null) {
				return playerComponent.hasEnded();
			}
			return null;
		};
		
		this.setVodStartTime = function(startTime) {
			vodPlayStartTime = startTime;
		};

		var loaded = false;
		var destroyed = false;
		var timerId = null;
		var updateXHR = null;
		var playerComponent = null;
		var getContentId = null;
		var playerType = null;
		var currentUris = [];
		var cachedData = null;
		var vodSourceId = null;
		var scheduledPublishTime = null;
		var vodRememberedStartTime = null;
		var vodViewCount = null;
		var streamViewCount = null;
		var numWatchingNow = null;
		var numLikes = null;
		var numDislikes = null;
		var likeType = null; // "like", "dislike" or null
		var streamState = null;
		var streamStartTime = null; // the time the user started watching the stream
		var overrideModeEnabled = null;
		var queuedOverrideModeEnabled = false;
		var resolvedAutoPlayVod = autoPlayVod;
		var resolvedAutoPlayStream = autoPlayStream;
		var embedData = null;
		var rememberedTimeTimerId = null;
		var analyticsReportTimerId = null;
		var registerWatchingTimerId = null;
		var registerWatchingInterval = 10000;
		
		$(qualitiesHandler).on("chosenQualityChanged", function() {
			// this can be fired as a result of the quality being changed in updatePlayer()
			// meaning updatePlayer() would get called again before the first updatePlayer()
			// finished which could cause an infinite loop.
			// use setTimeout to make sure setPlayer() has finished executing before it is
			// called again
			setTimeout(function() {
				updatePlayer();
			}, 0);
		});
		
		// kick it off
		update();
		
		// report to analytics the current play position every 10 seconds
		analyticsReportTimerId = setInterval(function() {
			// paused() can be null if unknown
			if ((playerType === "live" || playerType === "vod") && playerComponent !== null && playerComponent.paused() === false) {
				reportToAnalytics("playing");
			}
		}, 10000);
		
		// report whether or not the content is playing for view count etc
		registerWatchingTimerId = setTimeout(registerWatchingAndSchedule, registerWatchingInterval);

		registerStateChangeNotifications();

		function registerStateChangeNotifications() {
			notificationService.on("mediaItem.live", onStateChangeNotification);
			notificationService.on("mediaItem.showOver", onStateChangeNotification);
			notificationService.on("mediaItem.notLive", onStateChangeNotification);
			notificationService.on("mediaItem.vodAvailable", onStateChangeNotification);
		}

		function unregisterStateChangeNotifications() {
			notificationService.off("mediaItem.live", onStateChangeNotification);
			notificationService.off("mediaItem.showOver", onStateChangeNotification);
			notificationService.off("mediaItem.notLive", onStateChangeNotification);
			notificationService.off("mediaItem.vodAvailable", onStateChangeNotification);
		}

		function onStateChangeNotification() {
			// something has changed so request an update immediately
			update();
		}

		function registerWatchingAndSchedule() {
			if (registerWatchingTimerId === null) {
				// timer has been cancelled.
				return;
			}
			clearTimeout(registerWatchingTimerId);
			registerWatching();
			// reschedule
			registerWatchingTimerId = setTimeout(registerWatchingAndSchedule, registerWatchingInterval);
		}

		function update() {
			if (destroyed) {
				return;
			}

			if (timerId !== null) {
				clearTimeout(timerId);
				timerId = null;
			}

			var onComplete = function() {
				if (!destroyed) {
					// schedule update again in 15 seconds if not connected to notification service
					// otherwise 25 seconds as update() will be called instantly when the playback
					// type should change. View count and watching now updating less often not a big issue
					timerId = setTimeout(update, notificationService.isConnected() ? 25000 : 15000);
				}
			};

			if (updateXHR) {
				// cancel the current request
				updateXHR.abort();
				updateXHR = null;
			}

			updateXHR = $.ajax(playerInfoUri, {
				cache: false,
				dataType: "json",
				headers: AjaxHelpers.getHeaders(),
				data: {
					csrf_token: PageData.get("csrfToken")
				},
				type: "POST"
			}).always(function(data, textStatus, jqXHR) {
				updateXHR = null;
				if (jqXHR.status === 200) {
					var localVodSourceId = nullify(data.vodSourceId);
					var callback = function(time) {
						cachedData = data;
						getContentId = data.id;
						vodSourceId = localVodSourceId;
						vodRememberedStartTime = time;
						render();
						onComplete();
					};
				
					if (localVodSourceId !== null) {
						getRememberedTime(data, callback);
					}
					else {
						callback(null);
					}
				}
				else {
					onComplete();
				}
			});
		}
		
		function render() {
			updateEmbedData();
			updateOverrideMode();
			updatePlayer();
			updateViewCounts();
			updateNumWatchingNow();
			updateScheduledPublishTime();
			updateLikes();
		}
		
		function updateEmbedData() {
			if (embedData !== null) {
				// the assumption is that embed data doesn't change
				return;
			}
			if (!cachedData.embedData) {
				// no embed data available (yet)
				return;
			}
			embedData = cachedData.embedData;
			$(self).triggerHandler("embedDataAvailable");
		}
		
		function updateOverrideMode() {
			if (queuedOverrideModeEnabled !== overrideModeEnabled) {
				overrideModeEnabled = queuedOverrideModeEnabled;
				$(self).triggerHandler("overrideModeChanged");
			}
		}
		
		function updatePlayer() {
			if (cachedData === null) {
				return;
			}
			var data = cachedData;
			
			var firstLoad = false;
			if (playerComponent === null) {
				firstLoad = true;
				playerComponent = new PlayerComponent(data.coverUri, responsive, placeQualitySelectionComponentInPlayer ? qualitiesHandler : null);
				$(self).triggerHandler("playerComponentElAvailable");
				$(playerComponent).on("play", function() {
					// content is playing (again)
					// reenable auto play if the user requested it to be enabled
					resolvedAutoPlayVod = autoPlayVod;
					resolvedAutoPlayStream = autoPlayStream;
					$(self).triggerHandler("play");
					reportToAnalytics("play");
					// immediately inform server that content is now playing
					registerWatchingAndSchedule();
				});
				$(playerComponent).on("loadedMetadata", function() {
					// called at the point when the browser starts receiving the stream/video
					// update the stream start time if it is a live stream
					if (playerType === "live") {
						streamStartTime = SynchronisedTime.getDate();
					}
				});
				$(playerComponent).on("ended", function() {
					$(self).triggerHandler("ended");
					reportToAnalytics("ended");
				});
				$(playerComponent).on("pause", function() {
					// disable auto play, because the user has paused whatever is playing
					// this means if the content was to switch, they probably don't want it to automatically start again
					if (enableSmartAutoPlay) {
						resolvedAutoPlayVod = resolvedAutoPlayStream = false;
					}
					$(self).triggerHandler("pause");
					reportToAnalytics("pause");
					// immediately inform server that content is now paused
					registerWatchingAndSchedule();
				});
			}
			
			var deviceStreamUriGroups = nullify(data.streamUris) !== null ? extractUrisForDevice(data.streamUris) : null;
			var deviceVideoUriGroups = nullify(data.videoUris) !== null ? extractUrisForDevice(data.videoUris) : null;
			
			if (nullify(data.hasStream) && data.streamState === 3) {
				// stream is over so strip out any urls that aren't dvr urls
				// the dvr stream urls should now be pointing to a static recording
				for(var i=deviceStreamUriGroups.length-1; i>=0; i--) {
					var group = deviceStreamUriGroups[i];
					var uris = group.uris;
					for (var j=uris.length-1; j>=0; j--) {
						var uri = uris[j];
						if (!uri.uriWithDvrSupport) {
							// remove this uri
							uris.splice(j, 1);
						}
					}
					if (uris.length === 0) {
						// no uris left in this group so remove it.
						deviceStreamUriGroups.splice(i, 1);
					}
				}
			}
			
			var externalStreamUrl = nullify(data.hasStream) && data.streamState !== 3 && !ignoreExternalStreamUrl ? nullify(data.externalStreamUrl) : null;
			var queuedPlayerType = "ad";
			// live streams take precedence over vod
			if (nullify(data.hasStream) && (data.streamState === 2 || (data.streamState === 3 && deviceStreamUriGroups.length > 0) || (overrideModeEnabled && data.streamState === 1))) {
				if (externalStreamUrl !== null || deviceStreamUriGroups.length > 0) {
					queuedPlayerType = "live";
				}
			}
			else if (nullify(data.hasVod) && (data.vodLive && (!nullify(data.hasStream) || data.streamState !== 1)) || overrideModeEnabled) {
				if (deviceVideoUriGroups.length > 0) {
					queuedPlayerType = "vod";
					externalStreamUrl = null;
				}
			}
			
			var uriGroups = [];
			if (externalStreamUrl === null) {
				// the stream is being hosted in the player, or it's not a stream or ad
				if (queuedPlayerType === "live") {
					uriGroups = deviceStreamUriGroups;
				}
				else if (queuedPlayerType === "vod") {
					uriGroups = deviceVideoUriGroups;
				}
			}
			
			// if the player type isn't changing then make sure the quality selection
			// component doesn't switch the quality to another when new ones are loaded in.
			var tryAndStickWithCurrentQuality = queuedPlayerType === playerType;
			updateQualitySelectionComponent(uriGroups, tryAndStickWithCurrentQuality);
			if (queuedPlayerType === "vod" && playerType !== "vod") {
				// changing to vod from something else
				if (initialVodQualityId !== null) {
					// set the quality to the one provided
					if (qualitiesHandler.hasQuality(initialVodQualityId)) {
						qualitiesHandler.setQuality(initialVodQualityId, false);
					}
				}
			}
			if (queuedPlayerType === "live" && playerType !== "live") {
				// changing to live from something else
				if (initialStreamQualityId !== null) {
					// set the quality to the one provided
					if (qualitiesHandler.hasQuality(initialStreamQualityId)) {
						qualitiesHandler.setQuality(initialStreamQualityId, false);
					}
				}
			}
			var chosenUris = getChosenUris(uriGroups);
			
			var urisChanged = false;
			// only check if the uris have changes if it's still the same player type
			if (queuedPlayerType === playerType) {
				if (currentUris.length !== chosenUris.length) {
					urisChanged = true;
				}
				else {
					for(var i=0; i<chosenUris.length; i++) {
						var current = currentUris[i];
						var pending = chosenUris[i];
						if (current.uri !== pending.uri || current.type !== pending.type || current.supportedDevices !== pending.supportedDevices || current.uriWithDvrSupport !== pending.uriWithDvrSupport) {
							urisChanged = true;
							break;
						}
					}
				}
			}
			currentUris = chosenUris;
			
			if (queuedPlayerType !== playerType || urisChanged) {
				// either the player type has changed, or the current uris for the player have changed.
				// this may be down to the user changing quality or changed remotely for some reason
				setPlayerType(queuedPlayerType);
				if (queuedPlayerType === "live") {
					if (urisChanged) {
						// reason we're here is because uris have changed. could be quality change or other reason
						// so set the play state back to what it was before
						playerComponent.setPlayerStartTime(0, !playerComponent.paused());
					}
					else if (data.streamState === 3) {
						// it's just a dvr recording which is essentially vod so use that autoplay setting
						if (resolvedAutoPlayVod) {
							playerComponent.setPlayerStartTime(0, true);
						}
					}
					else if (resolvedAutoPlayStream) {
						// auto start live stream
						playerComponent.setPlayerStartTime(0, true);
					}
					else {
						playerComponent.setPlayerStartTime(0, false);
					}
				}
				else if (queuedPlayerType === "vod") {
					var computedStartTime = vodRememberedStartTime !== null ? vodRememberedStartTime : 0;
					if (urisChanged) {
						// reason we're here is because uris have changed. could be quality change or other reason
						// but it makes sense to automatically resume playback from where the user was previously
						playerComponent.setPlayerStartTime(playerComponent.getPlayerCurrentTime(), !playerComponent.paused());
					}
					else if (resolvedAutoPlayVod) {
						// autoplay flag is set
						if (firstLoad && vodPlayStartTime !== null) {
							// first load so autoplay from requested start time
							playerComponent.setPlayerStartTime(vodPlayStartTime, true, false);
						}
						else {
							// not first load but autoplay is set, so autoplay from where up to previously
							// the second param means reset the time to 0 if it doesn't makes sense. E.g if the time is within the last 10 seconds of the video or < 5.
							playerComponent.setPlayerStartTime(computedStartTime, true, true);
						}
					}
					else if (vodPlayStartTime !== null && firstLoad) {
						// first load so set the start point to the requested start time
						playerComponent.setPlayerStartTime(vodPlayStartTime, false, false);
					}
					else {
						// set the start time to the time the user was previously at.
						// the second param means reset the time to 0 if it doesn't makes sense. E.g if the time is within the last 10 seconds of the video or < 5.
						playerComponent.setPlayerStartTime(computedStartTime, false, true);
					}
				}
				playerComponent.setPlayerUris(chosenUris);
			}
			
			if (queuedPlayerType === "ad") {
				if (nullify(data.hasStream) && data.streamState === 1) {
					// show stream info message if the stream is enabled and is "not live"
					playerComponent.setCustomMsg(nullify(data.streamInfoMsg));
				}
				qualitiesHandler.setAvailableQualities([]);
			}
			
			if (queuedPlayerType === "vod" && nullify(data.vodChapters) !== null) {
				playerComponent.setChapters(data.vodChapters);
			}
			else {
				playerComponent.setChapters([]);
			}
			
			if (queuedPlayerType === "vod" && nullify(data.vodThumbnails) !== null) {
				playerComponent.setScrubThumbnails(data.vodThumbnails);
			}
			else {
				playerComponent.setScrubThumbnails([]);
			}
			
			if (showTitleInPlayer) {
				playerComponent.setTitle(data.title, function() {
					var uri = data.uri;
					if (playerType === "vod") {
						// append the auo play start time parameters to the uri
						var currentTime = playerComponent.getPlayerCurrentTime();
						if (currentTime !== null && currentTime > 0) {
							var timeParamValue = Math.floor(currentTime/60)+"m"+Math.floor(currentTime%60)+"s";
							var query = buildGetUri({
								t: timeParamValue
							}, uri);
							var tmp = uri.lastIndexOf("?");
							if (tmp !== -1) {
								uri = uri.substr(0, tmp);
							}
							uri += query;
						}
					}
					return uri;
				}, openLinksInNewWindow);
			}
			else {
				playerComponent.setTitle(null, null);
			}
			playerComponent.showStreamOver(nullify(data.hasStream) && data.streamState === 3);
			playerComponent.setCustomMsg(nullify(data.hasStream) && data.streamState === 1 ? nullify(data.streamInfoMsg) : null);
			playerComponent.showVodAvailableShortly(nullify(data.hasStream) && data.streamState === 3 && nullify(data.availableOnDemand));
			playerComponent.setStartTime(nullify(data.scheduledPublishTime) !== null && (!nullify(data.hasStream) || data.streamState !== 3) ? new Date(data.scheduledPublishTime*1000) : null, !!data.hasStream);
			playerComponent.setExternalStreamUrl(externalStreamUrl);
			playerComponent.disableFullScreen(disableFullScreen);
			// setting this to false may cause some issues in safari
			// look at https://github.com/LA1TV/Website/issues/619
			playerComponent.setPlayerPreload(true);
			playerComponent.disableControls(disablePlayerControls);
			
			if (queuedPlayerType === "vod") {
				// start updating the local database with the users position in the video.
				startRememberedTimeUpdateTimer();
			}
			else {
				stopRememberedTimeUpdateTimer();
			}
			
			if (nullify(data.streamState) !== streamState) {
				streamState = data.streamState;
				$(self).triggerHandler("streamStateChanged");
			}
			
			if (playerType !== queuedPlayerType) {
				playerType = queuedPlayerType;
				$(self).triggerHandler("playerTypeChanged");
			}
			playerComponent.render();
			
			if (firstLoad) {
				loaded = true;
				$(self).triggerHandler("loaded");
			}
		}
		
		// returns an array of uri groups with any uris that aren't supported on this device stripped out.
		// any uri groups that become empty because of this will be stripped out as well.
		function extractUrisForDevice(uriGroups) {
			var deviceUriGroups = [];
			for (var i=0; i<uriGroups.length; i++) {
				var uriGroup = uriGroups[i];
				var newUriGroup = {
						uris: [],
						quality: uriGroup.quality
				};
				for (var j=0; j<uriGroup.uris.length; j++) {
					var uri = uriGroup.uris[j];
					var supportedDevices = uri.supportedDevices;
					// if supportedDevices is null then that means all devices are supported. Otherwise only the devices listed are supported.
					if (supportedDevices !== null) {
						supportedDevices = supportedDevices.split(",");
					}
					var currentDevice = DeviceDetection.isMobile() ? "mobile" : "desktop";
					if (supportedDevices !== null && $.inArray(currentDevice, supportedDevices) === -1) {
						// uri not supported on this device
						continue;
					}
					newUriGroup.uris.push(uri);
				}
				if (newUriGroup.uris.length > 0) {
					deviceUriGroups.push(newUriGroup);
				}
			}
			return deviceUriGroups;
		}
		
		// updates the quality selection component with the qualities determined from the uri groups
		function updateQualitySelectionComponent(uriGroups, tryAndStickWithCurrentQuality) {
			var qualities = [];
			for (var i=0; i<uriGroups.length; i++) {
				var uriGroup = uriGroups[i];
				qualities.push({
					id:		uriGroup.quality.id,
					name:	uriGroup.quality.name
				});
			}
			qualitiesHandler.setAvailableQualities(qualities, tryAndStickWithCurrentQuality);
		}
		
		// returns the uri group that should be used for the chosen quality
		function getChosenUris(uriGroups) {
			var uris = [];
			var qualityIds = [];
			for (var i=0; i<uriGroups.length; i++) {
				var uriGroup = uriGroups[i];
				qualityIds.push(uriGroup.quality.id);
			}
			if (qualityIds.length > 0) {
				var currentQualityId = qualitiesHandler.getChosenQualityId();
				var chosenUriGroup = uriGroups[qualityIds.indexOf(currentQualityId)];
				uris = chosenUriGroup.uris;
			}
			return uris;
		}
		
		function setPlayerType(type) {
			if (type !== "live" && type !== "vod" && type !== "ad") {
				throw "Type must be either 'live', 'vod' or 'ad'.";
			}
			
			if (type === "ad") {
				playerComponent.showPlayer(false);
			}
			else {
				playerComponent.setPlayerType(type).showPlayer(true);
			}
		}
		
		function startRememberedTimeUpdateTimer() {
			if (rememberedTimeTimerId !== null) {
				// timer already running
				return;
			}
			var fn = function() {
				updateRememberedTime();
			};
			setTimeout(fn, 0); // run immediately as well as every 5 seconds
			rememberedTimeTimerId = setInterval(fn, 5000);
		}
		
		function stopRememberedTimeUpdateTimer() {
			if (rememberedTimeTimerId === null) {
				// timer isn't running
				return;
			}
			clearInterval(rememberedTimeTimerId);
			rememberedTimeTimerId = null;
		}
		
		function updateRememberedTime() {
			if (!areRememberedTimeUpdateConditionsMet()) {
				return;
			}
			
			updateRememberedTimeInDb();
		}
		
		// get the time that the user was last up to in the vod (via a callback)
		// requires the latest version of the player info data from the response.
		function getRememberedTime(data, callback) {
			if (data.vodSourceId === null) {
				callback(null);
				return;
			}
			
			// first see if there is a remembered time in the servers info response
			if (nullify(data.rememberedPlaybackTime) !== null) {
				callback(data.rememberedPlaybackTime);
			}
			else {
				// could not get time from server. return the local one instead (or null)
				getRememberedTimeFromDb(data.vodSourceId, function(result) {
					callback(result);
				});
			}
		}
		
		function updateRememberedTimeInDb() {
			if (!("indexedDB" in window) || !window.indexedDB) {
				// browser does not have indexedDB support so do nothing
				return;
			}
		
			// store the current time into the vod in an object store using the vodSourceId as the identifier.
			// vodSourceId is the id of the source file that the different qualities of the video were generated from
			try {
				var request = createOpenPlaybackTimesDatabaseRequest();
				if (request === null) {
					// could not be created for some reason.
					// error should have been logged from creation function
					return;
				}
				request.onsuccess = function(event) {
					try {
						var db = event.target.result;
						var transaction = db.transaction(["playback-times"], "readwrite");
						transaction.oncomplete = function(event) {
							// success
						};
						
						transaction.onerror = function(event) {
							console.error("Error when trying to update \"playback-times\"  object store.");
						};
						
						var objectStore = transaction.objectStore("playback-times");
						
						// first remove any old entries. (Entries older than 3 weeks)
						var cutoffTime = new Date().getTime() - (21 * 24 * 60 * 60 * 1000);
						objectStore.index("timeUpdated").openKeyCursor(IDBKeyRange.upperBound(cutoffTime, true)).onsuccess = function(event) {
							var cursor = event.target.result;
							if (cursor) {
								objectStore.delete(cursor.primaryKey);
								cursor.continue();
							}
						};
						
						// only update the time whilst the video is actually playing. This means if the user has the video open in several tabs the time will be updated for the one they are watching
						if (areRememberedTimeUpdateConditionsMet()) {	
							var request = objectStore.put({
								id: vodSourceId,
								time: playerComponent.getPlayerCurrentTime(),
								timeUpdated: new Date().getTime()
							});
							request.onerror = function(event) {
								console.error("Error when trying to create/update object in \"playback-times\"  object store.");
							};
						}
					}
					catch(e) {
						console.error("Exception thrown when trying to update \"playback-times\" object store.");
					}
				};
			}
			catch(e) {
				console.error("Exception thrown when trying to update \"playback-times\" object store.");
			}
		}
		
		// get the time the user was up to in the current video last time they watched it.
		// callback should take 1 param which will be the time or null if time could not be retrieved.
		// id is the id of the source file
		function getRememberedTimeFromDb(id, callback) {
			var callbackCalled = false;
			var callCallback = function(result) {
				// make sure the callback is only called once.
				if (!callbackCalled) {
					callbackCalled = true;
					callback(result);
				}
			};
			
			
			if (!("indexedDB" in window) || !window.indexedDB) {
				// browser does not have indexedDB support so do nothing
				callCallback(null);
				return;
			}
			
			try {
				var request = createOpenPlaybackTimesDatabaseRequest(function() {
					// error connecting to database
					callCallback(null);
				});
				
				request.onsuccess = function(event) {
					var db = event.target.result;
					try {
						var transaction = db.transaction(["playback-times"]);
						transaction.oncomplete = function(event) {
							// success
						};
						
						transaction.onerror = function(event) {
							console.error("Error when trying to read from \"playback-times\" object store.");
							callCallback(null);
						};
						
						var objectStore = transaction.objectStore("playback-times");
						var resultRequest = objectStore.get(id);
						
						resultRequest.onerror = function(event) {
							console.error("Error when trying to request the playback time from the \"playback-times\" object store.");
							callCallback(null);
						};
						
						resultRequest.onsuccess = function(event) {
							var result = resultRequest.result;
							callCallback(result ? result.time : null);
						};
					}
					catch(e) {
						console.error("Exception occurred when trying to request the playback time from the \"playback-times\" object store.");
						callCallback(null);
					}
				};
			}
			catch(e) {
				console.error("Exception thrown when trying to read from \"playback-times\" object store.");
				callCallback(null);
			}
		}
		
		function areRememberedTimeUpdateConditionsMet() {
			return !(playerType !== "vod" || vodSourceId === null || playerComponent === null || playerComponent.paused() || playerComponent.getPlayerCurrentTime() == null || !playerComponent.hasPlayerInitialized());
		}
		
		function createOpenPlaybackTimesDatabaseRequest(onErrorCallback) {
			var onErrorCallbackCalled = false;
			try {
				// open/create "PlaybackTimes" database
				var request = window.indexedDB.open("PlaybackTimes", 6);
				request.onerror = function(event) {
					console.error("Error occurred when trying to create/open \"PlaybackTimes\" database.");
					if (onErrorCallback && !onErrorCallbackCalled) {
						onErrorCallbackCalled = true;
						onErrorCallback(event);
					}
				};
				request.onupgradeneeded = function(event) {
					try {
						var db = event.target.result;
						// Create an objectStore for this database
						if (db.objectStoreNames.contains("playback-times")) {
							db.deleteObjectStore("playback-times"); // remove old version first
						}
						var objectStore = db.createObjectStore("playback-times", { keyPath: "id" });
						objectStore.createIndex("timeUpdated", "timeUpdated", { unique: false });
					}
					catch(e) {
						console.error("Exception occurred when trying to upgrade the \"PlaybackTimes\" database.");
						if (onErrorCallback && !onErrorCallbackCalled) {
							onErrorCallbackCalled = true;
							onErrorCallback(null);
						}
					}
				};
				return request;
			}
			catch(e) {
				console.error("Exception occurred when trying to open/create the \"PlaybackTimes\" database.");
				if (onErrorCallback && !onErrorCallbackCalled) {
					onErrorCallbackCalled = true;
					onErrorCallback(null);
				}
			}
			return null;
		}
		
		function updateViewCounts() {
			var vodCountChanged = false;
			var streamCountChanged = false;
			vodCountChanged = vodViewCount !== nullify(cachedData.vodViewCount);
			vodViewCount = nullify(cachedData.vodViewCount);
			streamCountChanged = streamViewCount !== nullify(cachedData.streamViewCount);
			streamViewCount = nullify(cachedData.streamViewCount);
			if (vodCountChanged) {
				$(self).triggerHandler("vodViewCountChanged");
			}
			if (streamCountChanged) {
				$(self).triggerHandler("streamViewCountChanged");
			}
			if (vodCountChanged || streamCountChanged) {
				$(self).triggerHandler("viewCountChanged");
			}
		}
		
		function updateNumWatchingNow() {
			if (!registerWatchingUri) {
				// watching now disabled
				return;
			}
			var numWatchingNowChanged = numWatchingNow !== cachedData.numWatchingNow;
			numWatchingNow = cachedData.numWatchingNow;
			
			if (numWatchingNowChanged) {
				$(self).triggerHandler("numWatchingNowChanged");
			}
		}
		
		function updateScheduledPublishTime() {
			var a = scheduledPublishTime !== null ? scheduledPublishTime.getTime() : null;
			var b = nullify(cachedData.scheduledPublishTime) !== null ? cachedData.scheduledPublishTime * 1000 : null;
			var scheduledPublishTimeChanged = a !== b;
			
			if (scheduledPublishTimeChanged) {
				scheduledPublishTime = b !== null ? new Date(b) : null;
				$(self).triggerHandler("scheduledPublishTimeChanged");
			}
		}
		
		function updateLikes() {
			if (!registerLikeUri) {
				// disabled
				return;
			}
			var changed = numLikes !== cachedData.numLikes;
			numLikes = cachedData.numLikes;
			if (changed) {
				$(self).triggerHandler("numLikesChanged");
			}
			var changed = numDislikes !== cachedData.numDislikes;
			numDislikes = cachedData.numDislikes;
			if (changed) {
				$(self).triggerHandler("numDisikesChanged");
			}
			var changed = likeType !== cachedData.likeType;
			likeType = cachedData.likeType;
			if (changed) {
				$(self).triggerHandler("likeTypeChanged");
			}
		}
		
		function registerWatching() {
			if (!registerWatchingUri) {
				// watching count disabled
				return;
			}
			$.ajax(registerWatchingUri, {
				cache: false,
				dataType: "json",
				headers: AjaxHelpers.getHeaders(),
				data: {
					csrf_token: PageData.get("csrfToken"),
					// paused() can be null if unknown
					playing: (playerType === "vod" || playerType === "live") && playerComponent && playerComponent.paused() === false ? "1" : "0",
					time: playerType === "vod" && playerComponent ? playerComponent.getPlayerCurrentTime() : "unavailable"
				},
				type: "POST"
			});
		}
		
		function registerLike(type, callback) {
			if (!registerLikeUri) {
				throw "Likes are disabled.";
			}
			if (type !== "like" && type !== "dislike" && type !== "reset") {
				throw "Type must be 'like', 'dislike' or 'reset'.";
			}
			if (type === "like" && self.getLikeType() === "like" ||
				type === "dislike" && self.getLikeType() === "dislike" ||
				type === "reset" && self.getLikeType() === null) {
				// no change
				if (callback) {
					callback(true);
				}
				return;
			}
			var previousLikeType = self.getLikeType();
			$.ajax(registerLikeUri, {
				cache: false,
				dataType: "json",
				headers: AjaxHelpers.getHeaders(),
				data: {
					csrf_token: PageData.get("csrfToken"),
					type: type
				},
				type: "POST"
			}).always(function(data, textStatus, jqXHR) {
				if (jqXHR.status === 200) {
					var success = data.success;
					if (success) {
						// like has changed on server. update cached versions accordingly
						if (previousLikeType === self.getLikeType()) {
							// make sure cache hasn't already been updated before this response was returned
							var likesChanged = false;
							var dislikesChanged = false;
							if (previousLikeType === null) {
								if (type === "like") {
									if (numLikes !== null) numLikes++;
									likesChanged = true;
								}
								else if (type === "dislike") {
									if (numDislikes !== null) numDislikes++;
									dislikesChanged = true;
								}
							}
							else if (previousLikeType === "like") {
								if (type === "dislike") {
									if (numLikes !== null) numLikes--;
									likesChanged = true;
									if (numDislikes !== null) numDislikes++;
									dislikesChanged = true;
								}
								else if (type === "reset") {
									if (numLikes !== null) numLikes--;
									likesChanged = true;
								}
							}
							else if (previousLikeType === "dislike") {
								if (type === "like") {
									if (numLikes !== null) numLikes++;
									likesChanged = true;
									if (numDislikes !== null) numDislikes--;
									dislikesChanged = true;
								}
								else if (type === "reset") {
									if (numDislikes !== null) numDisikes--;
									dislikesChanged = true;
								}
							}
							if (type === "like") {
								likeType = "like";
							}
							else if (type === "dislike") {
								likeType = "dislike";
							}
							else if (type === "reset") {
								likeType = null;
							}
							$(self).triggerHandler("likeTypeChanged");
							
							if (likesChanged) {
								$(self).triggerHandler("numLikesChanged");
							}
							if (dislikesChanged) {
								$(self).triggerHandler("numDisikesChanged");
							}
						}
					}
					if (callback) {
						callback(success);
					}
				}
				else {
					if (callback) {
						callback(false);
					}
				}
			});
		}
		
		function reportToAnalytics(action) {
			GoogleAnalytics.registerPlayerEvent(action, playerType, getContentId, playerComponent.getPlayerCurrentTime());
		}

		// if val is undefined return null, otherwise return value
		function nullify(val) {
			if (typeof(val) === "undefined") {
				return null;
			}
			return val;
		}
		
	};
	return PlayerController;
});
