<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('expenses')) {
            if (! $this->indexExists('expenses', 'idx_branch_date')) {
                Schema::table('expenses', function (Blueprint $table): void {
                    $table->index(['branch_id', 'date'], 'idx_branch_date');
                });
            }

            if (! $this->indexExists('expenses', 'idx_branch_category_date')) {
                Schema::table('expenses', function (Blueprint $table): void {
                    $table->index(['branch_id', 'category', 'date'], 'idx_branch_category_date');
                });
            }
        }

        if (Schema::hasTable('lens_costs') && Schema::hasColumn('lens_costs', 'branch_id') && ! $this->indexExists('lens_costs', 'idx_branch_id')) {
            Schema::table('lens_costs', function (Blueprint $table): void {
                $table->index(['branch_id'], 'idx_branch_id');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('expenses')) {
            if ($this->indexExists('expenses', 'idx_branch_category_date')) {
                Schema::table('expenses', function (Blueprint $table): void {
                    $table->dropIndex('idx_branch_category_date');
                });
            }

            if ($this->indexExists('expenses', 'idx_branch_date')) {
                Schema::table('expenses', function (Blueprint $table): void {
                    $table->dropIndex('idx_branch_date');
                });
            }
        }

        if (Schema::hasTable('lens_costs') && $this->indexExists('lens_costs', 'idx_branch_id')) {
            Schema::table('lens_costs', function (Blueprint $table): void {
                $table->dropIndex('idx_branch_id');
            });
        }
    }

    private function indexExists(string $table, string $indexName): bool
    {
        try {
            return collect(DB::select("SHOW INDEX FROM {$table} WHERE Key_name = ?", [$indexName]))->isNotEmpty();
        } catch (\Throwable) {
            return false;
        }
    }
};
