<?php

/**
 * Builds a full Opticplus import SQL from a merged branch dump.
 *
 * Goal:
 * - keep the merged schema + data from the source dump
 * - append any app-required compatibility tables missing from the dump
 * - seed core catalog tables so a fresh import works immediately with Opticplus
 *
 * Usage (from backend root):
 *   php database/schema/build_opticplus_full_import.php path/to/source.sql [path/to/output.sql]
 */

declare(strict_types=1);

$baseDir = dirname(__DIR__, 2);
$sourcePath = $argv[1] ?? null;
$defaultOutput = dirname($baseDir).'/tmp/opticplus_platform_full_import.mysql.sql';
$outputPath = $argv[2] ?? $defaultOutput;

if (! $sourcePath) {
    fwrite(STDERR, "Usage: php database/schema/build_opticplus_full_import.php path/to/source.sql [path/to/output.sql]\n");
    exit(1);
}

$sourcePath = resolve_path($sourcePath, $baseDir);
$outputPath = resolve_path($outputPath, $baseDir);

if (! is_readable($sourcePath)) {
    fwrite(STDERR, "Source SQL not readable: {$sourcePath}\n");
    exit(1);
}

$content = (string) file_get_contents($sourcePath);

$compatibilityTables = compatibility_tables();
$missingTables = [];
foreach ($compatibilityTables as $table) {
    if (! dump_contains_table($content, $table['name'])) {
        $missingTables[] = $table;
    }
}

$compatibilityBlock = build_compatibility_block($missingTables);
$compatibilityBlock = trim($compatibilityBlock);

$result = rtrim($content)."\n";
if ($compatibilityBlock !== '') {
    $result .= "\n".$compatibilityBlock."\n";
}

$outputDir = dirname($outputPath);
if (! is_dir($outputDir) && ! mkdir($outputDir, 0755, true) && ! is_dir($outputDir)) {
    fwrite(STDERR, "Could not create output directory: {$outputDir}\n");
    exit(1);
}

$bytesWritten = file_put_contents($outputPath, $result);
if ($bytesWritten === false) {
    fwrite(STDERR, "Failed to write output SQL: {$outputPath}\n");
    exit(1);
}

echo 'Wrote '.$outputPath.' using '.$sourcePath.'; appended '.count($missingTables)." missing platform tables.\n";

/**
 * @return array<int, array{name:string, create:string, inserts:list<string>}>
 */
