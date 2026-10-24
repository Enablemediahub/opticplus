<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('expense_approval_requests')) {
            return;
        }

        Schema::create('expense_approval_requests', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('branch_id')->index();
            $table->string('description', 255);
            $table->decimal('amount', 12, 2);
            $table->date('date');
            $table->string('category', 50);
            $table->string('document_type', 40);
            $table->longText('supporting_document_json');
            $table->string('status', 20)->default('pending');
            $table->unsignedBigInteger('submitted_by')->index();
            $table->string('submitted_role', 40);
            $table->timestamp('submitted_at');
            $table->unsignedBigInteger('reviewed_by')->nullable()->index();
            $table->timestamp('reviewed_at')->nullable();
            $table->text('decision_note')->nullable();
            $table->unsignedBigInteger('resulting_expense_id')->nullable();
            $table->timestamps();
            $table->index(['branch_id', 'status', 'submitted_at'], 'expense_approval_branch_status_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('expense_approval_requests');
    }
};
