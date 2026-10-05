<?php

use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Route;

$frontendEntry = public_path('index.html');

Route::get('/', function () use ($frontendEntry) {
    abort_unless(File::exists($frontendEntry), 404, 'Frontend build not found.');

    return response()->file($frontendEntry);
});

Route::fallback(function () use ($frontendEntry) {
    if (request()->is('api/*')) {
        abort(404);
    }

    abort_unless(File::exists($frontendEntry), 404, 'Frontend build not found.');

    return response()->file($frontendEntry);
});
