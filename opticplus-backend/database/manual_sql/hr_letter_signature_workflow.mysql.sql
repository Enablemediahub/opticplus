-- Apply once to an existing HR Space database if Artisan migrations are unavailable.
ALTER TABLE `hr_letters`
  ADD COLUMN `requires_signature` TINYINT(1) NOT NULL DEFAULT 0;

ALTER TABLE `hr_letter_templates`
  ADD COLUMN `requires_signature` TINYINT(1) NOT NULL DEFAULT 0;

CREATE TABLE `hr_letter_signatures` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `letter_id` BIGINT UNSIGNED NOT NULL,
  `employee_id` INT UNSIGNED NOT NULL,
  `signature_path` VARCHAR(255) NOT NULL,
  `mime_type` VARCHAR(64) NOT NULL,
  `signed_at` TIMESTAMP NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT NULL,
  `updated_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `hr_letter_signatures_letter_employee_unique` (`letter_id`, `employee_id`),
  KEY `hr_letter_signatures_employee_id_index` (`employee_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
