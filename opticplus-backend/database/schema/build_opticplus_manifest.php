<?php

/**
 * Builds generated_schema_manifest.php + opticplus_full_schema.mysql.sql from a phpMyAdmin merge dump.
 *
 * Usage (from backend root):
 *   php database/schema/build_opticplus_manifest.php [path/to/source.sql]
 *
 * Default source: storage/app/private/branch-merges/803d4cf6-8fd2-4f81-813e-01715189171f.sql
 */

declare(strict_types=1);

$baseDir = dirname(__DIR__, 2);
$defaultSrc = $baseDir.'/storage/app/private/branch-merges/803d4cf6-8fd2-4f81-813e-01715189171f.sql';
$sourcePath = $argv[1] ?? $defaultSrc;
$outManifest = __DIR__.'/generated_schema_manifest.php';
$outSql = __DIR__.'/opticplus_full_schema.mysql.sql';

if (! is_readable($sourcePath)) {
    fwrite(STDERR, "Source SQL not readable: {$sourcePath}\n");
    exit(1);
}

$content = (string) file_get_contents($sourcePath);

$indexesMarker = '-- Indexes for dumped tables';
$autoIncMarker = '-- AUTO_INCREMENT for table';
$constraintsMarker = '-- Constraints for dumped tables';

$idxPos = strpos($content, $indexesMarker);
if ($idxPos === false) {
    fwrite(STDERR, "Could not find indexes section.\n");
    exit(1);
}

$structPart = substr($content, 0, $idxPos);
$structPart = (string) preg_replace('/DELIMITER\s+\$\$[\s\S]*?DELIMITER\s*;/i', '', $structPart);

/** @return list<array{name:string, create:string}> */
function extract_creates(string $sql): array
{
    $tables = [];
    $pos = 0;
    $len = strlen($sql);
    while ($pos < $len) {
        $p = strpos($sql, 'CREATE TABLE `', $pos);
        if ($p === false) {
            break;
        }
        $nameStart = $p + strlen('CREATE TABLE `');
        $nameEnd = strpos($sql, '`', $nameStart);
        if ($nameEnd === false) {
            break;
        }
        $name = substr($sql, $nameStart, $nameEnd - $nameStart);
        $open = strpos($sql, '(', $nameEnd);
        if ($open === false) {
            break;
        }
        $i = $open;
        $depth = 0;
        $inString = false;
        $quote = '';
        while ($i < $len) {
            $c = $sql[$i];
            if (! $inString) {
                if ($c === '(') {
                    $depth++;
                } elseif ($c === ')') {
                    $depth--;
                    if ($depth === 0) {
                        $semi = strpos($sql, ';', $i);
                        if ($semi === false) {
                            break 2;
                        }
                        $stmt = substr($sql, $p, $semi - $p + 1);
                        $stmt = str_replace('CREATE TABLE `', 'CREATE TABLE IF NOT EXISTS `', $stmt);
                        $tables[] = ['name' => $name, 'create' => $stmt];
                        $pos = $semi + 1;
                        continue 2;
                    }
                } elseif ($c === "'" || $c === '"') {
                    $inString = true;
                    $quote = $c;
                }
            } else {
                if ($c === $quote) {
                    if ($c === "'" && $i + 1 < $len && $sql[$i + 1] === "'") {
                        $i++;

                        continue;
                    }
                    $inString = false;
                }
            }
            $i++;
        }
        break;
    }

    return $tables;
}

/** @return array<string, list<string>> */
function extract_alter_blocks(string $section): array
{
    $byTable = [];
    $pattern = '/ALTER TABLE `([^`]+)`\s*((?:.|\n)+?);/m';
    if (preg_match_all($pattern, $section, $matches, PREG_SET_ORDER)) {
        foreach ($matches as $m) {
            $table = $m[1];
            $body = trim($m[2]);
            $stmt = 'ALTER TABLE `'.$table.'` '.$body.';';
            $stmt = (string) preg_replace('/,\s*AUTO_INCREMENT=\d+/i', '', $stmt);
            $byTable[$table] ??= [];
            $byTable[$table][] = $stmt;
        }
    }

    return $byTable;
}

