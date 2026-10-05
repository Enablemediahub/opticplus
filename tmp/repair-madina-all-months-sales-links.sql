-- Run in Hostinger phpMyAdmin after taking a database export/backup.
-- Scope: Madina (branch 2), every month, only non-insurance payments whose
-- folder ID has exactly one matching Madina billing record.
START TRANSACTION;

DROP TEMPORARY TABLE IF EXISTS sales_repair_candidates;

CREATE TEMPORARY TABLE sales_repair_candidates AS
SELECT
    s.id AS sale_id,
    MIN(bf.id) AS billing_id
FROM sales AS s
LEFT JOIN billing AS current_bill
    ON current_bill.id = s.billing_id
    AND current_bill.branch_id = s.branch_id
JOIN billing AS bf
    ON bf.folder_id = s.folder_id
    AND bf.branch_id = s.branch_id
WHERE s.payment_method <> 'Insurance'
  AND s.branch_id = 2
  AND current_bill.id IS NULL
GROUP BY s.id
HAVING COUNT(*) = 1;

-- On localhost this reports 67 records and GH¢42,670.00.
-- If the Hostinger result is different, stop and review before continuing.
SELECT
    COUNT(*) AS records_to_repair,
    COALESCE(SUM(s.amount_paid), 0) AS payment_value_to_repair
FROM sales_repair_candidates AS r
JOIN sales AS s ON s.id = r.sale_id;

UPDATE sales AS s
JOIN sales_repair_candidates AS r ON r.sale_id = s.id
SET s.billing_id = r.billing_id;

SELECT ROW_COUNT() AS repaired_records;

COMMIT;

-- These are the records deliberately left for manual review because their
-- folder has zero or multiple Madina billing candidates.
SELECT
    COUNT(*) AS remaining_unmatched_records,
    COALESCE(SUM(s.amount_paid), 0) AS remaining_unmatched_value
FROM sales AS s
LEFT JOIN billing AS b
    ON b.id = s.billing_id
    AND b.branch_id = s.branch_id
WHERE s.payment_method <> 'Insurance'
  AND s.branch_id = 2
  AND b.id IS NULL;
