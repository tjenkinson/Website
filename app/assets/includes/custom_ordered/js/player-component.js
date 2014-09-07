var PlayerComponent = null;

$(document).ready(function() {
	
	PlayerComponent = function(coverUri) {
		
		var self = this;
		
		this.getEl = function() {
			return $container;
		};
		
		this.setStartTime = function(startTime, willBeLiveParam) {
			queuedStartTime = startTime;
			queuedWillBeLive = willBeLiveParam;
			return this;
		};
		
		this.setCustomMsg = function(msg) {
			queuedCustomMsg = msg;
			return this;
		};
		
		this.showStreamOver = function(show, vodAvailable) {
			queuedShowStreamOver = show;
			return this;
		};
		
		this.showVodAvailableShortly = function(show) {
			queuedShowVodAvailableShortly = show;
			return this;
		};
		
		this.setPlayerType = function(playerType) {
			if (playerType !== "live" && playerType !== "vod") {
				throw 'PlayerType must be "live" or "vod".';
			}
			queuedPlayerType = playerType;
			return this;
		};
		
		this.setPlayerUris = function(uris) {
			if (playerUris !== null) {
				// see if changed.
				if (playerUris.length === uris.length) {
					var changed = false;
					for (var i=0; i<uris.length; i++) {
						if (uris[i] !== playerUris[i]) {
							changed = true;
							break;
						}
					}
					if (!changed) {
						return;
					}
				}
			}
			playerUris = uris;
			playerUrisChanged = true;
			return this;
		};
		
		this.setPlayerPreload = function(preload) {
			queuedPlayerPreload = preload;
			return this;
		};
		
		this.setPlayerAutoPlay = function(autoPlay) {
			queuedPlayerAutoPlay = autoPlay;
			return this;
		};
		
		this.showPlayer = function(show) {
			queuedShowAd = !show;
			queuedShowPlayer = show;
			return this;
		};
		
		this.render = function() {
			updateAd();
			updatePlayer();
			return this;
		};
		
		this.destroy = function() {
			clearTimeout(updateAdTimerId);
			destroyAd();
			destroyPlayer();
			$container.remove();
		};
		
		this.getCurrentTime = function() {
			if (videoJsPlayer !== null) {
				return videoJsPlayer.currentTime();
			}
			return null;
		};
		
		var showAd = null;
		var queuedShowAd = true;
		var startTime = null;
		var queuedStartTime = null;
		var willBeLive = null;
		var queuedWillBeLive = null;
		var customMsg = null;
		var queuedCustomMsg = null;
		var showStreamOver = null;
		var queuedShowStreamOver = false;
		var showVodAvailableShortly = null;
		var queuedShowVodAvailableShortly = false;
		var playerType = null;
		var queuedPlayerType = null;
		var playerPreload = null;
		var queuedPlayerPreload = true;
		var showPlayer = null;
		var queuedShowPlayer = false;
		var playerAutoPlay = null;
		var queuedPlayerAutoPlay = false;
		var playerUrisChanged = true;
		var playerUris = [];
		var currentAdTimeTxt = null;
		var currentLiveAtTxt = null;
		// id of timer that repeatedly calls updateAd() in order for countdown to work
		var updateAdTimerId = null;
		
		
		var $container = $("<div />").addClass("player-component embed-responsive embed-responsive-16by9");
		
		// reference to dom element which holds the ad
		var $ad = null;
		var $adTitle = null;
		var $adStreamOver = null;
		var $adVodAvailableShortly = null;
		var $adCustomMsg = null;
		var $adLiveAt = null;
		var $adLiveIn = null;
		var $adTime = null;
		var $adCountdown = null;
		
		// contains reference to videojs player
		var videoJsPlayer = null;
		// reference to the dom element which contains the video tag
		var $player = null;
		
		
		// this is necessary so that countdown is updated
		updateAdTimerId = setInterval(function() {
			updateAd();
		}, 200);
		
		// updates the ad using the queued data
		// creates/destroys the ad if necessary
		function updateAd() {
			if (queuedShowAd !== showAd) {
				if (queuedShowAd) {
					createAd();
				}
				else {
					destroyAd();
				}
				showAd = queuedShowAd;
			}
			if (!showAd) {
				// if the ad is currently not shown leave everything else queued for when it is.
				return;
			}
			
			if (queuedStartTime === null && startTime !== null) {
				// hiding start time
				$adLiveAt.hide().text("");
				currentLiveAtTxt = null;
				willBeLive = queuedWillBeLive = null;
				$adTime.hide().text("")
				currentAdTimeTxt = null;
			}
			else if (queuedStartTime !== null) {
				var currentDate = new Date();
				var showCountdown = queuedStartTime.getTime() < currentDate.getTime() + 300000 && queuedStartTime.getTime() > currentDate.getTime();
				
				var txt = null;
				if (!showCountdown) {
					txt = $.format.date(queuedStartTime.getTime(), "HH:mm on D MMM yyyy");
				}
				else {
					var secondsToGo = Math.ceil((queuedStartTime.getTime() - currentDate.getTime()) / 1000);
					var minutes = Math.floor(secondsToGo/60);
					var seconds = secondsToGo%60;
					txt = minutes+" minute"+(minutes!==1?"s":"")+" "+pad(seconds, 2)+" second"+(seconds!==1?"s":"");
				}
				
				var queuedAdLiveAtTxt = null;
				if (queuedWillBeLive) {
					queuedAdLiveAtTxt = "Live ";
				}
				else {
					queuedAdLiveAtTxt = "Available ";
				}
				willBeLive = queuedWillBeLive;
				if (showCountdown) {
					queuedAdLiveAtTxt = queuedAdLiveAtTxt+"In";
				}
				else {
					queuedAdLiveAtTxt = queuedAdLiveAtTxt+"At";
				}
				
				if (queuedAdLiveAtTxt !== currentLiveAtTxt) {
					$adLiveAt.text(queuedAdLiveAtTxt).show();
					registerFitText($adLiveAt);
					currentLiveAtTxt = queuedAdLiveAtTxt;
				}
				if (currentAdTimeTxt !== txt) {
					$adTime.text(txt).show();
					registerFitText($adTime);
					currentAdTimeTxt = txt;
				}
			}
			startTime = queuedStartTime;
			if (customMsg !== queuedCustomMsg) {
				if (queuedCustomMsg === null) {
					$adCustomMsg.hide().text("");
				}
				else {
					$adCustomMsg.text(queuedCustomMsg).show();
					registerFitText($adCustomMsg);
				}
				customMsg = queuedCustomMsg;
			}
			if (showStreamOver !== queuedShowStreamOver) {
				if (queuedShowStreamOver) {
					$adStreamOver.show();
					registerFitText($adStreamOver);
				}
				else {
					$adStreamOver.hide();
				}
				showStreamOver = queuedShowStreamOver;
			}
			if (showVodAvailableShortly !== queuedShowVodAvailableShortly) {
				if (queuedShowVodAvailableShortly) {
					$adVodAvailableShortly.show();
					registerFitText($adVodAvailableShortly);
				}
				else {
					$adVodAvailableShortly.hide();
				}
				showVodAvailableShortly = queuedShowVodAvailableShortly;
			}
		}
		
		function createAd() {
			// destroy the ad first if necessary.
			// there should never be the case where this is called and it's already there but best be safe.
			destroyAd();
			$ad = $("<div />").addClass("ad embed-responsive-item");
			var $bg = $("<div />").addClass("bg");
			var $img = $("<img />").attr("src", coverUri).addClass("img-responsive");
			$bg.append($img);
			var $overlay = $("<div />").addClass("overlay");
			$adLiveAt = $("<div />").addClass("live-at-header fit-text txt-shadow").attr("data-compressor", "1.5").hide();
			$adStreamOver = $("<div />").addClass("stream-over-msg fit-text txt-shadow").attr("data-compressor", "2.8").text("This Stream Has Now Finished").hide();
			$adVodAvailableShortly = $("<div />").addClass("vod-available-shortly-msg fit-text txt-shadow").attr("data-compressor", "2.8").text("This Will Be Available To Watch On Demand Shortly").hide();
			$adTime = $("<div />").addClass("live-time fit-text txt-shadow").attr("data-compressor", "2.1").hide();
			$adCustomMsg = $("<div />").addClass("custom-msg fit-text txt-shadow").attr("data-compressor", "2.8").hide();
			$overlay.append($adLiveAt);
			$overlay.append($adStreamOver);
			$overlay.append($adVodAvailableShortly);
			$overlay.append($adTime);
			$overlay.append($adCustomMsg);
			$ad.append($bg);
			$ad.append($overlay);
			$container.append($ad);
		}
		
		function destroyAd() {
			if ($ad === null) {
				// ad doesn't exist
				return;
			}
			$ad.remove();
			$ad = null;
		}
		
		// updates the player using the queued data.
		// creates/destroys the player if necessary
		function updatePlayer() {
			
			// determine if the player has to be reloaded or the settings can be applied in place.
			var reloadRequired = playerType !== queuedPlayerType || playerPreload !== queuedPlayerPreload || showPlayer !== queuedShowPlayer || playerUrisChanged;
			
			if (playerAutoPlay !== queuedPlayerAutoPlay) {
				playerAutoPlay = queuedPlayerAutoPlay;
			}
			
			// player needs reloading
			if (reloadRequired) {
				playerType = queuedPlayerType;
				playerPreload = queuedPlayerPreload;
				showPlayer = queuedShowPlayer;
				playerUrisChanged = false;
				if (!showPlayer) {
					destroyPlayer();
				}
				else {
					createPlayer();
				}
			}
		}
		
		// creates the player
		// if the player already exists it destroys the current one first.
		function createPlayer() {
			// destroy current player if there is one
			destroyPlayer();
		
			$player = $("<div />").addClass("player embed-responsive-item");
			var $video = $("<video />").addClass("video-js vjs-default-skin").attr("poster", coverUri);
			$player.append($video);
			videoJsPlayer = videojs($video[0], {
				width: "100%",
				height: "100%",
				controls: true,
				preload: playerPreload ? "auto" : "metadata",
				autoplay: false, // implementing autoplay manually using callback
				poster: coverUri,
				loop: false
			}, function() {
				// called when player loaded.
				$(self).triggerHandler("playerLoaded");
			});
			registerVideoJsEventHandlers();
			updateVideoJsSrcs();
			$container.append($player);
		}
		
		// removes the player
		function destroyPlayer() {
			if ($player === null) {
				// player doesn't exist.
				return;
			}
			$(self).triggerHandler("playerDestroying");
			videoJsPlayer.dispose();
			videoJsPlayer = null;
			$player.remove();
			$player = null;
			$(self).triggerHandler("playerDestroyed");
		}
		
		function updateVideoJsSrcs() {
			var sources = [];
			for (var i=0; i<playerUris.length; i++) {
				var uri = playerUris[i];
				sources.push({
					type: "video/mp4",
					src: uri
				});
			}
			videoJsPlayer.src(sources);
		}
		
		function registerVideoJsEventHandlers() {
			videoJsPlayer.on("loadedmetadata", function() {
				if (playerAutoPlay) {
					videoJsPlayer.play();
				}
			});
			videoJsPlayer.on("play", function() {
				$(self).triggerHandler("play");
			});
			videoJsPlayer.on("pause", function() {
				$(self).triggerHandler("pause");
			});
			videoJsPlayer.on("timeupdate", function() {
				$(self).triggerHandler("timeUpdate");
			});
			videoJsPlayer.on("ended", function() {
				$(self).triggerHandler("ended");
			});
		}
		
	};
});