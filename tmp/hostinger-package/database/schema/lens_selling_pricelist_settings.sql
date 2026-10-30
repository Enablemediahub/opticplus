CREATE TABLE IF NOT EXISTS `lens_selling_price_settings` (
  `branch_id` BIGINT UNSIGNED NOT NULL,
  `receptionist_override_allowed` TINYINT(1) NOT NULL DEFAULT 1,
  `updated_by` BIGINT UNSIGNED NULL,
  `created_at` TIMESTAMP NULL,
  `updated_at` TIMESTAMP NULL,
  PRIMARY KEY (`branch_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
