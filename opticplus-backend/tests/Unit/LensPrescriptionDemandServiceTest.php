<?php

namespace Tests\Unit;

use App\Services\LensPrescriptionDemandService;
use PHPUnit\Framework\TestCase;

class LensPrescriptionDemandServiceTest extends TestCase
{
    public function test_it_groups_prescriptions_into_supplier_families_and_ranges(): void
    {
        $groups = (new LensPrescriptionDemandService())->aggregate([
            [
                'patient_id' => 12,
                'lens_type' => 'SV PHOTO AR',
                'lens_material' => 'Plastic',
                'sph_od' => '-2.00',
                'sph_os' => '+1.50',
                'cyl_od' => '-1.00',
                'add_od' => 'PLANO',
            ],
            [
                'patient_id' => 34,
                'lens_type' => 'sv photo ar',
                'lens_material' => 'plastic',
                'sph_od' => '0.00',
                'sph_os' => '-0.50',
                'cyl_os' => '-0.50',
                'add_os' => '+1.00',
            ],
            [
                'patient_id' => 56,
                'lens_type' => '',
                'lens_material' => '',
            ],
        ]);

        $this->assertCount(1, $groups);
        $this->assertSame('Single vision', $groups[0]['category']);
        $this->assertSame(2, $groups[0]['prescription_count']);
        $this->assertSame('+1.50 to -2.00', $groups[0]['sph_range']);
        $this->assertSame('-0.50 to -1.00', $groups[0]['cyl_range']);
        $this->assertSame('+1.00 to Plano', $groups[0]['add_range']);
        $this->assertContains('photochromic', $groups[0]['features']);
        $this->assertContains('anti-reflective', $groups[0]['features']);
        $this->assertArrayNotHasKey('patient_id', $groups[0]);
    }

    public function test_it_recognizes_bifocal_and_occupational_progressive_categories(): void
    {
        $groups = (new LensPrescriptionDemandService())->aggregate([
            ['lens_type' => 'BF PHOTO', 'add_od' => '+2.00'],
            ['lens_type' => 'OFFICE PROG', 'add_os' => '+2.50'],
        ]);

        $this->assertSame(['Bifocal', 'Occupational progressive'], array_column($groups, 'category'));
    }
}
