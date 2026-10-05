<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('lens_order_requests')) {
            return;
        }

        Schema::create('lens_order_requests', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('branch_id');
            $table->string('source', 30);
            $table->string('source_id', 80);
            $table->unsignedBigInteger('placed_by')->nullable();
            $table->string('status', 30)->default('placed');
            $table->timestamps();
            $table->unique(['branch_id', 'source', 'source_id']);
            $table->index(['branch_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('lens_order_requests');
    }
};
