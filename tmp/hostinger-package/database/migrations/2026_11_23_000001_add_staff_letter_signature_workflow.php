<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('hr_letters', function (Blueprint $table): void {
            $table->boolean('requires_signature')->default(false);
        });

        Schema::table('hr_letter_templates', function (Blueprint $table): void {
            $table->boolean('requires_signature')->default(false);
        });

        Schema::create('hr_letter_signatures', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('letter_id');
            $table->unsignedInteger('employee_id');
            $table->string('signature_path', 255);
            $table->string('mime_type', 64);
            $table->timestamp('signed_at');
            $table->timestamps();
            $table->unique(['letter_id', 'employee_id'], 'hr_letter_signatures_letter_employee_unique');
            $table->index('employee_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('hr_letter_signatures');

        Schema::table('hr_letter_templates', function (Blueprint $table): void {
            $table->dropColumn('requires_signature');
        });

        Schema::table('hr_letters', function (Blueprint $table): void {
            $table->dropColumn('requires_signature');
        });
    }
};
