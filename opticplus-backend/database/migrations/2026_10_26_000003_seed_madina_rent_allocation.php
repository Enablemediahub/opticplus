<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (
            ! Schema::hasTable('sales_allocation_items')
            || DB::table('sales_allocation_items')
                ->where('branch_id', 2)
                ->whereRaw('LOWER(TRIM(name)) = ?', ['rent'])
                ->exists()
        ) {
            return;
        }

        $now = now();
        DB::table('sales_allocation_items')->insert([
            'branch_id' => 2,
            'name' => 'Rent',
            'allocation_percent' => 0,
            'target_amount' => 60000,
            'treatment' => 'savings',
            'is_active' => true,
            'created_by' => null,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
    }

    public function down(): void
    {
        DB::table('sales_allocation_items')
            ->where('branch_id', 2)
            ->where('name', 'Rent')
            ->where('allocation_percent', 0)
            ->where('target_amount', 60000)
            ->where('treatment', 'savings')
            ->delete();
    }
};
