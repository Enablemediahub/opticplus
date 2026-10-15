<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('patient_records') && ! Schema::hasColumn('patient_records', 'patient_type')) {
            Schema::table('patient_records', function (Blueprint $table): void {
                $table->string('patient_type', 10)->nullable()->after('purpose')->index();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('patient_records') && Schema::hasColumn('patient_records', 'patient_type')) {
            Schema::table('patient_records', function (Blueprint $table): void {
                $table->dropIndex(['patient_type']);
                $table->dropColumn('patient_type');
            });
        }
    }
};
