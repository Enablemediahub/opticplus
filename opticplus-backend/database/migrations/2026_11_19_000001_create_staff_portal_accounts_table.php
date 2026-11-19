<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('staff_portal_accounts', function (Blueprint $table): void {
            $table->id();
            $table->unsignedInteger('employee_id')->unique();
            $table->string('staff_id', 20)->unique();
            $table->string('password');
            $table->boolean('must_change_password')->default(true);
            $table->unsignedInteger('session_version')->default(1);
            $table->unsignedTinyInteger('failed_attempts')->default(0);
            $table->timestamp('locked_until')->nullable();
            $table->timestamp('last_login_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('staff_portal_accounts');
    }
};
