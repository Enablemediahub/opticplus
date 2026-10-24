<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('insurance_remittance_allocations')) return;
        Schema::create('insurance_remittance_allocations', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('remittance_id');
            $table->string('insurance_provider', 80);
            $table->date('claim_month');
            $table->decimal('amount_paid', 12, 2);
            $table->unsignedBigInteger('branch_id');
            $table->timestamps();
            $table->index(['branch_id', 'claim_month', 'insurance_provider'], 'insurance_alloc_month_provider_idx');
            $table->index('remittance_id', 'insurance_alloc_remittance_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('insurance_remittance_allocations');
    }
};
