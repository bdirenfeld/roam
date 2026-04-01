-- Remove duplicate Pantheon cards, keeping the original (b2731bc1…)
-- The two newer duplicates were created by submitting the save form multiple times.
DELETE FROM cards WHERE id::text LIKE '1d3dce7d%';
DELETE FROM cards WHERE id::text LIKE '78da65d6%';
