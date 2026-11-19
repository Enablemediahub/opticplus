<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('hr_staff_signatures', function (Blueprint $table): void {
            $table->id();
            $table->unsignedInteger('employee_id')->unique();
            $table->string('file_path', 255);
            $table->string('mime_type', 64);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('hr_staff_signatures');
    }
};
