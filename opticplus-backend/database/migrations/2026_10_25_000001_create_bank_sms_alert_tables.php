<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('bank_accounts', function (Blueprint $table): void {
            $table->id();
            $table->unsignedInteger('branch_id')->index();
            $table->string('bank_name', 80);
            $table->string('account_suffix', 4);
            $table->string('account_label', 80)->nullable();
            $table->decimal('reported_balance', 12, 2)->nullable();
            $table->timestamp('reported_balance_at')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->unique(['branch_id', 'bank_name', 'account_suffix'], 'bank_accounts_branch_bank_suffix_unique');
        });

        Schema::create('bank_sms_devices', function (Blueprint $table): void {
            $table->id();
            $table->unsignedInteger('branch_id')->index();
            $table->string('label', 100);
            $table->char('token_hash', 64)->unique();
            $table->string('token_hint', 8);
            $table->unsignedBigInteger('created_by')->nullable()->index();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamp('revoked_at')->nullable();
            $table->timestamps();
        });

        Schema::create('bank_sms_alerts', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('bank_account_id')->nullable()->index();
            $table->unsignedBigInteger('device_id')->nullable()->index();
            $table->unsignedInteger('branch_id')->nullable()->index();
            $table->string('sender', 40);
            $table->string('account_suffix', 4);
            $table->string('direction', 12);
            $table->decimal('amount', 12, 2);
            $table->string('transaction_reference', 80);
            $table->date('transaction_date');
            $table->decimal('available_balance', 12, 2);
            $table->timestamp('received_at');
            $table->string('status', 16)->default('pending')->index();
            $table->unsignedBigInteger('reviewed_by')->nullable()->index();
            $table->timestamp('reviewed_at')->nullable();
            $table->unsignedBigInteger('bank_deposit_id')->nullable()->index();
            $table->timestamps();
            $table->unique(
                ['sender', 'account_suffix', 'transaction_reference'],
                'bank_sms_alert_reference_unique'
            );
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('bank_sms_alerts');
        Schema::dropIfExists('bank_sms_devices');
        Schema::dropIfExists('bank_accounts');
    }
};
