<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('bank_sms_devices', 'sync_request_version')) {
            Schema::table('bank_sms_devices', function (Blueprint $table): void {
                $table->unsignedBigInteger('sync_request_version')->default(0);
            });
        }
        if (! Schema::hasColumn('bank_sms_devices', 'sync_completed_version')) {
            Schema::table('bank_sms_devices', function (Blueprint $table): void {
                $table->unsignedBigInteger('sync_completed_version')->default(0);
            });
        }
    }

    public function down(): void
    {
        Schema::table('bank_sms_devices', function (Blueprint $table): void {
            $table->dropColumn(['sync_request_version', 'sync_completed_version']);
        });
    }
};
