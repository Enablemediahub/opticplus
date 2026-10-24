<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('billing') || ! Schema::hasColumn('billing', 'status')) {
            return;
        }

        DB::statement("UPDATE billing SET status = CASE
            WHEN status = 'draft' THEN 'draft'
            WHEN COALESCE(balance, 0) <= 0.005 THEN 'paid'
            WHEN COALESCE(balance, 0) < COALESCE(total_amount, 0) - 0.005 THEN 'partially_paid'
            ELSE 'pending'
        END");
    }

    public function down(): void
    {
        // Statuses are derived from current balances; there is no safe historical value to restore.
    }
};
