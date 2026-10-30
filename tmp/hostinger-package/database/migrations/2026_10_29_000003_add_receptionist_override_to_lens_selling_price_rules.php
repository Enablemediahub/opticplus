<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('lens_selling_price_rules') && ! Schema::hasColumn('lens_selling_price_rules', 'receptionist_override_allowed')) {
            Schema::table('lens_selling_price_rules', function (Blueprint $table): void {
                $table->boolean('receptionist_override_allowed')->default(true)->after('status');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('lens_selling_price_rules') && Schema::hasColumn('lens_selling_price_rules', 'receptionist_override_allowed')) {
            Schema::table('lens_selling_price_rules', function (Blueprint $table): void {
                $table->dropColumn('receptionist_override_allowed');
            });
        }
    }
};
