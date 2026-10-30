<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('lens_selling_price_rules', 'prescription_count')) {
            Schema::table('lens_selling_price_rules', function (Blueprint $table): void {
                $table->unsignedInteger('prescription_count')->default(0)->after('prescription_examples');
            });
        }

        DB::table('lens_selling_price_rules')->orderBy('id')->each(function ($rule): void {
            $examples = $rule->prescription_examples ? json_decode($rule->prescription_examples, true) : [];
            $count = is_array($examples) ? count($examples) : 0;
            if ($count > 0) {
                DB::table('lens_selling_price_rules')->where('id', $rule->id)->update(['prescription_count' => $count]);
            }
        });
    }

    public function down(): void
    {
        if (Schema::hasColumn('lens_selling_price_rules', 'prescription_count')) {
            Schema::table('lens_selling_price_rules', function (Blueprint $table): void {
                $table->dropColumn('prescription_count');
            });
        }
    }
};
