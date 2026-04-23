-- Collapse the health_event shape in the vet_record import prompt. Previously
-- the AI was asked for separate `result` and `lot_number` fields. In practice
-- almost nothing read those — and the horse profile Add/Edit path never wrote
-- them either. Replace both with a single freeform `notes` field that holds
-- anything useful about this dose (product, lot, route, result, administrator,
-- dose, etc.) so every health_event has one consistent per-dose note surface.

UPDATE import_prompt
   SET body = replace(
     body,
     '    "result": "for tests — the result as written (e.g. ''150 EPG'', ''negative''). For treatments, null.",
    "lot_number": "lot number if present, else null"',
     '    "notes": "freeform note about this dose — product/brand, lot number, route, dose, administrator, test result (e.g. ''150 EPG'', ''negative''), anything else worth keeping. Null if nothing to record."'
   ),
   updated_at = now()
 WHERE slug = 'vet_record';