function compatibility_tables(): array
{
    return [
        [
            'name' => 'internal_messages',
            'create' => <<<'SQL'
CREATE TABLE IF NOT EXISTS `internal_messages` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `sender_id` bigint unsigned NOT NULL,
  `recipient_id` bigint unsigned NOT NULL,
  `message` text NOT NULL,
  `read_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `internal_messages_recipient_read_idx` (`recipient_id`, `read_at`),
  KEY `internal_messages_pair_idx` (`sender_id`, `recipient_id`),
  KEY `internal_messages_created_idx` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
SQL,
            'inserts' => [],
        ],
        [
            'name' => 'expense_categories',
            'create' => <<<'SQL'
CREATE TABLE IF NOT EXISTS `expense_categories` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `expense_categories_name_unique` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
SQL,
            'inserts' => [
                <<<'SQL'
INSERT INTO `expense_categories` (`id`, `name`, `is_active`, `created_at`, `updated_at`) VALUES
(1, 'Utilities', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(2, 'Salaries', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(3, 'Transport', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(4, 'Stationery', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(5, 'Maintenance', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(6, 'Operations', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
SQL,
            ],
        ],
        [
            'name' => 'insurance_providers',
            'create' => <<<'SQL'
CREATE TABLE IF NOT EXISTS `insurance_providers` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(80) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `insurance_providers_name_unique` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
SQL,
            'inserts' => [
                <<<'SQL'
INSERT INTO `insurance_providers` (`id`, `name`, `is_active`, `created_at`, `updated_at`) VALUES
(1, 'APEX', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(2, 'ACACIA', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(3, 'GLICO', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(4, 'PREMIERE HEALTH INSURANCE', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(5, 'NATIONWIDE', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
SQL,
            ],
        ],
        [
            'name' => 'financial_reports',
            'create' => <<<'SQL'
CREATE TABLE IF NOT EXISTS `financial_reports` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `branch_id` int unsigned NOT NULL DEFAULT 1,
  `title` varchar(255) NOT NULL,
  `report_type` varchar(50) NOT NULL,
  `month` varchar(20) NOT NULL,
  `comparison_branch_id` int unsigned DEFAULT NULL,
  `comparison_month` varchar(20) DEFAULT NULL,
  `prepared_by_name` varchar(255) NOT NULL,
  `prepared_by_id` bigint unsigned DEFAULT NULL,
  `prepared_by_role` varchar(50) NOT NULL,
  `status` enum('submitted','validated','rejected','pushed_to_ceo') NOT NULL DEFAULT 'submitted',
  `accountant_notes` text DEFAULT NULL,
  `accountant_signature` varchar(255) DEFAULT NULL,
  `gm_notes` text DEFAULT NULL,
  `gm_signature` varchar(255) DEFAULT NULL,
  `validated_by_name` varchar(255) DEFAULT NULL,
  `validated_by_id` bigint unsigned DEFAULT NULL,
  `validated_at` timestamp NULL DEFAULT NULL,
  `pushed_to_ceo_by_name` varchar(255) DEFAULT NULL,
  `pushed_to_ceo_by_id` bigint unsigned DEFAULT NULL,
  `pushed_to_ceo_at` timestamp NULL DEFAULT NULL,
  `payload_json` longtext NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `financial_reports_branch_id_index` (`branch_id`),
  KEY `financial_reports_prepared_by_id_index` (`prepared_by_id`),
  KEY `financial_reports_status_index` (`status`),
  KEY `financial_reports_validated_by_id_index` (`validated_by_id`),
  KEY `financial_reports_pushed_to_ceo_by_id_index` (`pushed_to_ceo_by_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
SQL,
            'inserts' => [],
        ],
        [
            'name' => 'financial_report_approvals',
            'create' => <<<'SQL'
CREATE TABLE IF NOT EXISTS `financial_report_approvals` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `report_id` bigint unsigned NOT NULL,
  `approver_id` bigint unsigned DEFAULT NULL,
  `approver_name` varchar(255) NOT NULL,
  `approver_role` varchar(50) NOT NULL,
  `action` enum('submitted','validated','rejected','pushed_to_ceo') NOT NULL,
  `notes` text DEFAULT NULL,
  `signature_path` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `financial_report_approvals_report_id_index` (`report_id`),
  KEY `financial_report_approvals_approver_id_index` (`approver_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
SQL,
            'inserts' => [],
        ],
    ];
}

function dump_contains_table(string $dump, string $tableName): bool
{
    return preg_match('/\b(?:CREATE TABLE|CREATE TABLE IF NOT EXISTS|DROP TABLE IF EXISTS)\s+`'.preg_quote($tableName, '/').'`/i', $dump) === 1;
}

/**
 * @param array<int, array{name:string, create:string, inserts:list<string>}> $missingTables
 */
function build_compatibility_block(array $missingTables): string
{
    if ($missingTables === []) {
        return <<<'SQL'
-- =====================================================
-- OPTICPLUS COMPATIBILITY PATCH
-- No missing platform tables were detected in the source dump.
-- =====================================================
SQL;
    }

    $parts = [];
    $parts[] = '-- =====================================================';
    $parts[] = '-- OPTICPLUS COMPATIBILITY PATCH';
    $parts[] = '-- Appended by database/schema/build_opticplus_full_import.php';
    $parts[] = '-- Adds missing platform tables/catalogs required by the current Laravel + React portal.';
    $parts[] = '-- =====================================================';
    $parts[] = 'SET FOREIGN_KEY_CHECKS = 0;';

    foreach ($missingTables as $table) {
        $parts[] = '';
        $parts[] = '-- Missing table added for platform compatibility: `'.$table['name'].'`';
        $parts[] = rtrim($table['create']);
        foreach ($table['inserts'] as $insert) {
            $parts[] = rtrim($insert);
        }
    }

    $parts[] = '';
    $parts[] = 'SET FOREIGN_KEY_CHECKS = 1;';

    return implode("\n", $parts);
}

function resolve_path(string $path, string $baseDir): string
{
    if (preg_match('/^[A-Za-z]:[\\\\\\/]/', $path) === 1) {
        return $path;
    }

    $normalized = str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $path);

    return $baseDir.DIRECTORY_SEPARATOR.$normalized;
}
