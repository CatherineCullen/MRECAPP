-- Adds feedroom-medication support to Temporary Care Plans.
--
-- Some TCPs are medications the feed room needs to administer at AM/PM
-- feedings (Bute course, antibiotics, GastroGard, etc.). The barn manager
-- needs to see those instructions on the Feed Room sheet alongside the
-- standing diet — without losing them as TCPs (they still expire on
-- ends_on, still get the source-vet-visit provenance, still show up in
-- the regular care plan card list).
--
-- The new columns are additive — TCPs that aren't feedroom meds leave
-- is_feedroom_medication=false and the AM/PM instruction columns null.

ALTER TABLE care_plan
  ADD COLUMN is_feedroom_medication boolean NOT NULL DEFAULT false,
  ADD COLUMN am_instruction         text,
  ADD COLUMN pm_instruction         text;

-- Index for the Feed Room sheet query: "all active feedroom meds today."
CREATE INDEX care_plan_feedroom_active_idx
  ON care_plan(horse_id)
  WHERE is_feedroom_medication = true
    AND is_active = true
    AND deleted_at IS NULL;

-- Update the vet_record AI import prompt to surface the new fields.
-- Replaces the old care_plans entry shape with one that includes the
-- medication flag + AM/PM instructions. Prompt guidance: AI should
-- only set is_feedroom_medication when the document is unambiguous
-- (clear dosing language like "BID", "twice daily", "AM and PM"); when
-- in doubt, leave it false and the admin will toggle it manually
-- after import.
UPDATE import_prompt
   SET body = replace(
     body,
     '- care_plans: any temporary care instructions the vet has given (e.g. stall rest, medication schedule, bute course). Each entry:
  {
    "content": "the instruction as a clear, actionable sentence",
    "starts_on": "YYYY-MM-DD or null",
    "ends_on": "YYYY-MM-DD or null",
    "source_quote": "the exact text from the document that this instruction came from"
  }',
     '- care_plans: any temporary care instructions the vet has given (e.g. stall rest, medication schedule, bute course). Each entry:
  {
    "content": "the instruction as a clear, actionable sentence",
    "starts_on": "YYYY-MM-DD or null",
    "ends_on": "YYYY-MM-DD or null",
    "is_feedroom_medication": "true ONLY if this is a medication the feed room would administer at AM/PM feedings AND the document is unambiguous about that. When in doubt, false — the admin will set it manually.",
    "am_instruction": "if is_feedroom_medication is true, the morning dose as the feed room should read it (e.g. ''Bute 1g in feed''). null otherwise, or if the medication is PM-only.",
    "pm_instruction": "if is_feedroom_medication is true, the evening dose as the feed room should read it. null otherwise, or if the medication is AM-only.",
    "source_quote": "the exact text from the document that this instruction came from"
  }'
   ),
   updated_at = now()
 WHERE slug = 'vet_record';
