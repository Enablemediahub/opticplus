<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('bank_sms_devices', 'alert_source')) {
            Schema::table('bank_sms_devices', function (Blueprint $table): void {
                $table->string('alert_source', 16)->default('both')->after('label');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('bank_sms_devices', 'alert_source')) {
            Schema::table('bank_sms_devices', function (Blueprint $table): void {
                $table->dropColumn('alert_source');
            });
        }
    }
};
