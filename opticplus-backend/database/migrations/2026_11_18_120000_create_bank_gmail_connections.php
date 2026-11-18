<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('bank_gmail_connections', function (Blueprint $table): void {
            $table->unsignedTinyInteger('id')->primary()->default(1);
            $table->string('email', 255)->nullable();
            $table->text('access_token')->nullable();
            $table->text('refresh_token')->nullable();
            $table->timestamp('token_expires_at')->nullable();
            $table->timestamp('last_synced_at')->nullable();
            $table->timestamp('last_sync_message_at')->nullable();
            $table->string('oauth_state', 64)->nullable();
            $table->text('last_error')->nullable();
            $table->timestamps();
        });

        Schema::create('bank_gmail_messages', function (Blueprint $table): void {
            $table->id();
            $table->string('gmail_message_id', 255)->unique();
            $table->string('sender', 255);
            $table->string('account_suffix', 4)->nullable();
            $table->decimal('current_balance', 12, 2);
            $table->decimal('available_balance', 12, 2)->nullable();
            $table->timestamp('email_at');
            $table->timestamp('processed_at');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('bank_gmail_messages');
        Schema::dropIfExists('bank_gmail_connections');
    }
};
