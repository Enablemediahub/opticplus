-- Run this script after selecting the Hostinger database for Opticplus.
-- Safe to re-run: tables are created only if missing and the expense column is checked first.

CREATE TABLE IF NOT EXISTS `expense_approval_requests` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `branch_id` BIGINT UNSIGNED NOT NULL,
  `description` VARCHAR(255) NOT NULL,
  `amount` DECIMAL(12,2) NOT NULL,
  `date` DATE NOT NULL,
  `category` VARCHAR(50) NOT NULL,
  `document_type` VARCHAR(40) NOT NULL,
  `supporting_document_json` LONGTEXT NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
  `submitted_by` BIGINT UNSIGNED NOT NULL,
  `submitted_role` VARCHAR(40) NOT NULL,
  `submitted_at` TIMESTAMP NOT NULL,
  `reviewed_by` BIGINT UNSIGNED NULL,
  `reviewed_at` TIMESTAMP NULL,
  `decision_note` TEXT NULL,
  `resulting_expense_id` BIGINT UNSIGNED NULL,
  `created_at` TIMESTAMP NULL,
  `updated_at` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  KEY `expense_approval_requests_branch_id_index` (`branch_id`),
  KEY `expense_approval_requests_submitted_by_index` (`submitted_by`),
  KEY `expense_approval_requests_reviewed_by_index` (`reviewed_by`),
  KEY `expense_approval_branch_status_idx` (`branch_id`, `status`, `submitted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `memo_user_signatures` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `signature_path` VARCHAR(500) NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT NULL,
  `updated_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `memo_user_signatures_user_id_unique` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @receipt_flag_ddl = IF(
  EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'expenses'
      AND COLUMN_NAME = 'receipt_unavailable'
  ),
  'SELECT ''expenses.receipt_unavailable already exists'' AS migration_status',
  'ALTER TABLE `expenses` ADD COLUMN `receipt_unavailable` TINYINT(1) NOT NULL DEFAULT 0 AFTER `category`'
);
PREPARE receipt_flag_statement FROM @receipt_flag_ddl;
EXECUTE receipt_flag_statement;
DEALLOCATE PREPARE receipt_flag_statement;
