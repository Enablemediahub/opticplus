<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('lens_selling_price_rules')) {
            return;
        }

        Schema::create('lens_selling_price_rules', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('branch_id');
            $table->string('category', 255)->nullable();
            $table->string('lens_type', 255);
            $table->string('lens_material', 255)->nullable();
            $table->string('lens_index', 50)->nullable();
            $table->string('sph_range', 100)->nullable();
            $table->string('cyl_range', 100)->nullable();
            $table->string('add_range', 100)->nullable();
            $table->string('price_label', 100)->nullable();
            $table->decimal('selling_price', 12, 2);
            $table->text('notes')->nullable();
            $table->text('prescription_examples')->nullable();
            $table->string('status', 30)->default('approved');
            $table->unsignedBigInteger('created_by')->nullable();
            $table->unsignedBigInteger('updated_by')->nullable();
            $table->timestamps();
            $table->index(['branch_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('lens_selling_price_rules');
    }
};
