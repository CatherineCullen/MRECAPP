-- Add a horse identification hint to the vet_record prompt so the
-- Review UI can auto-select the horse on the PDF instead of making
-- the admin pick every time. Vet records almost always carry the
-- barn name or registered name at the top of the document.
--
-- Shape: { "horse": { "name_on_document": "Hops", "registered_name": null } }
-- Review UI matches case-insensitively against horse.barn_name and
-- horse.registered_name; if ambiguous or unmatched, falls back to the
-- normal picker.

UPDATE import_prompt
   SET body = $PROMPT$You are helping import veterinary visit records into a barn management system. I will give you a vet record, discharge summary, or similar document.

Your job is to extract structured data and return it as a single JSON object. Do not include any explanation or text outside the JSON.

The barn uses the following catalog of health item types. When you find a health item in the document, match it to the closest catalog entry. If you cannot match it, use the name as written.

CATALOG:
{{CATALOG}}

MATCHING RULES — READ CAREFULLY:

1. SPLIT combo vaccines into catalog singles.
   If a single line on the form covers multiple catalog items (e.g.
   "EEE/WEE/Tetanus/WNV/Flu/Rhino", "EWT", "VEE/EEE/WEE", "Flu/Rhino",
   "EHV-1/4"), emit ONE health_event per catalog item — NOT one event
   with the combo name. Each split event shares the same administered_on
   and next_due. Record the raw combo string in matched_from so the
   admin can audit the split.

   Common abbreviations:
     EEE = Eastern Equine Encephalomyelitis
     WEE = Western Equine Encephalomyelitis
     VEE = Venezuelan Equine Encephalomyelitis
     WNV = West Nile Virus
     EHV = Equine Herpesvirus (a.k.a. Rhino / Rhinopneumonitis)
     Flu = Equine Influenza
     PHF = Potomac Horse Fever
     Tet = Tetanus
     EWT = EEE + WEE + Tetanus

2. DEDUPE. Vet certificates often list the same vaccination in both a
   summary table and an event history. If two entries share the same
   catalog match AND the same administered_on, emit only ONE event.

3. STRIP ceremonial suffixes and route/adjuvant descriptors from
   item_name before matching. Drop phrases like:
     "Yearly Booster", "Yearly Equine Booster", "Semiannual Booster",
     "Intranasal", "IM", "IN", "Vaccine"
   "Rabies Vaccine: Yearly Equine Booster" is just Rabies.
   "Intranasal Strangles: Yearly Booster" is just Strangles.

4. EXCLUDE non-recurring items. Do NOT emit health_events for:
     - Wellness exams, physical exams, vaccination examinations — the
       visit itself (capture in findings instead).
     - Sheath cleaning, teeth floating, hoof trimming done as part of
       the visit (these are services, not recurring health items).
     - Opportunistic deworming, unless the catalog has a matching
       recurring entry.

5. PREFER matching over creating. Only set catalog_match=null if no
   reasonable match exists AFTER applying the splits and
   suffix-stripping above. Creating new types for combos or
   abbreviations of existing singles is wrong.

Return this JSON structure exactly:

{
  "horse": {
    "name_on_document": null,
    "registered_name": null
  },
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
- horse.name_on_document: whatever name the vet used to identify the horse on this document — typically a barn name, nickname, or short call name at the top of the form. Copy it verbatim.
- horse.registered_name: the horse's full registered name if separately shown. Null if the document only has one name.
- visit_date: ISO 8601 (YYYY-MM-DD)
- vet_name: the attending veterinarian's name
- findings: a plain-text summary of the vet's findings and observations
- recommendations: any ongoing care recommendations from the vet
- health_events: any vaccines, tests, or treatments administered at this visit. One entry per catalog item (see rule 1). Each entry:
  {
    "catalog_match": "matched catalog item name or null",
    "item_name": "the cleaned name (after rule 3 suffix stripping)",
    "matched_from": "the raw string from the document this came from, especially when rule 1 split a combo",
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
       updated_at = now()
 WHERE slug = 'vet_record';
