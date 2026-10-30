<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('lens_selling_price_settings')) {
            Schema::create('lens_selling_price_settings', function (Blueprint $table): void {
                $table->unsignedBigInteger('branch_id')->primary();
                $table->boolean('receptionist_override_allowed')->default(true);
                $table->unsignedBigInteger('updated_by')->nullable();
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('lens_selling_price_settings');
    }
};
