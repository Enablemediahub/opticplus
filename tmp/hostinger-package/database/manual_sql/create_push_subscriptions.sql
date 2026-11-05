CREATE TABLE `push_subscriptions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `branch_id` INT UNSIGNED NOT NULL,
  `endpoint_hash` CHAR(64) NOT NULL,
  `endpoint` TEXT NOT NULL,
  `subscription_json` LONGTEXT NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT NULL,
  `updated_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `push_subscriptions_user_id_endpoint_hash_unique` (`user_id`, `endpoint_hash`),
  KEY `push_subscriptions_branch_id_index` (`branch_id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
