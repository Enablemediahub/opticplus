<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('billing_refunds')) {
            Schema::create('billing_refunds', function (Blueprint $table): void {
                $table->id();
                $table->unsignedBigInteger('billing_id');
                $table->unsignedInteger('branch_id');
                $table->decimal('amount', 12, 2);
                $table->string('component', 30);
                $table->string('refund_method', 100);
                $table->text('reason');
                $table->unsignedBigInteger('authorized_by')->nullable();
                $table->string('authorized_by_name', 255);
                $table->string('authorized_role', 50);
                $table->unsignedBigInteger('expense_id')->nullable();
                $table->unsignedBigInteger('sale_id')->nullable()->unique();
                $table->timestamp('refunded_at');
                $table->timestamps();
                $table->index(['branch_id', 'billing_id']);
                $table->index(['branch_id', 'refunded_at']);
                $table->index(['branch_id', 'component', 'refunded_at']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('billing_refunds');
    }
};
