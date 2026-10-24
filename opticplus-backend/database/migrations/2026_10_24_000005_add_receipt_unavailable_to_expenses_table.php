<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('expenses') || Schema::hasColumn('expenses', 'receipt_unavailable')) {
            return;
        }

        Schema::table('expenses', function (Blueprint $table): void {
            $table->boolean('receipt_unavailable')->default(false)->after('category');
        });
    }

    public function down(): void
    {
        if (Schema::hasColumn('expenses', 'receipt_unavailable')) {
            Schema::table('expenses', function (Blueprint $table): void {
                $table->dropColumn('receipt_unavailable');
            });
        }
    }
};
