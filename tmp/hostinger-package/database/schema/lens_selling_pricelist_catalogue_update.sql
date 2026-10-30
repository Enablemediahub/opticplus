-- Incremental Bealet lens catalogue update
-- Run once after the previous lens selling-price package SQL.

SET @selling_price_nullable := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'lens_selling_price_rules'
    AND COLUMN_NAME = 'selling_price'
    AND IS_NULLABLE = 'YES'
);
SET @selling_price_sql := IF(
  @selling_price_nullable = 0,
  'ALTER TABLE `lens_selling_price_rules` MODIFY `selling_price` DECIMAL(12,2) NULL',
  'SELECT 1'
);
PREPARE make_price_nullable FROM @selling_price_sql;
EXECUTE make_price_nullable;
DEALLOCATE PREPARE make_price_nullable;

SET @prescription_count_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'lens_selling_price_rules'
    AND COLUMN_NAME = 'prescription_count'
);
SET @prescription_count_sql := IF(
  @prescription_count_exists = 0,
  'ALTER TABLE `lens_selling_price_rules` ADD COLUMN `prescription_count` INT UNSIGNED NOT NULL DEFAULT 0 AFTER `prescription_examples`',
  'SELECT 1'
);
PREPARE add_prescription_count FROM @prescription_count_sql;
EXECUTE add_prescription_count;
DEALLOCATE PREPARE add_prescription_count;

INSERT INTO `lens_selling_price_rules`
  (`branch_id`, `category`, `lens_type`, `lens_material`, `lens_index`,
   `sph_range`, `cyl_range`, `add_range`, `price_label`, `selling_price`,
   `notes`, `prescription_examples`, `prescription_count`, `status`,
   `created_at`, `updated_at`)
SELECT
  branches.branch_id,
  catalogue.category,
  catalogue.lens_type,
  NULL,
  catalogue.lens_index,
  '-20.00 to 20.00',
  '-10.00 to 10.00',
  catalogue.add_range,
  catalogue.price_label,
  NULL,
  'Catalogue range awaiting GM-approved selling price.',
  '[]',
  0,
  'pending_price',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT branch_id
  FROM `lens_selling_price_rules`
) AS branches
JOIN (
  SELECT 'Single Vision' AS category, 'SV' AS lens_type, '1.50' AS lens_index, 'SV' AS price_label, NULL AS add_range
  UNION ALL SELECT 'Single Vision', 'SV AR', '1.50', 'AR', NULL
  UNION ALL SELECT 'Single Vision', 'SV HC', '1.50', 'HC', NULL
  UNION ALL SELECT 'Single Vision', 'SV HMC', '1.50', 'HMC', NULL
  UNION ALL SELECT 'Single Vision', 'SV Blue UV', '1.56', 'SV', NULL
  UNION ALL SELECT 'Single Vision', 'SV Photo AR', '1.56', 'AR', NULL
  UNION ALL SELECT 'Single Vision', 'High Index SV', '1.60', 'SV', NULL
  UNION ALL SELECT 'Bifocal', 'BF', '1.50', 'BC', '0.75 to 4.00'
  UNION ALL SELECT 'Bifocal', 'BF AR', '1.50', 'AR', '0.75 to 4.00'
  UNION ALL SELECT 'Bifocal', 'BF Photo AR', '1.56', 'AR', '0.75 to 4.00'
  UNION ALL SELECT 'Progressive', 'PROG', '1.50', 'PROG', '0.75 to 4.00'
  UNION ALL SELECT 'Progressive', 'PROG AR', '1.50', 'AR', '0.75 to 4.00'
  UNION ALL SELECT 'Progressive', 'PROG HC', '1.50', 'HC', '0.75 to 4.00'
  UNION ALL SELECT 'Progressive', 'PROG HMC', '1.50', 'HMC', '0.75 to 4.00'
  UNION ALL SELECT 'Progressive', 'PROG Photo AR', '1.56', 'AR', '0.75 to 4.00'
  UNION ALL SELECT 'Progressive', 'PROG Blue UV', '1.56', 'PROG', '0.75 to 4.00'
  UNION ALL SELECT 'Progressive', 'High Index PROG', '1.60', 'PROG', '0.75 to 4.00'
  UNION ALL SELECT 'Anti-fatigue', 'Anti-Fatigue', '1.56', 'AR', '0.75 to 4.00'
  UNION ALL SELECT 'Office', 'Office Lens', '1.56', 'PROG', '0.75 to 4.00'
  UNION ALL SELECT 'Occupational', 'Occupational Lens', '1.56', 'AR', '0.75 to 4.00'
) AS catalogue
  ON 1 = 1
WHERE NOT EXISTS (
  SELECT 1
  FROM `lens_selling_price_rules` existing
  WHERE existing.branch_id = branches.branch_id
    AND existing.lens_type = catalogue.lens_type
    AND existing.lens_index = catalogue.lens_index
    AND existing.status = 'pending_price'
);

UPDATE `lens_selling_price_rules`
SET `prescription_count` = JSON_LENGTH(`prescription_examples`)
WHERE `prescription_count` = 0
  AND `prescription_examples` IS NOT NULL
  AND JSON_VALID(`prescription_examples`);
