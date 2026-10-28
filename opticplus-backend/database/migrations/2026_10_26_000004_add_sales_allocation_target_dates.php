<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('sales_allocation_items', 'target_date')) {
            Schema::table('sales_allocation_items', function (Blueprint $table): void {
                $table->date('target_date')->nullable()->after('target_amount');
            });
        }

        DB::table('sales_allocation_items')
            ->where('branch_id', 2)
            ->whereRaw('LOWER(TRIM(name)) = ?', ['rent'])
            ->where('target_amount', 60000)
            ->whereNull('target_date')
            ->update(['target_date' => '2027-07-01']);
    }

    public function down(): void
    {
        if (Schema::hasColumn('sales_allocation_items', 'target_date')) {
            Schema::table('sales_allocation_items', function (Blueprint $table): void {
                $table->dropColumn('target_date');
            });
        }
    }
};
