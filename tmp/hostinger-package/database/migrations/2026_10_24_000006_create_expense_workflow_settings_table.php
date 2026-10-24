<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('expense_workflow_settings')) {
            return;
        }

        Schema::create('expense_workflow_settings', function (Blueprint $table): void {
            $table->unsignedTinyInteger('id')->primary();
            $table->decimal('accountant_memo_threshold', 12, 2)->default(1000);
            $table->decimal('receptionist_direct_limit', 12, 2)->default(1000);
            $table->unsignedBigInteger('updated_by')->nullable();
            $table->timestamps();
        });

        DB::table('expense_workflow_settings')->insert([
            'id' => 1,
            'accountant_memo_threshold' => 1000,
            'receptionist_direct_limit' => 1000,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('expense_workflow_settings');
    }
};
