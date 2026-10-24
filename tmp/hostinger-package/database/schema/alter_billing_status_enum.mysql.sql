-- Canonical billing statuses used by the ledger and payment workflow.

ALTER TABLE `billing`
  MODIFY COLUMN `status`
    ENUM('draft', 'pending', 'balance_remaining', 'insurance_pending', 'partially_paid', 'paid', 'completed')
    NOT NULL DEFAULT 'pending';

UPDATE `billing`
SET `status` = CASE
  WHEN `status` = 'draft' THEN 'draft'
  WHEN COALESCE(`balance`, 0) <= 0.005 THEN 'paid'
  WHEN COALESCE(`balance`, 0) < COALESCE(`total_amount`, 0) - 0.005 THEN 'partially_paid'
  ELSE 'pending'
END;

ALTER TABLE `billing`
  MODIFY COLUMN `status`
    ENUM('draft', 'pending', 'partially_paid', 'paid')
    NOT NULL DEFAULT 'pending';
