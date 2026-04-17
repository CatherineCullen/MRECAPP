-- Rename person_role_type enum value 'owner' → 'boarder'.
-- Reflects that this role means "has a horse at this barn" (boarder),
-- not legal ownership. Specific ownership details live on horse_contact.role.
-- Existing person_role rows update automatically — no data migration needed.

ALTER TYPE person_role_type RENAME VALUE 'owner' TO 'boarder';
