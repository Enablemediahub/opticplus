<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('working_capital_entry_approvals')) {
            return;
        }

        Schema::create('working_capital_entry_approvals', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('branch_id');
            $table->date('period_month');
            $table->timestamp('approved_at')->nullable();
            $table->unsignedBigInteger('approved_by')->nullable();
            $table->timestamp('reopened_at')->nullable();
            $table->unsignedBigInteger('reopened_by')->nullable();
            $table->timestamps();
            $table->unique(['branch_id', 'period_month']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('working_capital_entry_approvals');
    }
};