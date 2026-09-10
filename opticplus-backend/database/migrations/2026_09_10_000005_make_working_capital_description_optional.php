<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('working_capital_liabilities') && Schema::hasColumn('working_capital_liabilities', 'description')) {
            Schema::table('working_capital_liabilities', function (Blueprint $table): void {
                $table->string('description')->nullable()->change();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('working_capital_liabilities') && Schema::hasColumn('working_capital_liabilities', 'description')) {
            Schema::table('working_capital_liabilities', function (Blueprint $table): void {
                $table->string('description')->nullable(false)->change();
            });
        }
    }
};