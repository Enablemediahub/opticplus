<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Console\Scheduling\Schedule;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withSchedule(function (Schedule $schedule): void {
        $schedule->call(function (): void {
            if (! \Illuminate\Support\Facades\Schema::hasTable('bank_gmail_connections')) {
                return;
            }
            $connection = \Illuminate\Support\Facades\DB::table('bank_gmail_connections')->where('id', 1)->first(['refresh_token']);
            if ($connection?->refresh_token) {
                app(\App\Services\GtBankGmailService::class)->sync();
            }
        })->everyFiveMinutes()->name('sync-gtbank-gmail');
    })
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias([
            'auth.token' => \App\Http\Middleware\AuthenticateApiToken::class,
            'auth.bank-alert-device' => \App\Http\Middleware\AuthenticateBankAlertDevice::class,
            'audit.mutations' => \App\Http\Middleware\AuditMutationTrail::class,
            'idempotency' => \App\Http\Middleware\PreventDuplicateSubmission::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        //
    })->create();
