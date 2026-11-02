-- Run against the OpticPlus database before uploading the staff appraisal update.
-- Mirrors Laravel migration 2026_11_01_000001_create_staff_appraisal_tables.

CREATE TABLE IF NOT EXISTS `staff_appraisal_settings` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `branch_id` INT UNSIGNED NOT NULL,
  `is_enabled` TINYINT(1) NOT NULL DEFAULT 0,
  `updated_by` BIGINT UNSIGNED NULL,
  `created_at` TIMESTAMP NULL DEFAULT NULL,
  `updated_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `staff_appraisal_settings_branch_id_unique` (`branch_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `staff_appraisal_periods` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `branch_id` INT UNSIGNED NOT NULL,
  `title` VARCHAR(160) NOT NULL,
  `period_type` ENUM('daily','weekly','monthly') NOT NULL,
  `start_date` DATE NOT NULL,
  `end_date` DATE NOT NULL,
  `status` ENUM('active','finalized') NOT NULL DEFAULT 'active',
  `created_by` BIGINT UNSIGNED NULL,
  `finalized_at` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP NULL DEFAULT NULL,
  `updated_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `staff_appraisal_period_lookup_idx` (`branch_id`,`status`,`start_date`,`end_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `staff_appraisal_tasks` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `period_id` BIGINT UNSIGNED NOT NULL,
  `title` VARCHAR(180) NOT NULL,
  `description` TEXT NULL,
  `target_value` DECIMAL(12,2) NULL,
  `unit` VARCHAR(40) NULL,
  `weight` DECIMAL(6,2) NOT NULL DEFAULT 1,
  `measurement` ENUM('checklist','target') NOT NULL DEFAULT 'checklist',
  `assigned_role` VARCHAR(40) NULL,
  `sort_order` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NULL DEFAULT NULL,
  `updated_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `staff_appraisal_tasks_period_id_index` (`period_id`),
  CONSTRAINT `staff_appraisal_tasks_period_id_foreign` FOREIGN KEY (`period_id`) REFERENCES `staff_appraisal_periods` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `staff_appraisal_assignments` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `task_id` BIGINT UNSIGNED NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `role_snapshot` VARCHAR(40) NOT NULL,
  `status` ENUM('pending','in_progress','completed') NOT NULL DEFAULT 'pending',
  `achieved_value` DECIMAL(12,2) NULL,
  `staff_note` TEXT NULL,
  `acknowledged_at` TIMESTAMP NULL DEFAULT NULL,
  `submitted_at` TIMESTAMP NULL DEFAULT NULL,
  `manager_score` DECIMAL(5,2) NULL,
  `manager_note` TEXT NULL,
  `reviewed_by` BIGINT UNSIGNED NULL,
  `reviewed_at` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP NULL DEFAULT NULL,
  `updated_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `staff_appraisal_task_user_unique` (`task_id`,`user_id`),
  KEY `staff_appraisal_user_status_idx` (`user_id`,`status`),
  CONSTRAINT `staff_appraisal_assignments_task_id_foreign` FOREIGN KEY (`task_id`) REFERENCES `staff_appraisal_tasks` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `migrations` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `migration` VARCHAR(255) NOT NULL,
  `batch` INT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `migrations_migration_unique` (`migration`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @staff_appraisal_migration_batch = (SELECT COALESCE(MAX(`batch`), 0) + 1 FROM `migrations`);
INSERT INTO `migrations` (`migration`, `batch`)
SELECT '2026_11_01_000001_create_staff_appraisal_tables', @staff_appraisal_migration_batch
WHERE NOT EXISTS (
  SELECT 1 FROM `migrations`
  WHERE `migration` = '2026_11_01_000001_create_staff_appraisal_tables'
);
