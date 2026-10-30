<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('lens_selling_price_requests')) {
            return;
        }

        Schema::create('lens_selling_price_requests', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('branch_id');
            $table->unsignedBigInteger('patient_id')->nullable();
            $table->unsignedBigInteger('prescription_id')->nullable();
            $table->unsignedBigInteger('requested_by')->nullable();
            $table->string('status', 30)->default('pending');
            $table->decimal('requested_price', 12, 2)->nullable();
            $table->string('lens_type', 255)->nullable();
            $table->string('lens_material', 255)->nullable();
            $table->string('sph_od', 20)->nullable();
            $table->string('sph_os', 20)->nullable();
            $table->string('cyl_od', 20)->nullable();
            $table->string('cyl_os', 20)->nullable();
            $table->string('add_od', 20)->nullable();
            $table->string('add_os', 20)->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->index(['branch_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('lens_selling_price_requests');
    }
};
