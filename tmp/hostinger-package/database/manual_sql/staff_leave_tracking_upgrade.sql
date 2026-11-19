-- Bealet HR Space annual-leave tracking upgrade for an existing HR Space install.
-- Run once in phpMyAdmin AFTER the original staff_hr_space.sql schema exists.
-- This script adds the full schema for migration 2026_11_19_000005.

ALTER TABLE `hr_requests`
  ADD COLUMN `leave_type` VARCHAR(32) NULL AFTER `request_type`,
  ADD COLUMN `working_days_requested` DECIMAL(6,2) NULL AFTER `end_date`,
  ADD COLUMN `handover_person` VARCHAR(180) NULL AFTER `working_days_requested`,
  ADD COLUMN `outstanding_duties` TEXT NULL AFTER `handover_person`,
  ADD COLUMN `notification_date` DATE NULL AFTER `outstanding_duties`,
  ADD COLUMN `working_days_approved` DECIMAL(6,2) NULL AFTER `notification_date`,
  ADD COLUMN `leave_remuneration` DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER `working_days_approved`,
  ADD COLUMN `interrupted_working_days` DECIMAL(6,2) NOT NULL DEFAULT 0.00 AFTER `leave_remuneration`,
  ADD COLUMN `leave_year` SMALLINT UNSIGNED NULL AFTER `interrupted_working_days`,
  ADD INDEX `hr_requests_leave_year_index` (`leave_year`);

CREATE TABLE `hr_leave_entitlements` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `employee_id` INT UNSIGNED NOT NULL,
  `leave_year` SMALLINT UNSIGNED NOT NULL,
  `entitlement_days` DECIMAL(7,2) NOT NULL DEFAULT 15.00,
  `carried_forward_days` DECIMAL(7,2) NOT NULL DEFAULT 0.00,
  `working_days` LONGTEXT NULL,
  `adjustment_note` TEXT NULL,
  `entitlement_start_date` DATE NULL,
  `updated_by` BIGINT UNSIGNED NULL,
  `created_at` TIMESTAMP NULL DEFAULT NULL,
  `updated_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `hr_leave_employee_year_unique` (`employee_id`,`leave_year`),
  KEY `hr_leave_entitlements_employee_id_index` (`employee_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `hr_public_holidays` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `holiday_date` DATE NOT NULL,
  `name` VARCHAR(180) NOT NULL,
  `notes` TEXT NULL,
  `created_by` BIGINT UNSIGNED NULL,
  `created_at` TIMESTAMP NULL DEFAULT NULL,
  `updated_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `hr_public_holidays_holiday_date_unique` (`holiday_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Backfill prior HR leave request details where the previous text template
-- recorded the values. Review unmatched legacy annual requests manually.
UPDATE `hr_requests`
SET
  `leave_type` = CASE
    WHEN `reason` LIKE 'Leave type: Annual%' THEN 'annual'
    WHEN `reason` LIKE 'Leave type: Sick%' THEN 'sick'
    WHEN `reason` LIKE 'Leave type: Maternity%' THEN 'maternity'
    WHEN `reason` LIKE 'Leave type: Compassionate%' THEN 'compassionate'
    WHEN `reason` LIKE 'Leave type: Unpaid%' THEN 'unpaid'
    ELSE `leave_type`
  END,
  `working_days_requested` = CASE
    WHEN `reason` LIKE '%Working days requested: %' THEN CAST(TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(`reason`, 'Working days requested: ', -1), '\n', 1)) AS DECIMAL(6,2))
    ELSE `working_days_requested`
  END,
  `leave_year` = CASE WHEN `request_type` = 'leave' AND `start_date` IS NOT NULL THEN YEAR(`start_date`) ELSE `leave_year` END,
  `working_days_approved` = CASE
    WHEN `status` = 'approved' AND `reason` LIKE 'Leave type: Annual%' AND `reason` LIKE '%Working days requested: %'
    THEN CAST(TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(`reason`, 'Working days requested: ', -1), '\n', 1)) AS DECIMAL(6,2))
    ELSE `working_days_approved`
  END
WHERE `request_type` = 'leave';
