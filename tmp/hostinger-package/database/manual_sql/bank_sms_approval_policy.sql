-- Run this once in phpMyAdmin after selecting the OpticPlus database.
-- Back up the database first. The ALTER TABLE statement fails if review_method
-- already exists; check the column below before running this script.

CREATE TABLE IF NOT EXISTS `bank_sms_approval_policies` (
  `branch_id` int unsigned NOT NULL,
  `auto_approve` tinyint(1) NOT NULL DEFAULT 0,
  `updated_by` bigint unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`branch_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Check first: SHOW COLUMNS FROM `bank_sms_alerts` LIKE 'review_method';
-- Run only when the check returns no rows.
ALTER TABLE `bank_sms_alerts`
  ADD COLUMN `review_method` varchar(16) NOT NULL DEFAULT 'manual' AFTER `status`;
