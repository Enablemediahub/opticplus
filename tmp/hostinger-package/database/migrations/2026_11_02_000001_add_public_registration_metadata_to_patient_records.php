<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('patient_records')) return;

        Schema::table('patient_records', function (Blueprint $table): void {
            if (! Schema::hasColumn('patient_records', 'registration_source')) {
                $table->string('registration_source', 32)->nullable();
            }
            if (! Schema::hasColumn('patient_records', 'privacy_consent_at')) {
                $table->timestamp('privacy_consent_at')->nullable();
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('patient_records')) return;

        $columns = [];
        if (Schema::hasColumn('patient_records', 'registration_source')) $columns[] = 'registration_source';
        if (Schema::hasColumn('patient_records', 'privacy_consent_at')) $columns[] = 'privacy_consent_at';
        if ($columns) Schema::table('patient_records', fn (Blueprint $table) => $table->dropColumn($columns));
    }
};
