-- Run once in phpMyAdmin before uploading the folder ID allocator backend.
-- The legacy seed preserves the next number after existing receptionist IDs.

CREATE TABLE IF NOT EXISTS `patient_folder_id_allocations` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `folder_id` VARCHAR(60) NULL DEFAULT NULL,
  `initials` CHAR(3) NOT NULL,
  `issued_year` CHAR(4) NOT NULL,
  `status` VARCHAR(16) NOT NULL DEFAULT 'reserved',
  `patient_record_id` INT UNSIGNED NULL DEFAULT NULL,
  `created_at` TIMESTAMP NULL DEFAULT NULL,
  `updated_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `patient_folder_id_allocations_folder_id_unique` (`folder_id`),
  KEY `patient_folder_id_allocations_status_index` (`status`),
  KEY `patient_folder_id_allocations_patient_record_id_index` (`patient_record_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @highest_existing_folder_sequence = (
  SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(`folder_id`, '/', 2), '/', -1) AS UNSIGNED)), 0)
  FROM `patient_records`
  WHERE UPPER(`folder_id`) REGEXP '^BOC-[A-Z0-9]{2,3}/[0-9]{4,}/[0-9]{4}$'
);

SET @seed_folder_sequence_sql = IF(
  @highest_existing_folder_sequence > 0,
  CONCAT(
    'INSERT IGNORE INTO `patient_folder_id_allocations` (`id`, `folder_id`, `initials`, `issued_year`, `status`, `created_at`, `updated_at`) VALUES (',
    @highest_existing_folder_sequence,
    ', NULL, ''LEG'', ''0000'', ''legacy'', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)'
  ),
  'SELECT 1'
);
PREPARE seed_folder_sequence_stmt FROM @seed_folder_sequence_sql;
EXECUTE seed_folder_sequence_stmt;
DEALLOCATE PREPARE seed_folder_sequence_stmt;
