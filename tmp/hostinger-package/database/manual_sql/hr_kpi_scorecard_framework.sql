-- Editable Bealet role-specific KPI scorecards and monthly allowance assessments.
-- Run once in phpMyAdmin before uploading the new backend code.
-- Default maximum allowances are deliberately zero; management must set approved amounts.

CREATE TABLE IF NOT EXISTS `hr_kpi_scorecards` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `role_title` VARCHAR(180) NOT NULL,
  `branch` VARCHAR(120) NOT NULL DEFAULT '*',
  `max_monthly_allowance` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_by` BIGINT UNSIGNED NULL,
  `updated_by` BIGINT UNSIGNED NULL,
  `created_at` TIMESTAMP NULL DEFAULT NULL,
  `updated_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `hr_kpi_scorecards_role_branch_unique` (`role_title`, `branch`),
  KEY `hr_kpi_scorecards_active_index` (`active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `hr_kpi_scorecard_items` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `scorecard_id` BIGINT UNSIGNED NOT NULL,
  `title` VARCHAR(180) NOT NULL,
  `description` TEXT NULL,
  `weight` TINYINT UNSIGNED NOT NULL,
  `target_description` TEXT NULL,
  `target_value` DECIMAL(12,2) NULL,
  `target_unit` VARCHAR(40) NULL,
  `direction` VARCHAR(16) NOT NULL DEFAULT 'quality',
  `sort_order` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NULL DEFAULT NULL,
  `updated_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `hr_kpi_scorecard_items_scorecard_id_index` (`scorecard_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `hr_kpi_allowance_bands` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `minimum_score` DECIMAL(5,2) NOT NULL,
  `payout_percent` DECIMAL(5,2) NOT NULL,
  `label` VARCHAR(80) NOT NULL,
  `sort_order` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NULL DEFAULT NULL,
  `updated_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `hr_kpi_allowance_bands_minimum_score_unique` (`minimum_score`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `hr_kpi_assessments` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `employee_id` INT UNSIGNED NOT NULL,
  `scorecard_id` BIGINT UNSIGNED NULL,
  `period` CHAR(7) NOT NULL,
  `role_title_snapshot` VARCHAR(180) NOT NULL,
  `branch_snapshot` VARCHAR(120) NULL,
  `max_monthly_allowance` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `total_score` DECIMAL(5,2) NOT NULL DEFAULT 0,
  `allowance_percent` DECIMAL(5,2) NOT NULL DEFAULT 0,
  `calculated_allowance` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `status` VARCHAR(24) NOT NULL DEFAULT 'draft',
  `summary_notes` TEXT NULL,
  `targets_confirmed_at` TIMESTAMP NULL DEFAULT NULL,
  `targets_confirmed_by` BIGINT UNSIGNED NULL,
  `employee_comment` TEXT NULL,
  `employee_comment_at` TIMESTAMP NULL DEFAULT NULL,
  `manager_response` TEXT NULL,
  `evaluated_by` BIGINT UNSIGNED NULL,
  `reviewed_by` BIGINT UNSIGNED NULL,
  `reviewed_at` TIMESTAMP NULL DEFAULT NULL,
  `published_at` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP NULL DEFAULT NULL,
  `updated_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `hr_kpi_assessment_employee_period_unique` (`employee_id`, `period`),
  KEY `hr_kpi_assessments_scorecard_id_index` (`scorecard_id`),
  KEY `hr_kpi_assessments_period_index` (`period`),
  KEY `hr_kpi_assessments_status_index` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `hr_kpi_assessment_items` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `assessment_id` BIGINT UNSIGNED NOT NULL,
  `scorecard_item_id` BIGINT UNSIGNED NULL,
  `title_snapshot` VARCHAR(180) NOT NULL,
  `description_snapshot` TEXT NULL,
  `weight` TINYINT UNSIGNED NOT NULL,
  `target_description_snapshot` TEXT NULL,
  `target_value_snapshot` DECIMAL(12,2) NULL,
  `target_unit_snapshot` VARCHAR(40) NULL,
  `direction_snapshot` VARCHAR(16) NOT NULL DEFAULT 'quality',
  `rating` TINYINT UNSIGNED NULL,
  `earned_points` DECIMAL(5,2) NOT NULL DEFAULT 0,
  `evidence` TEXT NULL,
  `notes` TEXT NULL,
  `created_at` TIMESTAMP NULL DEFAULT NULL,
  `updated_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `hr_kpi_assessment_items_assessment_id_index` (`assessment_id`),
  KEY `hr_kpi_assessment_items_scorecard_item_id_index` (`scorecard_item_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `hr_kpi_allowance_bands` (`minimum_score`, `payout_percent`, `label`, `sort_order`, `created_at`, `updated_at`) VALUES
(0, 0, 'Unsatisfactory', 0, NOW(), NOW()),
(70, 20, 'Needs improvement', 1, NOW(), NOW()),
(75, 40, 'Satisfactory', 2, NOW(), NOW()),
(80, 60, 'Good', 3, NOW(), NOW()),
(85, 75, 'Very good', 4, NOW(), NOW()),
(90, 90, 'Excellent', 5, NOW(), NOW()),
(95, 100, 'Outstanding', 6, NOW(), NOW());

INSERT INTO `hr_kpi_scorecards` (`role_title`, `branch`, `max_monthly_allowance`, `active`, `created_at`, `updated_at`)
SELECT `seed`.`role_title`, '*', 0, 1, NOW(), NOW()
FROM (
  SELECT 'General Manager' AS `role_title`
  UNION ALL SELECT 'Optometrist'
  UNION ALL SELECT 'Accountant'
  UNION ALL SELECT 'Technician'
  UNION ALL SELECT 'Receptionist/Cashier'
  UNION ALL SELECT 'Showroom Attendant'
) AS `seed`
WHERE NOT EXISTS (
  SELECT 1 FROM `hr_kpi_scorecards` AS `existing`
  WHERE `existing`.`role_title` = `seed`.`role_title` AND `existing`.`branch` = '*'
);

INSERT INTO `hr_kpi_scorecard_items` (`scorecard_id`, `title`, `description`, `weight`, `target_description`, `direction`, `sort_order`, `active`, `created_at`, `updated_at`)
SELECT `scorecard`.`id`, `seed`.`title`, `seed`.`description`, `seed`.`weight`,
  'Set and communicate a measurable target before the month begins. Define the evidence and how exceptional circumstances will be handled.',
  'quality', `seed`.`sort_order`, 1, NOW(), NOW()
FROM `hr_kpi_scorecards` AS `scorecard`
JOIN (
  SELECT 'Financial performance and sales oversight' AS `title`, 'Achievement against approved monthly branch sales targets, expense control and financial performance monitoring.' AS `description`, 20 AS `weight`, 0 AS `sort_order`
  UNION ALL SELECT 'Operational management', 'Smooth running of both branches, equipment, facilities, systems and daily operations.', 20, 1
  UNION ALL SELECT 'Staff management and HR compliance', 'Attendance management, staff supervision, performance reviews, leave records and timely HR action.', 15, 2
  UNION ALL SELECT 'Financial controls and reporting', 'Accuracy and timely submission of management reports, cash controls, banking and follow-up of financial discrepancies.', 15, 3
  UNION ALL SELECT 'Customer service and service quality', 'Complaint resolution, customer experience and service standards across branches.', 10, 4
  UNION ALL SELECT 'Strategic execution and Board directives', 'Delivery of Board-approved projects, budgets, decisions and operational improvements.', 15, 5
  UNION ALL SELECT 'Compliance and risk management', 'Regulatory matters, documentation, safety and business risk escalation.', 5, 6
) AS `seed`
WHERE `scorecard`.`role_title` = 'General Manager' AND `scorecard`.`branch` = '*'
  AND NOT EXISTS (SELECT 1 FROM `hr_kpi_scorecard_items` AS `existing` WHERE `existing`.`scorecard_id` = `scorecard`.`id` AND `existing`.`title` = `seed`.`title`);

INSERT INTO `hr_kpi_scorecard_items` (`scorecard_id`, `title`, `description`, `weight`, `target_description`, `direction`, `sort_order`, `active`, `created_at`, `updated_at`)
SELECT `scorecard`.`id`, `seed`.`title`, `seed`.`description`, `seed`.`weight`,
  'Set and communicate a measurable target before the month begins. Define the evidence and how exceptional circumstances will be handled.',
  'quality', `seed`.`sort_order`, 1, NOW(), NOW()
FROM `hr_kpi_scorecards` AS `scorecard`
JOIN (
  SELECT 'Clinical quality and professional standards' AS `title`, 'Appropriate examinations, accurate clinical records, professional judgement and adherence to clinical standards.' AS `description`, 30 AS `weight`, 0 AS `sort_order`
  UNION ALL SELECT 'Patient experience and communication', 'Patient satisfaction, clear explanations, respectful treatment and appropriate follow-up.', 20, 1
  UNION ALL SELECT 'Patient records and digital documentation', 'Completeness, accuracy and timely entry of examination findings and prescriptions.', 15, 2
  UNION ALL SELECT 'Punctuality and availability', 'Attendance, punctuality and availability during agreed working hours.', 10, 3
  UNION ALL SELECT 'Equipment and clinical room management', 'Care of equipment, cleanliness, reporting faults and readiness of the examination room.', 10, 4
  UNION ALL SELECT 'Teamwork and coordination', 'Effective coordination with reception, technician and other staff.', 10, 5
  UNION ALL SELECT 'Professional development and compliance', 'Professional registration, training and continuing professional development.', 5, 6
) AS `seed`
WHERE `scorecard`.`role_title` = 'Optometrist' AND `scorecard`.`branch` = '*'
  AND NOT EXISTS (SELECT 1 FROM `hr_kpi_scorecard_items` AS `existing` WHERE `existing`.`scorecard_id` = `scorecard`.`id` AND `existing`.`title` = `seed`.`title`);

INSERT INTO `hr_kpi_scorecard_items` (`scorecard_id`, `title`, `description`, `weight`, `target_description`, `direction`, `sort_order`, `active`, `created_at`, `updated_at`)
SELECT `scorecard`.`id`, `seed`.`title`, `seed`.`description`, `seed`.`weight`,
  'Set and communicate a measurable target before the month begins. Define the evidence and how exceptional circumstances will be handled.',
  'quality', `seed`.`sort_order`, 1, NOW(), NOW()
FROM `hr_kpi_scorecards` AS `scorecard`
JOIN (
  SELECT 'Financial reporting' AS `title`, 'Timely and accurate daily, weekly and monthly financial reports.' AS `description`, 25 AS `weight`, 0 AS `sort_order`
  UNION ALL SELECT 'Bank and cash reconciliation compliance', 'Reconciliation of bank accounts, cash, mobile money and sales records.', 20, 1
  UNION ALL SELECT 'Payroll and statutory compliance', 'Accurate payroll preparation and timely PAYE, pension and other required submissions or payments.', 15, 2
  UNION ALL SELECT 'Expense and payment control', 'Proper documentation, authorisation and monitoring of company expenses and payments.', 15, 3
  UNION ALL SELECT 'Receivables and insurance claims', 'Monitoring outstanding insurance claims, follow-ups and debtor records.', 10, 4
  UNION ALL SELECT 'Financial records and documentation', 'Accurate filing, supporting documents and audit readiness.', 10, 5
  UNION ALL SELECT 'Management support', 'Timely financial advice, cash-flow information and responses to management requests.', 5, 6
) AS `seed`
WHERE `scorecard`.`role_title` = 'Accountant' AND `scorecard`.`branch` = '*'
  AND NOT EXISTS (SELECT 1 FROM `hr_kpi_scorecard_items` AS `existing` WHERE `existing`.`scorecard_id` = `scorecard`.`id` AND `existing`.`title` = `seed`.`title`);

INSERT INTO `hr_kpi_scorecard_items` (`scorecard_id`, `title`, `description`, `weight`, `target_description`, `direction`, `sort_order`, `active`, `created_at`, `updated_at`)
SELECT `scorecard`.`id`, `seed`.`title`, `seed`.`description`, `seed`.`weight`,
  'Set and communicate a measurable target before the month begins. Define the evidence and how exceptional circumstances will be handled.',
  'quality', `seed`.`sort_order`, 1, NOW(), NOW()
FROM `hr_kpi_scorecards` AS `scorecard`
JOIN (
  SELECT 'Technical quality and accuracy' AS `title`, 'Correct lens fitting, edging, adjustments, repairs and reduction of avoidable technical errors.' AS `description`, 25 AS `weight`, 0 AS `sort_order`
  UNION ALL SELECT 'Job turnaround time', 'Completion of jobs within agreed delivery timelines.', 20, 1
  UNION ALL SELECT 'Lens procurement and supplier coordination', 'Timely ordering, supplier follow-up, correct specifications and procurement documentation.', 15, 2
  UNION ALL SELECT 'Workshop organisation and equipment care', 'Cleanliness, equipment maintenance, safe operation and reporting of faults.', 10, 3
  UNION ALL SELECT 'Job records and accountability', 'Accurate records of jobs received, completed, delayed, remade and repaired.', 10, 4
  UNION ALL SELECT 'Teamwork and communication', 'Updates to reception, showroom and management about job progress and delays.', 10, 5
  UNION ALL SELECT 'Stock and material control', 'Responsible use and tracking of workshop materials, lenses and other assigned stock.', 10, 6
) AS `seed`
WHERE `scorecard`.`role_title` = 'Technician' AND `scorecard`.`branch` = '*'
  AND NOT EXISTS (SELECT 1 FROM `hr_kpi_scorecard_items` AS `existing` WHERE `existing`.`scorecard_id` = `scorecard`.`id` AND `existing`.`title` = `seed`.`title`);

INSERT INTO `hr_kpi_scorecard_items` (`scorecard_id`, `title`, `description`, `weight`, `target_description`, `direction`, `sort_order`, `active`, `created_at`, `updated_at`)
SELECT `scorecard`.`id`, `seed`.`title`, `seed`.`description`, `seed`.`weight`,
  'Set and communicate a measurable target before the month begins. Define the evidence and how exceptional circumstances will be handled.',
  'quality', `seed`.`sort_order`, 1, NOW(), NOW()
FROM `hr_kpi_scorecards` AS `scorecard`
JOIN (
  SELECT 'Customer service and reception' AS `title`, 'Welcoming patients, communication, professionalism and customer feedback.' AS `description`, 20 AS `weight`, 0 AS `sort_order`
  UNION ALL SELECT 'Patient registration and data accuracy', 'Accurate registration, patient details and record updates.', 20, 1
  UNION ALL SELECT 'Billing and cash accuracy', 'Correct billing, authorised discounts, receipt issuance and cash/payment reconciliation.', 20, 2
  UNION ALL SELECT 'Appointment and patient-flow management', 'Efficient scheduling, coordination with the Optometrist and reduction of avoidable waiting delays.', 15, 3
  UNION ALL SELECT 'Digital records and documentation', 'Timely and complete entry of transactions and patient information.', 10, 4
  UNION ALL SELECT 'Attendance and punctuality', 'Compliance with the employee’s agreed working schedule, including any branch-specific schedule.', 10, 5
  UNION ALL SELECT 'Teamwork and communication', 'Coordination with the Optometrist, Technician and Showroom Attendant.', 5, 6
) AS `seed`
WHERE `scorecard`.`role_title` = 'Receptionist/Cashier' AND `scorecard`.`branch` = '*'
  AND NOT EXISTS (SELECT 1 FROM `hr_kpi_scorecard_items` AS `existing` WHERE `existing`.`scorecard_id` = `scorecard`.`id` AND `existing`.`title` = `seed`.`title`);

INSERT INTO `hr_kpi_scorecard_items` (`scorecard_id`, `title`, `description`, `weight`, `target_description`, `direction`, `sort_order`, `active`, `created_at`, `updated_at`)
SELECT `scorecard`.`id`, `seed`.`title`, `seed`.`description`, `seed`.`weight`,
  'Set and communicate a measurable target before the month begins. Define the evidence and how exceptional circumstances will be handled.',
  'quality', `seed`.`sort_order`, 1, NOW(), NOW()
FROM `hr_kpi_scorecards` AS `scorecard`
JOIN (
  SELECT 'Customer engagement and service' AS `title`, 'How customers are welcomed, assisted and treated.' AS `description`, 20 AS `weight`, 0 AS `sort_order`
  UNION ALL SELECT 'Sales and approved branch targets', 'Achievement of agreed frame and showroom sales targets, with proper transaction records.', 25, 1
  UNION ALL SELECT 'Product knowledge', 'Knowledge of frames, product features, pricing and available options.', 15, 2
  UNION ALL SELECT 'Showroom presentation', 'Cleanliness, arrangement, display standards and general showroom appearance.', 15, 3
  UNION ALL SELECT 'Stock management', 'Accurate stock handling, identification of missing or damaged items and stock-count support.', 10, 4
  UNION ALL SELECT 'Teamwork and coordination', 'Working with reception, Optometrist and Technician to complete customer orders.', 10, 5
  UNION ALL SELECT 'Attendance and punctuality', 'Compliance with agreed working hours.', 5, 6
) AS `seed`
WHERE `scorecard`.`role_title` = 'Showroom Attendant' AND `scorecard`.`branch` = '*'
  AND NOT EXISTS (SELECT 1 FROM `hr_kpi_scorecard_items` AS `existing` WHERE `existing`.`scorecard_id` = `scorecard`.`id` AND `existing`.`title` = `seed`.`title`);
