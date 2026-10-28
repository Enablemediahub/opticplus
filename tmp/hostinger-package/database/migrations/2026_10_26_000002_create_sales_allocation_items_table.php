<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('sales_allocation_items')) {
            Schema::create('sales_allocation_items', function (Blueprint $table): void {
                $table->id();
                $table->unsignedInteger('branch_id');
                $table->string('name', 100);
                $table->decimal('allocation_percent', 5, 2);
                $table->decimal('target_amount', 15, 2)->nullable();
                $table->enum('treatment', ['bank', 'savings'])->default('savings');
                $table->boolean('is_active')->default(true);
                $table->unsignedBigInteger('created_by')->nullable();
                $table->timestamps();
                $table->index(['branch_id', 'is_active']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('sales_allocation_items');
    }
};
