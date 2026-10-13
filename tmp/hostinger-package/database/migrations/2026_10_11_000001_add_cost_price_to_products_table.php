<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('products') && ! Schema::hasColumn('products', 'cost_price')) {
            Schema::table('products', function (Blueprint $table): void {
                $table->decimal('cost_price', 10, 2)->nullable()->after('max_price');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('products') && Schema::hasColumn('products', 'cost_price')) {
            Schema::table('products', function (Blueprint $table): void {
                $table->dropColumn('cost_price');
            });
        }
    }
};