$restFromIndexes = substr($content, $idxPos);
$autoPos = strpos($restFromIndexes, $autoIncMarker);
$constPos = strpos($restFromIndexes, $constraintsMarker);

$indexSection = $autoPos !== false
    ? substr($restFromIndexes, 0, $autoPos)
    : $restFromIndexes;

$autoSection = '';
if ($autoPos !== false && $constPos !== false) {
    $autoSection = substr($restFromIndexes, $autoPos, $constPos - $autoPos);
} elseif ($autoPos !== false) {
    $autoSection = substr($restFromIndexes, $autoPos);
}

$constraintSection = $constPos !== false
    ? substr($restFromIndexes, $constPos)
    : '';

$creates = extract_creates($structPart);
$indexAlters = extract_alter_blocks($indexSection);
$autoAlters = extract_alter_blocks($autoSection);
$fkAlters = extract_alter_blocks($constraintSection);

$manifest = [];
foreach ($creates as $row) {
    $name = $row['name'];
    $post = [];
    foreach ($indexAlters[$name] ?? [] as $stmt) {
        $post[] = $stmt;
    }
    foreach ($autoAlters[$name] ?? [] as $stmt) {
        $post[] = $stmt;
    }
    $manifest[] = [
        'name' => $name,
        'create' => $row['create'],
        'post' => $post,
    ];
}

// Global FK constraints (run after all table creates)
$fksGlobal = [];
foreach ($fkAlters as $stmts) {
    foreach ($stmts as $s) {
        $fksGlobal[] = $s;
    }
}

$extra = extra_app_tables();

$php = "<?php\n\ndeclare(strict_types=1);\n\n";
$php .= "/**\n * AUTO-GENERATED by database/schema/build_opticplus_manifest.php\n * Do not edit by hand; re-run the build script after updating the source dump.\n */\n\nreturn [\n";
$php .= "    'tables' => ".var_export($manifest, true).",\n";
$php .= "    'foreign_keys' => ".var_export($fksGlobal, true).",\n";
$php .= "    'extra_tables' => ".var_export($extra, true).",\n";
$php .= "];\n";

file_put_contents($outManifest, $php);

$sqlHeader = <<<'HDR'
-- Opticplus full table definitions (structure only, no data)
-- Generated by database/schema/build_opticplus_manifest.php
-- Safe for empty databases: CREATE TABLE IF NOT EXISTS + ALTERs for new tables only.
--
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
SET SESSION sql_mode = 'NO_ENGINE_SUBSTITUTION';

HDR;

$sqlBody = '';

foreach ($manifest as $entry) {
    $sqlBody .= "\n".$entry['create']."\n";
    foreach ($entry['post'] as $stmt) {
        $sqlBody .= $stmt."\n";
    }
}
foreach ($fksGlobal as $stmt) {
    $sqlBody .= $stmt."\n";
}

foreach ($extra as $ex) {
    $sqlBody .= "\n".$ex['create']."\n";
    foreach ($ex['post'] as $stmt) {
        $sqlBody .= $stmt."\n";
    }
}

$sqlFooter = "\nSET FOREIGN_KEY_CHECKS = 1;\n";

file_put_contents($outSql, $sqlHeader.$sqlBody.$sqlFooter);

echo "Wrote {$outManifest} and {$outSql} (".count($manifest).' tables + '.count($extra)." extra).\n";

/**
 * Tables required by Laravel controllers but absent from legacy merge dumps.
 *
 * @return list<array{name:string, create:string, post:list<string>}>
 */
function extra_app_tables(): array
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
            'post' => [],
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
            'post' => [],
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
            'post' => [],
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
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `financial_reports_branch_id_index` (`branch_id`),
  KEY `financial_reports_prepared_by_id_index` (`prepared_by_id`),
  KEY `financial_reports_status_index` (`status`),
  KEY `financial_reports_validated_by_id_index` (`validated_by_id`),
  KEY `financial_reports_pushed_to_ceo_by_id_index` (`pushed_to_ceo_by_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
SQL,
            'post' => [],
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
            'post' => [],
        ],
    ];
}
