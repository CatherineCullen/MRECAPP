-- Update the Coggins import prompt to remove horse fields.
-- Coggins import now works with existing horses (horse picker in UI),
-- so the prompt only needs to extract Coggins certificate data.

UPDATE import_prompt
SET
  label       = 'Coggins',
  description = 'Use this prompt to parse a Coggins certificate. Paste this prompt along with the Coggins PDF (or a photo/scan) into Claude, ChatGPT, or another AI. The AI will return structured JSON you can paste back into CHIA.',
  body        = $PROMPT$You are helping import Coggins certificate data into a barn management system. I will give you a Coggins certificate (PDF, photo, or scan).

Your job is to extract structured data and return it as a single JSON object. Do not include any explanation or text outside the JSON.

If any required field is ambiguous or missing, include it in the JSON with a null value and add an entry to the "clarifications" array describing what you could not determine and why.

Return this JSON structure exactly:

{
  "coggins": {
    "date_drawn": null,
    "vet_name": null,
    "form_serial_number": null
  },
  "health_events": [],
  "clarifications": []
}

Field notes:
- date_drawn: the date the blood sample was drawn for the Coggins test. ISO 8601 format (YYYY-MM-DD).
- vet_name: the name of the veterinarian who drew the Coggins.
- form_serial_number: the Form Serial Number printed at the top of the Coggins certificate (e.g. "EIA-2024-123456").
- health_events: an array of any vaccine or health item administrations you can find in the document (other than the Coggins test itself). If none are present, leave as an empty array. Each entry:
  {
    "item_name": "the specific product name as written in the document",
    "administered_on": "YYYY-MM-DD",
    "next_due": "YYYY-MM-DD or null",
    "administered_by": "vet or provider name as written",
    "lot_number": "lot number if present, else null",
    "result": null
  }
- clarifications: an array of strings. Each string describes one thing you could not determine with confidence.

Now process the document(s) I provide.$PROMPT$,
  default_body = $PROMPT$You are helping import Coggins certificate data into a barn management system. I will give you a Coggins certificate (PDF, photo, or scan).

Your job is to extract structured data and return it as a single JSON object. Do not include any explanation or text outside the JSON.

If any required field is ambiguous or missing, include it in the JSON with a null value and add an entry to the "clarifications" array describing what you could not determine and why.

Return this JSON structure exactly:

{
  "coggins": {
    "date_drawn": null,
    "vet_name": null,
    "form_serial_number": null
  },
  "health_events": [],
  "clarifications": []
}

Field notes:
- date_drawn: the date the blood sample was drawn for the Coggins test. ISO 8601 format (YYYY-MM-DD).
- vet_name: the name of the veterinarian who drew the Coggins.
- form_serial_number: the Form Serial Number printed at the top of the Coggins certificate (e.g. "EIA-2024-123456").
- health_events: an array of any vaccine or health item administrations you can find in the document (other than the Coggins test itself). If none are present, leave as an empty array. Each entry:
  {
    "item_name": "the specific product name as written in the document",
    "administered_on": "YYYY-MM-DD",
    "next_due": "YYYY-MM-DD or null",
    "administered_by": "vet or provider name as written",
    "lot_number": "lot number if present, else null",
    "result": null
  }
- clarifications: an array of strings. Each string describes one thing you could not determine with confidence.

Now process the document(s) I provide.$PROMPT$
WHERE slug = 'coggins';
