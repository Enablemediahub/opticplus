<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('monitor_budgets', function (Blueprint $table): void {
            $table->id();
            $table->unsignedInteger('branch_id');
            $table->unsignedSmallInteger('year');
            $table->string('line_key', 100);
            $table->decimal('amount', 15, 2)->default(0);
            $table->timestamps();
            $table->unique(['branch_id', 'year', 'line_key']);
        });
    }

    public function down(): void { Schema::dropIfExists('monitor_budgets'); }
};
