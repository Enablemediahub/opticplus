<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('working_capital_liabilities')) {
            return;
        }

        Schema::create('working_capital_liabilities', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('branch_id')->index();
            $table->date('as_of_date')->index();
            $table->enum('liability_type', ['trade_creditors', 'staff_creditors', 'accrued_expenses', 'other_actuals']);
            $table->string('description');
            $table->decimal('amount', 15, 2);
            $table->text('notes')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('working_capital_liabilities');
    }
};
