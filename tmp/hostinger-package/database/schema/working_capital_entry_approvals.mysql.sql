-- Run once in Hostinger phpMyAdmin after the working-capital entries table exists.

CREATE TABLE IF NOT EXISTS `working_capital_entry_approvals` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `branch_id` bigint unsigned NOT NULL,
  `period_month` date NOT NULL,
  `approved_at` timestamp NULL DEFAULT NULL,
  `approved_by` bigint unsigned DEFAULT NULL,
  `reopened_at` timestamp NULL DEFAULT NULL,
  `reopened_by` bigint unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `working_capital_entry_approvals_branch_month_unique` (`branch_id`, `period_month`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;