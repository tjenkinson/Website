<?php

use uk\co\la1tv\website\commands\MediaItemEmailsSendLiveShortlyCommand;
use uk\co\la1tv\website\commands\MediaItemEmailsSendVodAvailableCommand;
use uk\co\la1tv\website\commands\DvrBridgeServiceSendPingsCommand;
use uk\co\la1tv\website\commands\DvrBridgeServiceRemoveDvrForVodCommand;
use uk\co\la1tv\website\commands\CreateSearchIndexCommand;
use uk\co\la1tv\website\commands\DeleteSearchIndexCommand;
use uk\co\la1tv\website\commands\SearchIndexCheckForItemsCommand;
use uk\co\la1tv\website\commands\UpdateSearchIndexCommand;
use uk\co\la1tv\website\commands\TriggerVODAvailableEventCommand;
use uk\co\la1tv\website\commands\TriggerDegradedServiceStateChangedEventCommand;
use uk\co\la1tv\website\commands\CheckFileStoreAvailabilityCommand;
use uk\co\la1tv\website\commands\PopularItemsCacheUpdateCommand;
use uk\co\la1tv\website\commands\RecentItemsCacheUpdateCommand;
use uk\co\la1tv\website\commands\PromotedItemsCacheUpdateCommand;
use uk\co\la1tv\website\commands\LiveItemsCacheUpdateCommand;
use uk\co\la1tv\website\commands\ClearTempChunksCommand;
use uk\co\la1tv\website\commands\ClearOldSessionsCommand;

/*
|--------------------------------------------------------------------------
| Register The Artisan Commands
|--------------------------------------------------------------------------
|
| Each available Artisan command must be registered with the console so
| that it is available to be called. We'll register every command so
| the console gets access to each of the command object instances.
|
*/

Artisan::add(new MediaItemEmailsSendLiveShortlyCommand());
Artisan::add(new MediaItemEmailsSendVodAvailableCommand());
Artisan::add(new DvrBridgeServiceSendPingsCommand());
Artisan::add(new DvrBridgeServiceRemoveDvrForVodCommand());
Artisan::add(new CreateSearchIndexCommand());
Artisan::add(new DeleteSearchIndexCommand());
// this should appear before UpdateSearchIndexCommand so that it will always run before it when scheduled to run at the same time
Artisan::add(new SearchIndexCheckForItemsCommand());
Artisan::add(new UpdateSearchIndexCommand());
Artisan::add(new TriggerVODAvailableEventCommand());
Artisan::add(new TriggerDegradedServiceStateChangedEventCommand());
Artisan::add(new CheckFileStoreAvailabilityCommand());
Artisan::add(new PopularItemsCacheUpdateCommand());
Artisan::add(new RecentItemsCacheUpdateCommand());
Artisan::add(new PromotedItemsCacheUpdateCommand());
Artisan::add(new LiveItemsCacheUpdateCommand());
Artisan::add(new ClearTempChunksCommand());
Artisan::add(new ClearOldSessionsCommand());