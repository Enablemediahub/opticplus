<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('hr_staff_communications')) {
            Schema::create('hr_staff_communications', function (Blueprint $table): void {
                $table->id();
                $table->unsignedInteger('employee_id')->nullable()->index();
                $table->string('title', 180);
                $table->text('message')->nullable();
                $table->string('attachment_path')->nullable();
                $table->string('attachment_name')->nullable();
                $table->unsignedBigInteger('created_by')->nullable();
                $table->timestamp('published_at')->index();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('hr_staff_communication_reads')) {
            Schema::create('hr_staff_communication_reads', function (Blueprint $table): void {
                $table->id();
                $table->unsignedBigInteger('communication_id');
                $table->unsignedInteger('employee_id');
                $table->timestamp('read_at');
                $table->timestamps();
                $table->unique(['communication_id', 'employee_id'], 'hr_staff_communication_reads_unique');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('hr_staff_communication_reads');
        Schema::dropIfExists('hr_staff_communications');
    }
};
