-- Stall assignment is not used at Marlboro Ridge. Remove it entirely.
ALTER TABLE horse DROP COLUMN IF EXISTS stall;
