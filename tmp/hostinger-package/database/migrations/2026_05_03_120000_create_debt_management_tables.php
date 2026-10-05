<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Company debt register + servicing (debt_payments) + reminders.
 * Matches DebtController expectations and legacy Opticplus SQL dumps.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('debts')) {
            Schema::create('debts', function (Blueprint $table) {
                $table->id();
                $table->string('debtor_name');
                $table->enum('debt_type', ['loan', 'supplier_credit', 'overdraft', 'lease', 'other'])->default('loan');
                $table->string('category', 100);
                $table->text('description')->nullable();
                $table->decimal('principal_amount', 15, 2);
                $table->decimal('interest_rate', 5, 2)->nullable();
                $table->enum('interest_type', ['fixed', 'variable', 'none'])->default('fixed');
                $table->decimal('total_amount', 15, 2);
                $table->decimal('amount_paid', 15, 2)->default(0);
                $table->decimal('monthly_payment', 15, 2)->nullable();
                $table->string('lender_name')->nullable();
                $table->string('lender_contact')->nullable();
                $table->string('lender_phone', 20)->nullable();
                $table->string('lender_email', 100)->nullable();
                $table->date('start_date');
                $table->date('due_date');
                $table->unsignedInteger('term_months')->nullable();
                $table->enum('payment_frequency', ['monthly', 'quarterly', 'annually', 'one-time'])->default('monthly');
                $table->date('next_payment_date')->nullable();
                $table->decimal('next_payment_amount', 15, 2)->nullable();
                $table->enum('status', ['active', 'paid', 'defaulted', 'restructured', 'pending'])->default('active');
                $table->text('collateral')->nullable();
                $table->text('notes')->nullable();
                $table->unsignedBigInteger('created_by')->nullable();
                $table->unsignedBigInteger('branch_id')->nullable()->index();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('debt_payments')) {
            Schema::create('debt_payments', function (Blueprint $table) {
                $table->id();
                $table->foreignId('debt_id')->constrained('debts')->cascadeOnDelete();
                $table->date('payment_date');
                $table->decimal('amount', 15, 2);
                $table->enum('payment_method', ['cash', 'bank_transfer', 'cheque', 'mobile_money', 'other']);
                $table->string('reference_number', 100)->nullable();
                $table->string('receipt_path')->nullable();
                $table->text('notes')->nullable();
                $table->unsignedBigInteger('recorded_by')->nullable();
                $table->unsignedBigInteger('branch_id')->nullable()->index();
                $table->timestamp('created_at')->useCurrent();
            });
        }

        if (! Schema::hasTable('debt_reminders')) {
            Schema::create('debt_reminders', function (Blueprint $table) {
                $table->id();
                $table->foreignId('debt_id')->constrained('debts')->cascadeOnDelete();
                $table->date('reminder_date');
                $table->enum('reminder_type', ['payment_due', 'late_payment', 'review', 'other']);
                $table->text('message');
                $table->string('sent_to')->nullable();
                $table->enum('sent_via', ['email', 'sms', 'notification'])->nullable();
                $table->enum('status', ['pending', 'sent', 'cancelled'])->default('pending');
                $table->dateTime('sent_at')->nullable();
                $table->unsignedBigInteger('branch_id')->nullable()->index();
                $table->timestamp('created_at')->useCurrent();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('debt_reminders');
        Schema::dropIfExists('debt_payments');
        Schema::dropIfExists('debts');
    }
};
