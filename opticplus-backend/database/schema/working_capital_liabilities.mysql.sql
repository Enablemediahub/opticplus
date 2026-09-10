-- Opticplus working capital liabilities register.
-- Run once in Hostinger phpMyAdmin if Artisan migrations are unavailable.
-- Safe to rerun because the table is created only when absent.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `working_capital_liabilities` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `branch_id` bigint unsigned NOT NULL,
  `as_of_date` date NOT NULL,
  `liability_type` enum('trade_creditors','staff_creditors','accrued_expenses','other_actuals') NOT NULL,
  `description` varchar(255) NOT NULL,
  `amount` decimal(15,2) NOT NULL,
  `notes` text DEFAULT NULL,
  `created_by` bigint unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `working_capital_liabilities_branch_id_index` (`branch_id`),
  KEY `working_capital_liabilities_as_of_date_index` (`as_of_date`),
  KEY `working_capital_liabilities_type_index` (`liability_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
