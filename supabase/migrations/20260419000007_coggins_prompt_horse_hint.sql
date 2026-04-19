-- Add a horse identification hint to the coggins prompt so the Review
-- UI can auto-select the horse on the certificate instead of making
-- the admin pick every time. Coggins certificates reliably carry both
-- a registered name and often a barn/call name on the form.
--
-- Shape: { "horse": { "name_on_document": "Hops", "registered_name": "Hops of Marlboro Ridge" } }
-- Review UI matches case-insensitively against horse.barn_name and
-- horse.registered_name; if ambiguous or unmatched, falls back to the
-- normal picker.
--
-- Mirrors the vet_record prompt change from 20260419000006.

UPDATE import_prompt
   SET body = $PROMPT$You are helping import Coggins certificate data into a barn management system. I will give you a Coggins certificate (PDF, photo, or scan).

Your job is to extract structured data and return it as a single JSON object. Do not include any explanation or text outside the JSON.

If any required field is ambiguous or missing, include it in the JSON with a null value and add an entry to the "clarifications" array describing what you could not determine and why.

Return this JSON structure exactly:

{
  "horse": {
    "name_on_document": null,
    "registered_name": null
  },
  "coggins": {
    "date_drawn": null,
    "vet_name": null,
    "form_serial_number": null
  },
  "health_events": [],
  "clarifications": []
}

Field notes:
- horse.name_on_document: the name used to identify the horse on the certificate. Coggins forms often have a "Name" or "Call Name" field — copy it verbatim. If only a registered/full name is shown, put that here as well.
- horse.registered_name: the horse's full registered name if separately shown on the form (e.g. in a "Registered Name" or "Breed Registry Name" field). Null if the document only carries one name.
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
       updated_at = now()
 WHERE slug = 'coggins';
