-- Opticplus: debt management + servicing (matches DebtController / Laravel migration).
-- Superseded for full installs by opticplus_full_schema.mysql.sql (all portal tables).
-- Safe to run after importing a dump that omitted only these three tables.
-- MySQL 5.7+ / MariaDB 10.3+

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `debts` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `debtor_name` varchar(255) NOT NULL,
  `debt_type` enum('loan','supplier_credit','overdraft','lease','other') NOT NULL DEFAULT 'loan',
  `category` varchar(100) NOT NULL,
  `description` text DEFAULT NULL,
  `principal_amount` decimal(15,2) NOT NULL,
  `interest_rate` decimal(5,2) DEFAULT NULL,
  `interest_type` enum('fixed','variable','none') NOT NULL DEFAULT 'fixed',
  `total_amount` decimal(15,2) NOT NULL,
  `amount_paid` decimal(15,2) NOT NULL DEFAULT 0.00,
  `monthly_payment` decimal(15,2) DEFAULT NULL,
  `lender_name` varchar(255) DEFAULT NULL,
  `lender_contact` varchar(255) DEFAULT NULL,
  `lender_phone` varchar(20) DEFAULT NULL,
  `lender_email` varchar(100) DEFAULT NULL,
  `start_date` date NOT NULL,
  `due_date` date NOT NULL,
  `term_months` int unsigned DEFAULT NULL,
  `payment_frequency` enum('monthly','quarterly','annually','one-time') NOT NULL DEFAULT 'monthly',
  `next_payment_date` date DEFAULT NULL,
  `next_payment_amount` decimal(15,2) DEFAULT NULL,
  `status` enum('active','paid','defaulted','restructured','pending') NOT NULL DEFAULT 'active',
  `collateral` text DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_by` bigint unsigned DEFAULT NULL,
  `branch_id` bigint unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `debts_branch_id_index` (`branch_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `debt_payments` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `debt_id` bigint unsigned NOT NULL,
  `payment_date` date NOT NULL,
  `amount` decimal(15,2) NOT NULL,
  `payment_method` enum('cash','bank_transfer','cheque','mobile_money','other') NOT NULL,
  `reference_number` varchar(100) DEFAULT NULL,
  `receipt_path` varchar(255) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `recorded_by` bigint unsigned DEFAULT NULL,
  `branch_id` bigint unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `debt_payments_debt_id_foreign` (`debt_id`),
  KEY `debt_payments_branch_id_index` (`branch_id`),
  CONSTRAINT `debt_payments_debt_id_foreign` FOREIGN KEY (`debt_id`) REFERENCES `debts` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `debt_reminders` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `debt_id` bigint unsigned NOT NULL,
  `reminder_date` date NOT NULL,
  `reminder_type` enum('payment_due','late_payment','review','other') NOT NULL,
  `message` text NOT NULL,
  `sent_to` varchar(255) DEFAULT NULL,
  `sent_via` enum('email','sms','notification') DEFAULT NULL,
  `status` enum('pending','sent','cancelled') NOT NULL DEFAULT 'pending',
  `sent_at` datetime DEFAULT NULL,
  `branch_id` bigint unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `debt_reminders_debt_id_foreign` (`debt_id`),
  KEY `debt_reminders_branch_id_index` (`branch_id`),
  CONSTRAINT `debt_reminders_debt_id_foreign` FOREIGN KEY (`debt_id`) REFERENCES `debts` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
