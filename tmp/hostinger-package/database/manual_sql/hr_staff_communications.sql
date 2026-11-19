-- Staff messages and private PDF documents from the General Manager / HR.
-- Run once in phpMyAdmin before deploying the staff communications API/frontend.

CREATE TABLE IF NOT EXISTS `hr_staff_communications` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `employee_id` INT UNSIGNED NULL,
  `title` VARCHAR(180) NOT NULL,
  `message` TEXT NULL,
  `attachment_path` VARCHAR(255) NULL,
  `attachment_name` VARCHAR(255) NULL,
  `created_by` BIGINT UNSIGNED NULL,
  `published_at` TIMESTAMP NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT NULL,
  `updated_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `hr_staff_communications_employee_id_index` (`employee_id`),
  KEY `hr_staff_communications_published_at_index` (`published_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `hr_staff_communication_reads` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `communication_id` BIGINT UNSIGNED NOT NULL,
  `employee_id` INT UNSIGNED NOT NULL,
  `read_at` TIMESTAMP NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT NULL,
  `updated_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `hr_staff_communication_reads_unique` (`communication_id`, `employee_id`),
  KEY `hr_staff_communication_reads_employee_id_index` (`employee_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
