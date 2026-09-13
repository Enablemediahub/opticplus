<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('lens_order_requests') && ! Schema::hasColumn('lens_order_requests', 'pickup_status')) {
            Schema::table('lens_order_requests', function (Blueprint $table): void {
                $table->string('pickup_status', 30)->default('pending')->after('status');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('lens_order_requests') && Schema::hasColumn('lens_order_requests', 'pickup_status')) {
            Schema::table('lens_order_requests', function (Blueprint $table): void {
                $table->dropColumn('pickup_status');
            });
        }
    }
};
