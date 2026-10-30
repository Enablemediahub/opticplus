<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('lens_selling_price_rules', 'selling_price')) {
            Schema::table('lens_selling_price_rules', function (Blueprint $table): void {
                $table->decimal('selling_price', 12, 2)->nullable()->change();
            });
        }

        $branches = DB::table('lens_selling_price_rules')
            ->select('branch_id')
            ->distinct()
            ->pluck('branch_id');
        $catalogue = [
            ['Single Vision', 'SV', '1.50', 'SV'],
            ['Single Vision', 'SV AR', '1.50', 'AR'],
            ['Single Vision', 'SV HC', '1.50', 'HC'],
            ['Single Vision', 'SV HMC', '1.50', 'HMC'],
            ['Single Vision', 'SV Blue UV', '1.56', 'SV'],
            ['Single Vision', 'SV Photo AR', '1.56', 'AR'],
            ['Single Vision', 'High Index SV', '1.60', 'SV'],
            ['Bifocal', 'BF', '1.50', 'BC'],
            ['Bifocal', 'BF AR', '1.50', 'AR'],
            ['Bifocal', 'BF Photo AR', '1.56', 'AR'],
            ['Progressive', 'PROG', '1.50', 'PROG'],
            ['Progressive', 'PROG AR', '1.50', 'AR'],
            ['Progressive', 'PROG HC', '1.50', 'HC'],
            ['Progressive', 'PROG HMC', '1.50', 'HMC'],
            ['Progressive', 'PROG Photo AR', '1.56', 'AR'],
            ['Progressive', 'PROG Blue UV', '1.56', 'PROG'],
            ['Progressive', 'High Index PROG', '1.60', 'PROG'],
            ['Anti-fatigue', 'Anti-Fatigue', '1.56', 'AR'],
            ['Office', 'Office Lens', '1.56', 'PROG'],
            ['Occupational', 'Occupational Lens', '1.56', 'AR'],
        ];

        foreach ($branches as $branchId) {
            foreach ($catalogue as [$category, $lensType, $index, $priceLabel]) {
                DB::table('lens_selling_price_rules')->updateOrInsert(
                    [
                        'branch_id' => $branchId,
                        'lens_type' => $lensType,
                        'lens_index' => $index,
                        'status' => 'pending_price',
                    ],
                    [
                        'category' => $category,
                        'lens_material' => null,
                        'sph_range' => '-20.00 to 20.00',
                        'cyl_range' => '-10.00 to 10.00',
                        'add_range' => $category === 'Single Vision' ? null : '0.75 to 4.00',
                        'price_label' => $priceLabel,
                        'selling_price' => null,
                        'notes' => 'Catalogue range awaiting GM-approved selling price.',
                        'prescription_examples' => json_encode([]),
                        'created_at' => now(),
                        'updated_at' => now(),
                    ],
                );
            }
        }
    }

    public function down(): void
    {
        DB::table('lens_selling_price_rules')
            ->where('status', 'pending_price')
            ->delete();
    }
};
