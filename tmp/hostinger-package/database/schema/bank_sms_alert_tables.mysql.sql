-- Run this against the Hostinger OpticPlus database before uploading the app changes.
-- The table definitions match the Laravel migration:
-- 2026_10_25_000001_create_bank_sms_alert_tables

CREATE TABLE IF NOT EXISTS `bank_accounts` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `branch_id` INT UNSIGNED NOT NULL,
  `bank_name` VARCHAR(80) NOT NULL,
  `account_suffix` VARCHAR(4) NOT NULL,
  `account_label` VARCHAR(80) NULL,
  `reported_balance` DECIMAL(12,2) NULL,
  `reported_balance_at` TIMESTAMP NULL DEFAULT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NULL DEFAULT NULL,
  `updated_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `bank_accounts_branch_id_index` (`branch_id`),
  UNIQUE KEY `bank_accounts_branch_bank_suffix_unique` (`branch_id`, `bank_name`, `account_suffix`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `bank_sms_devices` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `branch_id` INT UNSIGNED NOT NULL,
  `label` VARCHAR(100) NOT NULL,
  `token_hash` CHAR(64) NOT NULL,
  `token_hint` VARCHAR(8) NOT NULL,
  `created_by` BIGINT UNSIGNED NULL,
  `last_used_at` TIMESTAMP NULL DEFAULT NULL,
  `revoked_at` TIMESTAMP NULL DEFAULT NULL,
  `sync_request_version` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `sync_completed_version` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NULL DEFAULT NULL,
  `updated_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `bank_sms_devices_token_hash_unique` (`token_hash`),
  KEY `bank_sms_devices_branch_id_index` (`branch_id`),
  KEY `bank_sms_devices_created_by_index` (`created_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `bank_sms_alerts` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `bank_account_id` BIGINT UNSIGNED NULL,
  `device_id` BIGINT UNSIGNED NULL,
  `branch_id` INT UNSIGNED NULL,
  `sender` VARCHAR(40) NOT NULL,
  `account_suffix` VARCHAR(4) NOT NULL,
  `direction` VARCHAR(12) NOT NULL,
  `amount` DECIMAL(12,2) NOT NULL,
  `transaction_reference` VARCHAR(80) NOT NULL,
  `transaction_date` DATE NOT NULL,
  `available_balance` DECIMAL(12,2) NOT NULL,
  `received_at` TIMESTAMP NOT NULL,
  `status` VARCHAR(16) NOT NULL DEFAULT 'pending',
  `reviewed_by` BIGINT UNSIGNED NULL,
  `reviewed_at` TIMESTAMP NULL DEFAULT NULL,
  `bank_deposit_id` BIGINT UNSIGNED NULL,
  `created_at` TIMESTAMP NULL DEFAULT NULL,
  `updated_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `bank_sms_alert_reference_unique` (`sender`, `account_suffix`, `transaction_reference`),
  KEY `bank_sms_alerts_bank_account_id_index` (`bank_account_id`),
  KEY `bank_sms_alerts_device_id_index` (`device_id`),
  KEY `bank_sms_alerts_branch_id_index` (`branch_id`),
  KEY `bank_sms_alerts_status_index` (`status`),
  KEY `bank_sms_alerts_reviewed_by_index` (`reviewed_by`),
  KEY `bank_sms_alerts_bank_deposit_id_index` (`bank_deposit_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create Laravel's migration tracker if this database predates Laravel migrations.
CREATE TABLE IF NOT EXISTS `migrations` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `migration` VARCHAR(255) NOT NULL,
  `batch` INT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `migrations_migration_unique` (`migration`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Record the migration so a later `php artisan migrate` does not try to recreate these tables.
SET @bank_sms_migration_batch = (SELECT COALESCE(MAX(`batch`), 0) + 1 FROM `migrations`);
INSERT INTO `migrations` (`migration`, `batch`)
SELECT '2026_10_25_000001_create_bank_sms_alert_tables', @bank_sms_migration_batch
WHERE NOT EXISTS (
  SELECT 1 FROM `migrations`
  WHERE `migration` = '2026_10_25_000001_create_bank_sms_alert_tables'
);
