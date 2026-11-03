-- Run once in phpMyAdmin before uploading the public registration endpoint.
-- Safe to re-run; existing columns are left untouched.

SET @registration_source_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'patient_records'
    AND COLUMN_NAME = 'registration_source'
);
SET @registration_source_ddl = IF(
  @registration_source_exists = 0,
  'ALTER TABLE `patient_records` ADD COLUMN `registration_source` VARCHAR(32) NULL',
  'SELECT 1'
);
PREPARE registration_source_stmt FROM @registration_source_ddl;
EXECUTE registration_source_stmt;
DEALLOCATE PREPARE registration_source_stmt;

SET @privacy_consent_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'patient_records'
    AND COLUMN_NAME = 'privacy_consent_at'
);
SET @privacy_consent_ddl = IF(
  @privacy_consent_exists = 0,
  'ALTER TABLE `patient_records` ADD COLUMN `privacy_consent_at` TIMESTAMP NULL DEFAULT NULL AFTER `registration_source`',
  'SELECT 1'
);
PREPARE privacy_consent_stmt FROM @privacy_consent_ddl;
EXECUTE privacy_consent_stmt;
DEALLOCATE PREPARE privacy_consent_stmt;
