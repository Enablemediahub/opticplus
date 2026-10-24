-- Configure the Accountant memo threshold and Receptionist direct-submission limit.

CREATE TABLE IF NOT EXISTS `expense_workflow_settings` (
  `id` TINYINT UNSIGNED NOT NULL,
  `accountant_memo_threshold` DECIMAL(12,2) NOT NULL DEFAULT 1000.00,
  `receptionist_direct_limit` DECIMAL(12,2) NOT NULL DEFAULT 1000.00,
  `updated_by` BIGINT UNSIGNED NULL,
  `created_at` TIMESTAMP NULL DEFAULT NULL,
  `updated_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `expense_workflow_settings`
  (`id`, `accountant_memo_threshold`, `receptionist_direct_limit`, `created_at`, `updated_at`)
VALUES (1, 1000.00, 1000.00, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
