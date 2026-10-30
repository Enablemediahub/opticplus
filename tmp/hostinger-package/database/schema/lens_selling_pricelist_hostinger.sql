-- Bealet / OpticPlus lens selling-price tables
-- Run once in Hostinger phpMyAdmin against the OpticPlus database.
-- This script is safe to re-run because both statements use IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS `lens_selling_price_requests` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `branch_id` BIGINT UNSIGNED NOT NULL,
  `patient_id` BIGINT UNSIGNED NULL,
  `prescription_id` BIGINT UNSIGNED NULL,
  `requested_by` BIGINT UNSIGNED NULL,
  `status` VARCHAR(30) NOT NULL DEFAULT 'pending',
  `requested_price` DECIMAL(12,2) NULL,
  `lens_type` VARCHAR(255) NULL,
  `lens_material` VARCHAR(255) NULL,
  `sph_od` VARCHAR(20) NULL,
  `sph_os` VARCHAR(20) NULL,
  `cyl_od` VARCHAR(20) NULL,
  `cyl_os` VARCHAR(20) NULL,
  `add_od` VARCHAR(20) NULL,
  `add_os` VARCHAR(20) NULL,
  `notes` TEXT NULL,
  `created_at` TIMESTAMP NULL,
  `updated_at` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  KEY `lens_selling_price_requests_branch_status_index` (`branch_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `lens_selling_price_rules` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `branch_id` BIGINT UNSIGNED NOT NULL,
  `category` VARCHAR(255) NULL,
  `lens_type` VARCHAR(255) NOT NULL,
  `lens_material` VARCHAR(255) NULL,
  `lens_index` VARCHAR(50) NULL,
  `sph_range` VARCHAR(100) NULL,
  `cyl_range` VARCHAR(100) NULL,
  `add_range` VARCHAR(100) NULL,
  `price_label` VARCHAR(100) NULL,
  `selling_price` DECIMAL(12,2) NULL,
  `notes` TEXT NULL,
  `prescription_examples` TEXT NULL,
  `prescription_count` INT UNSIGNED NOT NULL DEFAULT 0,
  `status` VARCHAR(30) NOT NULL DEFAULT 'approved',
  `receptionist_override_allowed` TINYINT(1) NOT NULL DEFAULT 1,
  `created_by` BIGINT UNSIGNED NULL,
  `updated_by` BIGINT UNSIGNED NULL,
  `created_at` TIMESTAMP NULL,
  `updated_at` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  KEY `lens_selling_price_rules_branch_status_index` (`branch_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- MySQL versions used by some Hostinger phpMyAdmin accounts do not support
-- ALTER TABLE ... ADD COLUMN IF NOT EXISTS. This conditional statement works
-- on those versions and does nothing when the column already exists.
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

CREATE TABLE IF NOT EXISTS `lens_selling_price_settings` (
  `branch_id` BIGINT UNSIGNED NOT NULL,
  `receptionist_override_allowed` TINYINT(1) NOT NULL DEFAULT 1,
  `updated_by` BIGINT UNSIGNED NULL,
  `created_at` TIMESTAMP NULL,
  `updated_at` TIMESTAMP NULL,
  PRIMARY KEY (`branch_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
