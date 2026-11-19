-- Bealet HR Space schema for Hostinger/phpMyAdmin.
-- Run once against the OpticPlus database BEFORE uploading the new backend code.
-- Uses InnoDB and Laravel-compatible BIGINT UNSIGNED auto-increment IDs.

CREATE TABLE `staff_portal_accounts` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `employee_id` INT UNSIGNED NOT NULL,
  `staff_id` VARCHAR(20) NOT NULL,
  `password` VARCHAR(255) NOT NULL,
  `must_change_password` TINYINT(1) NOT NULL DEFAULT 1,
  `session_version` INT UNSIGNED NOT NULL DEFAULT 1,
  `failed_attempts` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `locked_until` TIMESTAMP NULL DEFAULT NULL,
  `last_login_at` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP NULL DEFAULT NULL,
  `updated_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `staff_portal_accounts_employee_id_unique` (`employee_id`),
  UNIQUE KEY `staff_portal_accounts_staff_id_unique` (`staff_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `hr_staff_signatures` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `employee_id` INT UNSIGNED NOT NULL,
  `file_path` VARCHAR(255) NOT NULL,
  `mime_type` VARCHAR(64) NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT NULL,
  `updated_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `hr_staff_signatures_employee_id_unique` (`employee_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `hr_letter_manager_signatures` (
  `id` TINYINT UNSIGNED NOT NULL,
  `file_path` VARCHAR(255) NOT NULL,
  `mime_type` VARCHAR(64) NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT NULL,
  `updated_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `hr_staff_communications` (
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

CREATE TABLE `hr_staff_communication_reads` (
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

CREATE TABLE `hr_letters` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `employee_id` INT UNSIGNED NULL,
  `title` VARCHAR(180) NOT NULL,
  `body` LONGTEXT NOT NULL,
  `status` VARCHAR(24) NOT NULL DEFAULT 'draft',
  `created_by` BIGINT UNSIGNED NULL,
  `published_at` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP NULL DEFAULT NULL,
  `updated_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `hr_letters_employee_id_index` (`employee_id`),
  KEY `hr_letters_status_index` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `hr_letter_templates` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(180) NOT NULL,
  `body` LONGTEXT NOT NULL,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_by` BIGINT UNSIGNED NULL,
  `created_at` TIMESTAMP NULL DEFAULT NULL,
  `updated_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `hr_letter_templates_active_index` (`active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `hr_requests` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `employee_id` INT UNSIGNED NOT NULL,
  `request_type` VARCHAR(32) NOT NULL,
  `leave_type` VARCHAR(32) NULL,
  `start_date` DATE NULL,
  `end_date` DATE NULL,
  `working_days_requested` DECIMAL(6,2) NULL,
  `handover_person` VARCHAR(180) NULL,
  `outstanding_duties` TEXT NULL,
  `notification_date` DATE NULL,
  `working_days_approved` DECIMAL(6,2) NULL,
  `leave_remuneration` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `interrupted_working_days` DECIMAL(6,2) NOT NULL DEFAULT 0.00,
  `leave_year` SMALLINT UNSIGNED NULL,
  `reason` TEXT NOT NULL,
  `attachment_path` VARCHAR(255) NULL,
  `attachment_name` VARCHAR(255) NULL,
  `status` VARCHAR(24) NOT NULL DEFAULT 'pending',
  `review_note` TEXT NULL,
  `reviewed_by` BIGINT UNSIGNED NULL,
  `reviewed_at` TIMESTAMP NULL DEFAULT NULL,
  `submitted_at` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP NULL DEFAULT NULL,
  `updated_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `hr_requests_employee_id_index` (`employee_id`),
  KEY `hr_requests_request_type_index` (`request_type`),
  KEY `hr_requests_leave_year_index` (`leave_year`),
  KEY `hr_requests_status_index` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `hr_leave_entitlements` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `employee_id` INT UNSIGNED NOT NULL,
  `leave_year` SMALLINT UNSIGNED NOT NULL,
  `entitlement_days` DECIMAL(7,2) NOT NULL DEFAULT 15.00,
  `carried_forward_days` DECIMAL(7,2) NOT NULL DEFAULT 0.00,
  `working_days` LONGTEXT NULL,
  `adjustment_note` TEXT NULL,
  `entitlement_start_date` DATE NULL,
  `updated_by` BIGINT UNSIGNED NULL,
  `created_at` TIMESTAMP NULL DEFAULT NULL,
  `updated_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `hr_leave_employee_year_unique` (`employee_id`,`leave_year`),
  KEY `hr_leave_entitlements_employee_id_index` (`employee_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `hr_public_holidays` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `holiday_date` DATE NOT NULL,
  `name` VARCHAR(180) NOT NULL,
  `notes` TEXT NULL,
  `created_by` BIGINT UNSIGNED NULL,
  `created_at` TIMESTAMP NULL DEFAULT NULL,
  `updated_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `hr_public_holidays_holiday_date_unique` (`holiday_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `hr_kpi_rules` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(180) NOT NULL,
  `description` TEXT NULL,
  `target_value` DECIMAL(10,2) NULL,
  `full_score_allowance` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_by` BIGINT UNSIGNED NULL,
  `created_at` TIMESTAMP NULL DEFAULT NULL,
  `updated_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `hr_kpi_rules_active_index` (`active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `hr_kpi_results` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `employee_id` INT UNSIGNED NOT NULL,
  `rule_id` BIGINT UNSIGNED NOT NULL,
  `period` CHAR(7) NOT NULL,
  `score` DECIMAL(5,2) NOT NULL,
  `calculated_allowance` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `status` VARCHAR(24) NOT NULL DEFAULT 'draft',
  `notes` TEXT NULL,
  `evaluated_by` BIGINT UNSIGNED NULL,
  `reviewed_by` BIGINT UNSIGNED NULL,
  `reviewed_at` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP NULL DEFAULT NULL,
  `updated_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `hr_kpi_employee_rule_period_unique` (`employee_id`,`rule_id`,`period`),
  KEY `hr_kpi_results_employee_id_index` (`employee_id`),
  KEY `hr_kpi_results_rule_id_index` (`rule_id`),
  KEY `hr_kpi_results_period_index` (`period`),
  KEY `hr_kpi_results_status_index` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migration 2026_11_19_000003_add_private_uploads_to_hr_letters.php
ALTER TABLE `hr_letters`
  ADD COLUMN `attachment_path` VARCHAR(255) NULL AFTER `body`,
  ADD COLUMN `attachment_name` VARCHAR(255) NULL AFTER `attachment_path`;

-- Migration 2026_11_19_000004_add_role_targets_and_seed_hr_letter_templates.php
ALTER TABLE `hr_letters`
  ADD COLUMN `target_role` VARCHAR(180) NULL AFTER `employee_id`,
  ADD KEY `hr_letters_target_role_index` (`target_role`);

-- Default GM-editable letter templates. These are inserted only when missing.
INSERT INTO `hr_letter_templates` (`title`,`body`,`active`,`created_by`,`created_at`,`updated_at`)
SELECT '2027 Employment Renewal Letter',
'Date: {date}\nTo: {employee_name}\nPosition: {job_title}\n\nSUBJECT: RENEWAL OF EMPLOYMENT FOR THE 2027 WORKING YEAR\n\nDear {employee_name},\n\nFollowing a review of the Company''s staffing requirements and your employment, Bealet Optical Centre Limited is pleased to offer you a renewal of your employment as {job_title} for the 2027 working year.\n\nYour renewed employment shall commence on [START DATE], subject to the terms and conditions contained in the attached Employment Renewal Agreement.\n\nYour agreed net monthly remuneration shall be GH₵[AMOUNT], subject to the payroll and statutory treatment stated in the agreement. Your responsibilities, reporting arrangements and performance expectations are outlined in your attached Job Description.\n\nAs part of the Company''s commitment to improving productivity and rewarding excellent performance, you may also qualify for additional monthly performance-based allowances upon achieving approved targets.\n\nPlease read the attached documents carefully, sign where indicated and return the signed copies to Management by [RETURN DATE].\n\nWe appreciate your contribution to Bealet Optical Centre and look forward to your continued commitment and professionalism.\n\nYours faithfully,\n\nAUTHORISED SIGNATORY\nFor: Bealet Optical Centre Limited',
1,NULL,NOW(),NOW()
WHERE NOT EXISTS (SELECT 1 FROM `hr_letter_templates` WHERE `title`='2027 Employment Renewal Letter');

INSERT INTO `hr_letter_templates` (`title`,`body`,`active`,`created_by`,`created_at`,`updated_at`)
SELECT 'Probation Confirmation Letter',
'Date: {date}\nTo: {employee_name}\nStaff ID: {staff_id}\nPosition: {job_title}\n\nSUBJECT: CONFIRMATION OF APPOINTMENT\n\nDear {employee_name},\n\nFollowing the review of your performance during the probation period, Management is pleased to confirm your appointment as {job_title} with effect from [EFFECTIVE DATE].\n\nYour employment shall continue under the terms of your employment agreement and the Company''s Conditions of Service.\n\nWe congratulate you and look forward to your continued contribution.\n\nYours faithfully,\n\n[AUTHORISED SIGNATORY]\nFor: Bealet Optical Centre Limited',
1,NULL,NOW(),NOW()
WHERE NOT EXISTS (SELECT 1 FROM `hr_letter_templates` WHERE `title`='Probation Confirmation Letter');

INSERT INTO `hr_letter_templates` (`title`,`body`,`active`,`created_by`,`created_at`,`updated_at`)
SELECT 'Contract Amendment Letter',
'Date: {date}\nTo: {employee_name}\nStaff ID: {staff_id}\nPosition: {job_title}\n\nSUBJECT: AMENDMENT TO EMPLOYMENT TERMS\n\nDear {employee_name},\n\nThis letter confirms the following agreed amendment to your employment terms:\n\n[STATE AMENDMENT]\n\nThe amendment shall take effect from [EFFECTIVE DATE]. All other provisions of your existing employment agreement shall remain unchanged, subject to applicable law.\n\nPlease sign below to acknowledge and agree to this amendment.\n\nEmployer: ______________________________\nEmployee: ______________________________\nDate: __________________________________\n\nFor: Bealet Optical Centre Limited',
1,NULL,NOW(),NOW()
WHERE NOT EXISTS (SELECT 1 FROM `hr_letter_templates` WHERE `title`='Contract Amendment Letter');

INSERT INTO `hr_letter_templates` (`title`,`body`,`active`,`created_by`,`created_at`,`updated_at`)
SELECT 'Query Letter — Request for Written Explanation',
'Date: {date}\nTo: {employee_name}\nStaff ID: {staff_id}\nPosition: {job_title}\n\nSUBJECT: REQUEST FOR WRITTEN EXPLANATION\n\nDear {employee_name},\n\nManagement wishes to seek clarification concerning the following reported incident:\n\n[STATE FACTS OF INCIDENT]\n\nYou are requested to submit a written explanation by [RESPONSE DEADLINE]. No final conclusion has been reached at this stage. You are encouraged to provide any relevant information or supporting documentation.\n\nYours faithfully,\n\n[AUTHORISED SIGNATORY]\nFor: Bealet Optical Centre Limited',
1,NULL,NOW(),NOW()
WHERE NOT EXISTS (SELECT 1 FROM `hr_letter_templates` WHERE `title`='Query Letter — Request for Written Explanation');

INSERT INTO `hr_letter_templates` (`title`,`body`,`active`,`created_by`,`created_at`,`updated_at`)
SELECT 'Written Warning Letter',
'Date: {date}\nTo: {employee_name}\nStaff ID: {staff_id}\nPosition: {job_title}\n\nSUBJECT: FORMAL WRITTEN WARNING\n\nDear {employee_name},\n\nFollowing the investigation into [INCIDENT], including consideration of your response dated [RESPONSE DATE], Management has determined that [STATE FINDING AND REASONS]. This conduct falls below the standards expected of employees of Bealet Optical Centre Limited.\n\nYou are hereby issued a [FIRST/FINAL] written warning. You are expected to take immediate corrective action by:\n\n[STATE REQUIRED IMPROVEMENT]\n\nFurther similar misconduct may result in additional disciplinary action, subject to applicable law and fair procedure.\n\nYours faithfully,\n\n[AUTHORISED SIGNATORY]\nFor: Bealet Optical Centre Limited',
1,NULL,NOW(),NOW()
WHERE NOT EXISTS (SELECT 1 FROM `hr_letter_templates` WHERE `title`='Written Warning Letter');

INSERT INTO `hr_letter_templates` (`title`,`body`,`active`,`created_by`,`created_at`,`updated_at`)
SELECT 'Resignation Acceptance Letter',
'Date: {date}\nTo: {employee_name}\nStaff ID: {staff_id}\nPosition: {job_title}\n\nSUBJECT: ACKNOWLEDGEMENT OF RESIGNATION\n\nDear {employee_name},\n\nThe Company acknowledges receipt of your resignation dated [RESIGNATION DATE]. Your proposed final working day shall be [FINAL WORKING DAY], subject to the applicable notice provisions.\n\nYou are required to complete the necessary handover and return all company property. Your final remuneration and other outstanding entitlements will be processed in accordance with applicable law.\n\nYours faithfully,\n\n[AUTHORISED SIGNATORY]\nFor: Bealet Optical Centre Limited',
1,NULL,NOW(),NOW()
WHERE NOT EXISTS (SELECT 1 FROM `hr_letter_templates` WHERE `title`='Resignation Acceptance Letter');

INSERT INTO `hr_letter_templates` (`title`,`body`,`active`,`created_by`,`created_at`,`updated_at`)
SELECT 'Employment Non-Renewal Letter',
'Date: {date}\nTo: {employee_name}\nStaff ID: {staff_id}\nPosition: {job_title}\n\nSUBJECT: NOTICE OF NON-RENEWAL OF EMPLOYMENT\n\nDear {employee_name},\n\nWe refer to your employment agreement dated [AGREEMENT DATE]. The Company hereby notifies you that it does not intend to offer a further renewal following the expiry of the agreement on [EXPIRY DATE].\n\nThe Company will arrange the necessary handover and clearance procedures. All outstanding remuneration and other lawful entitlements shall be settled in accordance with applicable law.\n\nYours faithfully,\n\n[AUTHORISED SIGNATORY]\nFor: Bealet Optical Centre Limited\n\nGM REVIEW REQUIRED: Review this notice against the employee''s actual continuous service and contractual circumstances before issue.',
1,NULL,NOW(),NOW()
WHERE NOT EXISTS (SELECT 1 FROM `hr_letter_templates` WHERE `title`='Employment Non-Renewal Letter');
