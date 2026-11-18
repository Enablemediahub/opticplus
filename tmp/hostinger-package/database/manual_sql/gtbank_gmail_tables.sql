-- Run once against the OpticPlus production database before deploying the
-- GTBank Gmail integration. These tables are also created by the Laravel
-- migration 2026_11_18_120000_create_bank_gmail_connections.php.

CREATE TABLE IF NOT EXISTS `bank_gmail_connections` (
  `id` TINYINT UNSIGNED NOT NULL DEFAULT 1,
  `email` VARCHAR(255) NULL,
  `access_token` TEXT NULL,
  `refresh_token` TEXT NULL,
  `token_expires_at` TIMESTAMP NULL DEFAULT NULL,
  `last_synced_at` TIMESTAMP NULL DEFAULT NULL,
  `last_sync_message_at` TIMESTAMP NULL DEFAULT NULL,
  `oauth_state` VARCHAR(64) NULL,
  `last_error` TEXT NULL,
  `created_at` TIMESTAMP NULL DEFAULT NULL,
  `updated_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `bank_gmail_messages` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `gmail_message_id` VARCHAR(255) NOT NULL,
  `sender` VARCHAR(255) NOT NULL,
  `account_suffix` VARCHAR(4) NULL,
  `current_balance` DECIMAL(12,2) NOT NULL,
  `available_balance` DECIMAL(12,2) NULL,
  `email_at` TIMESTAMP NOT NULL,
  `processed_at` TIMESTAMP NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT NULL,
  `updated_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `bank_gmail_messages_gmail_message_id_unique` (`gmail_message_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
