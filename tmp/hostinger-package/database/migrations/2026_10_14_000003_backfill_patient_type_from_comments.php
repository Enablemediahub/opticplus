<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('patient_records') || ! Schema::hasColumn('patient_records', 'patient_type')) {
            return;
        }

        DB::table('patient_records')
            ->whereNull('patient_type')
            ->whereNotNull('comment')
            ->whereRaw('LOWER(comment) LIKE ?', ['%new patient%'])
            ->whereRaw('LOWER(comment) NOT LIKE ?', ['%old patient%'])
            ->update(['patient_type' => 'new']);

        DB::table('patient_records')
            ->whereNull('patient_type')
            ->whereNotNull('comment')
            ->whereRaw('LOWER(comment) LIKE ?', ['%old patient%'])
            ->whereRaw('LOWER(comment) NOT LIKE ?', ['%new patient%'])
            ->update(['patient_type' => 'old']);
    }

    public function down(): void
    {
        // Keep the backfilled classifications; staff may have since confirmed or corrected them.
    }
};
