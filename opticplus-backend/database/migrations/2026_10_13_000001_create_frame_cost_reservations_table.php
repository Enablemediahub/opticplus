<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('frame_cost_reservations')) {
            Schema::create('frame_cost_reservations', function (Blueprint $table): void {
                $table->id();
                $table->unsignedBigInteger('branch_id');
                $table->unsignedBigInteger('frame_sale_id');
                $table->unsignedBigInteger('product_id');
                $table->decimal('reserved_cost', 10, 2);
                $table->unsignedBigInteger('reserved_by')->nullable();
                $table->timestamps();
                $table->unique(['branch_id', 'frame_sale_id']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('frame_cost_reservations');
    }
};
