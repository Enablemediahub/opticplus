-- Reusable private General Manager signature for staff letters.
-- Run once in phpMyAdmin before deploying the signature upload API/frontend.

CREATE TABLE `hr_letter_manager_signatures` (
  `id` TINYINT UNSIGNED NOT NULL,
  `file_path` VARCHAR(255) NOT NULL,
  `mime_type` VARCHAR(64) NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT NULL,
  `updated_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
