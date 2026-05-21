<?php

use App\Database\Provisioning\SchemaBootstrapService;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('opticplus:ensure-schema', function (SchemaBootstrapService $bootstrap): void {
    $bootstrap->ensure(fromConsole: true);
    $this->info('Opticplus schema check completed (see logs for any skipped DDL).');
})->purpose('Create missing Opticplus database tables from the bundled manifest/SQL.');
