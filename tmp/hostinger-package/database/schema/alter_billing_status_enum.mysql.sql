-- Run this once on the existing Hostinger database.
-- The billing status column will appear as a fixed-value dropdown in phpMyAdmin.

UPDATE `billing`
SET `status` = 'balance_remaining'
WHERE `status` IS NULL
   OR `status` NOT IN ('draft', 'pending', 'balance_remaining', 'insurance_pending', 'paid', 'completed');

ALTER TABLE `billing`
  MODIFY COLUMN `status`
    ENUM('draft', 'pending', 'balance_remaining', 'insurance_pending', 'paid', 'completed')
    NOT NULL DEFAULT 'balance_remaining';