-- Run this before deploying the user sign-in presence backend changes.
-- Historical login timestamps cannot be reconstructed; last_login_at is set
-- when each user next signs in after deployment.

SET @last_login_column_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'last_login_at'
);
SET @last_login_column_sql = IF(
  @last_login_column_exists = 0,
  'ALTER TABLE `users` ADD COLUMN `last_login_at` TIMESTAMP NULL DEFAULT NULL',
  'SELECT 1'
);
PREPARE add_last_login_column FROM @last_login_column_sql;
EXECUTE add_last_login_column;
DEALLOCATE PREPARE add_last_login_column;

CREATE TABLE IF NOT EXISTS `user_presence_sessions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `branch_id` INT UNSIGNED NULL,
  `token_hash` CHAR(64) NOT NULL,
  `last_seen_at` TIMESTAMP NOT NULL,
  `logged_out_at` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP NULL DEFAULT NULL,
  `updated_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_presence_sessions_token_hash_unique` (`token_hash`),
  KEY `user_presence_sessions_user_id_index` (`user_id`),
  KEY `user_presence_sessions_branch_id_index` (`branch_id`),
  KEY `user_presence_sessions_last_seen_at_index` (`last_seen_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
