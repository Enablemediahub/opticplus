<?php

namespace App\Services;

class LensPrescriptionDemandService
{
    public function aggregate(iterable $prescriptions): array
    {
        $groups = [];

        foreach ($prescriptions as $prescription) {
            $prescription = (array) $prescription;
            $lensType = trim((string) ($prescription['lens_type'] ?? ''));
            $lensMaterial = trim((string) ($prescription['lens_material'] ?? ''));
            $powers = $this->powerValues($prescription);

            if ($lensType === '' && count(array_filter($powers)) === 0) {
                continue;
            }

            $category = $this->categoryFor($lensType);
            $features = $this->featuresFor($lensType, $lensMaterial);
            $key = strtolower(implode('|', [
                $category,
                $lensType !== '' ? $lensType : 'Unspecified',
                $lensMaterial !== '' ? $lensMaterial : 'Not recorded',
                implode(',', $features),
            ]));

            $groups[$key] ??= [
                'category' => $category,
                'lens_type' => $lensType !== '' ? $lensType : 'Unspecified',
                'lens_material' => $lensMaterial !== '' ? $lensMaterial : 'Not recorded',
                'features' => $features,
                'prescription_count' => 0,
                'sph_values' => [],
                'cyl_values' => [],
                'add_values' => [],
            ];

            $groups[$key]['prescription_count']++;
            foreach ($powers['sph'] as $value) {
                $groups[$key]['sph_values'][] = $value;
            }
            foreach ($powers['cyl'] as $value) {
                $groups[$key]['cyl_values'][] = $value;
            }
            foreach ($powers['add'] as $value) {
                $groups[$key]['add_values'][] = $value;
            }
        }

        $records = array_map(function (array $group): array {
            return [
                'category' => $group['category'],
                'lens_type' => $group['lens_type'],
                'lens_material' => $group['lens_material'],
                'features' => $group['features'],
                'prescription_count' => $group['prescription_count'],
                'sph_range' => $this->formatRange($group['sph_values']),
                'cyl_range' => $this->formatRange($group['cyl_values']),
                'add_range' => $this->formatRange($group['add_values']),
            ];
        }, array_values($groups));

        usort($records, static function (array $left, array $right): int {
            return ($right['prescription_count'] <=> $left['prescription_count'])
                ?: strcasecmp($left['category'], $right['category'])
                ?: strcasecmp($left['lens_type'], $right['lens_type']);
        });

        return $records;
    }

    private function categoryFor(string $lensType): string
    {
        $value = strtolower($lensType);

        if (str_contains($value, 'boost') || str_contains($value, 'anti-fatigue')) {
            return 'Anti-fatigue';
        }
        if (str_contains($value, 'bigressive')) {
            return 'Bigressive';
        }
        if (str_contains($value, 'lenticular')) {
            return 'Lenticular / extended range';
        }
        if (str_contains($value, 'package') || str_contains($value, 'lantis')) {
            return 'Lens package';
        }
        if (str_contains($value, 'drive relax')) {
            return 'Drive Relax';
        }
        if (preg_match('/\b(?:sv)\b|single[\s-]*vision/', $value) === 1) {
            return 'Single vision';
        }
        if (preg_match('/\b(?:bf)\b|bifocal|ft28|flat[\s-]*top|blended/', $value) === 1) {
            return 'Bifocal';
        }
        if (str_contains($value, 'computer') || str_contains($value, 'office')) {
            return 'Occupational progressive';
        }
        if (str_contains($value, 'prog') || str_contains($value, 'progressive')) {
            return 'Progressive';
        }
        if (str_contains($value, 'polarized')) {
            return 'Polarized (design unspecified)';
        }
        if (str_contains($value, 'rx+') || str_contains($value, 'extended')) {
            return 'Extended range (design unspecified)';
        }

        return 'Other / unspecified';
    }

    private function featuresFor(string $lensType, string $lensMaterial): array
    {
        $value = strtolower($lensType.' '.$lensMaterial);
        $features = [];

        foreach ([
            'photochromic' => ['photochromic', 'photosmart', 'photo'],
            'transitions' => ['transition'],
            'blue filter' => ['blueuv', 'blue uv', 'blue ray', 'blue-ray'],
            'anti-reflective' => [' ar', 'anti-reflective', 'hmc'],
            'hard coat' => [' hc', 'hard coat'],
            'polarized' => ['polarized'],
            'polycarbonate' => ['poly'],
            'high index' => ['hi-index', 'high index', 'hi index'],
            'extended range' => ['rx+', 'extended', 'lenticular'],
            'computer / office' => ['computer', 'office'],
        ] as $feature => $tokens) {
            foreach ($tokens as $token) {
                if (str_contains($value, $token)) {
                    $features[] = $feature;
                    break;
                }
            }
        }

        return $features;
    }

    private function powerValues(array $prescription): array
    {
        $values = ['sph' => [], 'cyl' => [], 'add' => []];
        foreach (['sph', 'cyl', 'add'] as $field) {
            foreach (['_od', '_os'] as $eye) {
                $number = $this->parsePower($prescription[$field.$eye] ?? null);
                if ($number !== null) {
                    $values[$field][] = $number;
                }
            }
        }

        return $values;
    }

    private function parsePower(mixed $value): ?float
    {
        if ($value === null || trim((string) $value) === '') {
            return null;
        }

        $normalized = strtoupper(str_replace(',', '.', trim((string) $value)));
        if (in_array($normalized, ['PL', 'PLANO'], true)) {
            return 0.0;
        }

        return is_numeric($normalized) ? (float) $normalized : null;
    }

    private function formatRange(array $values): ?string
    {
        if ($values === []) {
            return null;
        }

        $minimum = min($values);
        $maximum = max($values);
        if (abs($maximum - $minimum) < 0.00001) {
            return $this->formatPower($maximum);
        }

        return $this->formatPower($maximum).' to '.$this->formatPower($minimum);
    }

    private function formatPower(float $value): string
    {
        if (abs($value) < 0.00001) {
            return 'Plano';
        }

        return ($value > 0 ? '+' : '').number_format($value, 2, '.', '');
    }
}
