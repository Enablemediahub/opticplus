<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('hr_letters', function (Blueprint $table): void {
            $table->id();
            $table->unsignedInteger('employee_id')->nullable()->index();
            $table->string('title', 180);
            $table->longText('body');
            $table->string('status', 24)->default('draft')->index();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamp('published_at')->nullable();
            $table->timestamps();
        });

        Schema::create('hr_letter_templates', function (Blueprint $table): void {
            $table->id();
            $table->string('title', 180);
            $table->longText('body');
            $table->boolean('active')->default(true)->index();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();
        });

        Schema::create('hr_requests', function (Blueprint $table): void {
            $table->id();
            $table->unsignedInteger('employee_id')->index();
            $table->string('request_type', 32)->index();
            $table->date('start_date')->nullable();
            $table->date('end_date')->nullable();
            $table->text('reason');
            $table->string('attachment_path')->nullable();
            $table->string('attachment_name')->nullable();
            $table->string('status', 24)->default('pending')->index();
            $table->text('review_note')->nullable();
            $table->unsignedBigInteger('reviewed_by')->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamp('submitted_at')->nullable();
            $table->timestamps();
        });

        Schema::create('hr_kpi_rules', function (Blueprint $table): void {
            $table->id();
            $table->string('title', 180);
            $table->text('description')->nullable();
            $table->decimal('target_value', 10, 2)->nullable();
            $table->decimal('full_score_allowance', 12, 2)->default(0);
            $table->boolean('active')->default(true)->index();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();
        });

        Schema::create('hr_kpi_results', function (Blueprint $table): void {
            $table->id();
            $table->unsignedInteger('employee_id')->index();
            $table->unsignedBigInteger('rule_id')->index();
            $table->char('period', 7)->index();
            $table->decimal('score', 5, 2);
            $table->decimal('calculated_allowance', 12, 2)->default(0);
            $table->string('status', 24)->default('draft')->index();
            $table->text('notes')->nullable();
            $table->unsignedBigInteger('evaluated_by')->nullable();
            $table->unsignedBigInteger('reviewed_by')->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamps();
            $table->unique(['employee_id', 'rule_id', 'period'], 'hr_kpi_employee_rule_period_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('hr_kpi_results');
        Schema::dropIfExists('hr_kpi_rules');
        Schema::dropIfExists('hr_requests');
        Schema::dropIfExists('hr_letters');
        Schema::dropIfExists('hr_letter_templates');
    }
};
