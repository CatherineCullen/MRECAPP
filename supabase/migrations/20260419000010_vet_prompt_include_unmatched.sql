-- Fix: AI was excluding health items that didn't match the catalog
-- (e.g. Botulism, West Nile Virus, Strangles) instead of including
-- them with catalog_match=null. Add an explicit rule 6 to prevent this.

UPDATE import_prompt
   SET body = replace(
     body,
     '5. PREFER matching over creating. Only set catalog_match=null if no
   reasonable match exists AFTER applying the splits and
   suffix-stripping above. Creating new types for combos or
   abbreviations of existing singles is wrong.',
     '5. PREFER matching over creating. Only set catalog_match=null if no
   reasonable match exists AFTER applying the splits and
   suffix-stripping above. Creating new types for combos or
   abbreviations of existing singles is wrong.

6. ALWAYS INCLUDE unmatched items. If a health event has no catalog
   match, still include it in health_events with catalog_match=null.
   Never exclude a health event just because it is not in the catalog —
   the admin will decide what to do with it in the review UI. Mention
   the unmatched items in clarifications as well, but always emit the
   event.'
   ),
   updated_at = now()
 WHERE slug = 'vet_record';
