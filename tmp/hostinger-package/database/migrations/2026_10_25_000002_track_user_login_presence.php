<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('users', 'last_login_at')) {
            Schema::table('users', function (Blueprint $table): void {
                $table->timestamp('last_login_at')->nullable();
            });
        }

        if (! Schema::hasTable('user_presence_sessions')) {
            Schema::create('user_presence_sessions', function (Blueprint $table): void {
                $table->id();
                $table->unsignedBigInteger('user_id')->index();
                $table->unsignedInteger('branch_id')->nullable()->index();
                $table->char('token_hash', 64)->unique();
                $table->timestamp('last_seen_at')->index();
                $table->timestamp('logged_out_at')->nullable();
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('user_presence_sessions');

        if (Schema::hasColumn('users', 'last_login_at')) {
            Schema::table('users', function (Blueprint $table): void {
                $table->dropColumn('last_login_at');
            });
        }
    }
};
