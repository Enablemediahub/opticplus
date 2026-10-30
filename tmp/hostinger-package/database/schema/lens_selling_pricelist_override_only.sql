-- Run this only if lens_selling_price_rules already exists on Hostinger.
-- Run in phpMyAdmin after selecting the OpticPlus database.

SET @override_column_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'lens_selling_price_rules'
    AND COLUMN_NAME = 'receptionist_override_allowed'
);
SET @override_sql := IF(
  @override_column_exists = 0,
  'ALTER TABLE `lens_selling_price_rules` ADD COLUMN `receptionist_override_allowed` TINYINT(1) NOT NULL DEFAULT 1 AFTER `status`',
  'SELECT 1'
);
PREPARE add_override_column FROM @override_sql;
EXECUTE add_override_column;
DEALLOCATE PREPARE add_override_column;
