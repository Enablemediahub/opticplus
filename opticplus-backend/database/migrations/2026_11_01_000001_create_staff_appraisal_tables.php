<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('staff_appraisal_settings', function (Blueprint $table): void {
            $table->id();
            $table->unsignedInteger('branch_id')->unique();
            $table->boolean('is_enabled')->default(false);
            $table->unsignedBigInteger('updated_by')->nullable();
            $table->timestamps();
        });

        Schema::create('staff_appraisal_periods', function (Blueprint $table): void {
            $table->id();
            $table->unsignedInteger('branch_id')->index();
            $table->string('title', 160);
            $table->enum('period_type', ['daily', 'weekly', 'monthly']);
            $table->date('start_date');
            $table->date('end_date');
            $table->enum('status', ['active', 'finalized'])->default('active');
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamp('finalized_at')->nullable();
            $table->timestamps();
            $table->index(['branch_id', 'status', 'start_date', 'end_date'], 'staff_appraisal_period_lookup_idx');
        });

        Schema::create('staff_appraisal_tasks', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('period_id');
            $table->string('title', 180);
            $table->text('description')->nullable();
            $table->decimal('target_value', 12, 2)->nullable();
            $table->string('unit', 40)->nullable();
            $table->decimal('weight', 6, 2)->default(1);
            $table->enum('measurement', ['checklist', 'target'])->default('checklist');
            $table->string('assigned_role', 40)->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
            $table->foreign('period_id')->references('id')->on('staff_appraisal_periods')->cascadeOnDelete();
        });

        Schema::create('staff_appraisal_assignments', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('task_id');
            $table->unsignedBigInteger('user_id');
            $table->string('role_snapshot', 40);
            $table->enum('status', ['pending', 'in_progress', 'completed'])->default('pending');
            $table->decimal('achieved_value', 12, 2)->nullable();
            $table->text('staff_note')->nullable();
            $table->timestamp('acknowledged_at')->nullable();
            $table->timestamp('submitted_at')->nullable();
            $table->decimal('manager_score', 5, 2)->nullable();
            $table->text('manager_note')->nullable();
            $table->unsignedBigInteger('reviewed_by')->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamps();
            $table->foreign('task_id')->references('id')->on('staff_appraisal_tasks')->cascadeOnDelete();
            $table->unique(['task_id', 'user_id'], 'staff_appraisal_task_user_unique');
            $table->index(['user_id', 'status'], 'staff_appraisal_user_status_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('staff_appraisal_assignments');
        Schema::dropIfExists('staff_appraisal_tasks');
        Schema::dropIfExists('staff_appraisal_periods');
        Schema::dropIfExists('staff_appraisal_settings');
    }
};
