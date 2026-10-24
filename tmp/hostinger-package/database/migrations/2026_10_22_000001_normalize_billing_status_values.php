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

        if (DB::getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE billing MODIFY COLUMN status ENUM('draft','pending','balance_remaining','insurance_pending','partially_paid','paid','completed') NOT NULL DEFAULT 'pending'");
        }

        DB::statement("UPDATE billing SET status = CASE
            WHEN status = 'draft' THEN 'draft'
            WHEN COALESCE(balance, 0) <= 0.005 THEN 'paid'
            WHEN COALESCE(balance, 0) < COALESCE(total_amount, 0) - 0.005 THEN 'partially_paid'
            ELSE 'pending'
        END");

        if (DB::getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE billing MODIFY COLUMN status ENUM('draft','pending','partially_paid','paid') NOT NULL DEFAULT 'pending'");
        }
    }

    public function down(): void
    {
        if (! Schema::hasTable('billing') || ! Schema::hasColumn('billing', 'status')) {
            return;
        }

        if (DB::getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE billing MODIFY COLUMN status ENUM('draft','pending','partially_paid','balance_remaining','insurance_pending','paid','completed') NOT NULL DEFAULT 'pending'");
        }

        DB::table('billing')->where('status', 'partially_paid')->update(['status' => 'balance_remaining']);

        if (DB::getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE billing MODIFY COLUMN status ENUM('draft','pending','balance_remaining','insurance_pending','paid','completed') NOT NULL DEFAULT 'balance_remaining'");
        }
    }
};
