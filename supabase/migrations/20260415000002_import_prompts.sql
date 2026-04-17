-- ============================================================
-- IMPORT PROMPTS
-- Stores editable AI import prompts. Admins can edit prompts
-- in Configuration → Import Prompts without a code change.
-- Each prompt has a slug (machine name) and body text.
-- Dynamic prompts contain {{CATALOG}} tokens that are replaced
-- server-side at render time with current catalog data.
-- ============================================================

CREATE TABLE IF NOT EXISTS import_prompt (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text NOT NULL UNIQUE,          -- e.g. 'coggins', 'vet_record'
  label         text NOT NULL,                 -- display name
  description   text,                          -- what this prompt is for
  body          text NOT NULL,                 -- the prompt text; may contain {{CATALOG}} token
  default_body  text NOT NULL,                 -- original shipped version; never overwritten
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at' AND tgrelid = 'import_prompt'::regclass
  ) THEN
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON import_prompt
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

ALTER TABLE import_prompt ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- SEED: DEFAULT PROMPTS
-- ============================================================

INSERT INTO import_prompt (slug, label, description, body, default_body) VALUES
(
  'coggins',
  'Coggins / New Horse Intake',
  'Use this prompt to parse a Coggins certificate and pre-fill a new horse record. Paste this prompt along with the Coggins PDF (or a photo/scan) into Claude, ChatGPT, or another AI. The AI will return structured JSON you can paste back into CHIA.',
  $PROMPT$You are helping import horse records into a barn management system. I will give you one or more documents — typically a Coggins certificate, possibly with additional records attached.

Your job is to extract structured data and return it as a single JSON object. Do not include any explanation or text outside the JSON.

If any required field is ambiguous or missing, include it in the JSON with a null value and add an entry to the "clarifications" array describing what you could not determine and why.

Return this JSON structure exactly:

{
  "horse": {
    "barn_name": null,
    "registered_name": null,
    "breed": null,
    "gender": null,
    "color": null,
    "date_of_birth": null,
    "microchip": null
  },
  "coggins": {
    "date_drawn": null,
    "vet_name": null,
    "accession_number": null
  },
  "health_events": [],
  "clarifications": []
}

Field notes:
- barn_name: the horse's common name or barn name. If only a registered name is found, use it here and also in registered_name.
- registered_name: the horse's full registered name if different from barn name. Null if same or not present.
- gender: use one of: Mare, Gelding, Stallion, Colt, Filly
- date_of_birth: ISO 8601 format (YYYY-MM-DD). If only a year is given, use YYYY-01-01.
- microchip: the microchip or tattoo number if present, otherwise null.
- date_drawn: the date the blood sample was drawn for the Coggins test. ISO 8601 format.
- vet_name: the name of the veterinarian who drew the Coggins.
- accession_number: the official Coggins accession/test number if printed on the certificate.
- health_events: an array of any vaccine or health item administrations you can find in the documents. Each entry:
  {
    "item_name": "the specific product name as written in the document",
    "administered_on": "YYYY-MM-DD",
    "next_due": "YYYY-MM-DD or null",
    "administered_by": "vet or provider name as written",
    "lot_number": "lot number if present, else null",
    "result": null
  }
- clarifications: an array of strings. Each string describes one thing you could not determine with confidence. Be specific: say what field you could not fill and why.

Now process the document(s) I provide.$PROMPT$,

  $PROMPT$You are helping import horse records into a barn management system. I will give you one or more documents — typically a Coggins certificate, possibly with additional records attached.

Your job is to extract structured data and return it as a single JSON object. Do not include any explanation or text outside the JSON.

If any required field is ambiguous or missing, include it in the JSON with a null value and add an entry to the "clarifications" array describing what you could not determine and why.

Return this JSON structure exactly:

{
  "horse": {
    "barn_name": null,
    "registered_name": null,
    "breed": null,
    "gender": null,
    "color": null,
    "date_of_birth": null,
    "microchip": null
  },
  "coggins": {
    "date_drawn": null,
    "vet_name": null,
    "accession_number": null
  },
  "health_events": [],
  "clarifications": []
}

Field notes:
- barn_name: the horse's common name or barn name. If only a registered name is found, use it here and also in registered_name.
- registered_name: the horse's full registered name if different from barn name. Null if same or not present.
- gender: use one of: Mare, Gelding, Stallion, Colt, Filly
- date_of_birth: ISO 8601 format (YYYY-MM-DD). If only a year is given, use YYYY-01-01.
- microchip: the microchip or tattoo number if present, otherwise null.
- date_drawn: the date the blood sample was drawn for the Coggins test. ISO 8601 format.
- vet_name: the name of the veterinarian who drew the Coggins.
- accession_number: the official Coggins accession/test number if printed on the certificate.
- health_events: an array of any vaccine or health item administrations you can find in the documents. Each entry:
  {
    "item_name": "the specific product name as written in the document",
    "administered_on": "YYYY-MM-DD",
    "next_due": "YYYY-MM-DD or null",
    "administered_by": "vet or provider name as written",
    "lot_number": "lot number if present, else null",
    "result": null
  }
- clarifications: an array of strings. Each string describes one thing you could not determine with confidence. Be specific: say what field you could not fill and why.

Now process the document(s) I provide.$PROMPT$
),
(
  'vet_record',
  'Vet Visit Record',
  'Use this prompt to parse a vet visit summary or discharge note. Paste this prompt along with the vet record into Claude, ChatGPT, or another AI. The AI will return structured JSON you can paste back into CHIA.',
  $PROMPT$You are helping import veterinary visit records into a barn management system. I will give you a vet record, discharge summary, or similar document.

Your job is to extract structured data and return it as a single JSON object. Do not include any explanation or text outside the JSON.

The barn uses the following catalog of health item types. When you find a health item in the document, match it to the closest catalog entry. If you cannot match it, use the name as written.

CATALOG:
{{CATALOG}}

Return this JSON structure exactly:

{
  "visit": {
    "visit_date": null,
    "vet_name": null,
    "findings": null,
    "recommendations": null
  },
  "health_events": [],
  "care_plans": [],
  "clarifications": []
}

Field notes:
- visit_date: ISO 8601 (YYYY-MM-DD)
- vet_name: the attending veterinarian's name
- findings: a plain-text summary of the vet's findings and observations
- recommendations: any ongoing care recommendations from the vet
- health_events: any vaccines, tests, or treatments administered at this visit. Each entry:
  {
    "catalog_match": "matched catalog item name or null",
    "item_name": "the specific product or test name as written in the document",
    "administered_on": "YYYY-MM-DD",
    "next_due": "YYYY-MM-DD or null",
    "result": "for tests — the result as written (e.g. '150 EPG', 'negative'). For treatments, null.",
    "lot_number": "lot number if present, else null"
  }
- care_plans: any temporary care instructions the vet has given (e.g. stall rest, medication schedule, bute course). Each entry:
  {
    "content": "the instruction as a clear, actionable sentence",
    "starts_on": "YYYY-MM-DD or null",
    "ends_on": "YYYY-MM-DD or null",
    "source_quote": "the exact text from the document that this instruction came from"
  }
- clarifications: an array of strings. Each string describes one thing you could not determine with confidence.

Now process the document(s) I provide.$PROMPT$,

  $PROMPT$You are helping import veterinary visit records into a barn management system. I will give you a vet record, discharge summary, or similar document.

Your job is to extract structured data and return it as a single JSON object. Do not include any explanation or text outside the JSON.

The barn uses the following catalog of health item types. When you find a health item in the document, match it to the closest catalog entry. If you cannot match it, use the name as written.

CATALOG:
{{CATALOG}}

Return this JSON structure exactly:

{
  "visit": {
    "visit_date": null,
    "vet_name": null,
    "findings": null,
    "recommendations": null
  },
  "health_events": [],
  "care_plans": [],
  "clarifications": []
}

Field notes:
- visit_date: ISO 8601 (YYYY-MM-DD)
- vet_name: the attending veterinarian's name
- findings: a plain-text summary of the vet's findings and observations
- recommendations: any ongoing care recommendations from the vet
- health_events: any vaccines, tests, or treatments administered at this visit. Each entry:
  {
    "catalog_match": "matched catalog item name or null",
    "item_name": "the specific product or test name as written in the document",
    "administered_on": "YYYY-MM-DD",
    "next_due": "YYYY-MM-DD or null",
    "result": "for tests — the result as written (e.g. '150 EPG', 'negative'). For treatments, null.",
    "lot_number": "lot number if present, else null"
  }
- care_plans: any temporary care instructions the vet has given (e.g. stall rest, medication schedule, bute course). Each entry:
  {
    "content": "the instruction as a clear, actionable sentence",
    "starts_on": "YYYY-MM-DD or null",
    "ends_on": "YYYY-MM-DD or null",
    "source_quote": "the exact text from the document that this instruction came from"
  }
- clarifications: an array of strings. Each string describes one thing you could not determine with confidence.

Now process the document(s) I provide.$PROMPT$
) ON CONFLICT (slug) DO NOTHING;
