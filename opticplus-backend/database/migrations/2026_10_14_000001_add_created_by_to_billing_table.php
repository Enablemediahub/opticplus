<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('billing') && ! Schema::hasColumn('billing', 'created_by')) {
            Schema::table('billing', function (Blueprint $table): void {
                $table->unsignedBigInteger('created_by')->nullable()->index();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('billing') && Schema::hasColumn('billing', 'created_by')) {
            Schema::table('billing', function (Blueprint $table): void {
                $table->dropIndex(['created_by']);
                $table->dropColumn('created_by');
            });
        }
    }
};
