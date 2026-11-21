<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('customer_followups', function (Blueprint $table): void {
            $table->id();
            $table->unsignedInteger('branch_id');
            $table->unsignedBigInteger('billing_id');
            $table->unsignedBigInteger('patient_id')->nullable();
            $table->string('folder_id', 60)->nullable();
            $table->timestamp('pickup_at');
            $table->string('milestone', 32);
            $table->date('due_at');
            $table->string('status', 24)->default('pending');
            $table->unsignedSmallInteger('attempt_count')->default(0);
            $table->timestamp('last_attempt_at')->nullable();
            $table->timestamp('next_attempt_at')->nullable();
            $table->unsignedBigInteger('completed_by')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->string('complaint_status', 24)->default('none');
            $table->text('complaint_resolution_notes')->nullable();
            $table->unsignedBigInteger('complaint_resolved_by')->nullable();
            $table->timestamp('complaint_resolved_at')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();

            $table->unique(['billing_id', 'milestone'], 'customer_followups_billing_milestone_unique');
            $table->index(['branch_id', 'status', 'due_at'], 'customer_followups_branch_queue_index');
            $table->index(['branch_id', 'complaint_status'], 'customer_followups_branch_complaints_index');
        });

        Schema::create('customer_followup_attempts', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('followup_id')
                ->constrained('customer_followups')
                ->cascadeOnDelete();
            $table->unsignedBigInteger('attempted_by');
            $table->timestamp('attempted_at');
            $table->string('contact_result', 32);
            $table->string('wearing_frequency', 24)->nullable();
            $table->string('vision_response', 24)->nullable();
            $table->string('complaint_category', 40)->default('none');
            $table->text('complaint_notes')->nullable();
            $table->boolean('needs_optometrist_review')->default(false);
            $table->timestamp('next_attempt_at')->nullable();
            $table->text('call_notes')->nullable();
            $table->timestamps();

            $table->index(['attempted_by', 'attempted_at'], 'customer_followup_attempts_staff_date_index');
            $table->index(['followup_id', 'attempted_at'], 'customer_followup_attempts_history_index');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customer_followup_attempts');
        Schema::dropIfExists('customer_followups');
    }
};
