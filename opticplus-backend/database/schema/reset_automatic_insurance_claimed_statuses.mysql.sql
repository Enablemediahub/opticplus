-- Earlier versions assigned "claimed" automatically when a portal claim row was created.
-- Reclassify those rows as not yet submitted; use "Mark submitted externally" after external submission.
UPDATE insurance_claims
SET status = 'pending'
WHERE LOWER(COALESCE(status, '')) = 'claimed';
