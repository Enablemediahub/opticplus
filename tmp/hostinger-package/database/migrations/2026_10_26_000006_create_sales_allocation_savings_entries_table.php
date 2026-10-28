<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('sales_allocation_savings_entries')) {
            return;
        }

        Schema::create('sales_allocation_savings_entries', function (Blueprint $table): void {
            $table->id();
            $table->unsignedInteger('branch_id');
            $table->unsignedBigInteger('allocation_item_id');
            $table->date('target_date');
            $table->date('set_aside_date');
            $table->decimal('amount', 12, 2);
            $table->unsignedInteger('expense_id')->nullable()->unique();
            $table->unsignedBigInteger('recorded_by')->nullable();
            $table->timestamps();
            $table->index(['branch_id', 'allocation_item_id', 'target_date'], 'sales_alloc_savings_target_idx');
            $table->index(['branch_id', 'set_aside_date'], 'sales_alloc_savings_saved_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sales_allocation_savings_entries');
    }
};
