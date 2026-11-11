<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('bank_sms_approval_policies', function (Blueprint $table): void {
            $table->unsignedInteger('branch_id')->primary();
            $table->boolean('auto_approve')->default(false);
            $table->unsignedBigInteger('updated_by')->nullable();
            $table->timestamps();
        });

        Schema::table('bank_sms_alerts', function (Blueprint $table): void {
            $table->string('review_method', 16)->default('manual')->after('status');
        });
    }

    public function down(): void
    {
        Schema::table('bank_sms_alerts', function (Blueprint $table): void {
            $table->dropColumn('review_method');
        });

        Schema::dropIfExists('bank_sms_approval_policies');
    }
};
