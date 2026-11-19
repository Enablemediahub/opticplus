<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('hr_letter_manager_signatures')) {
            return;
        }

        Schema::create('hr_letter_manager_signatures', function (Blueprint $table): void {
            $table->unsignedTinyInteger('id')->primary();
            $table->string('file_path', 255);
            $table->string('mime_type', 64);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        if (Schema::hasTable('hr_letter_manager_signatures')) {
            Schema::drop('hr_letter_manager_signatures');
        }
    }
};
