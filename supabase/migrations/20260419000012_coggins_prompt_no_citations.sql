-- Same citation fix as 20260419000011 — apply to coggins prompt too.

UPDATE import_prompt
   SET body = replace(
     body,
     'Return this JSON structure exactly:',
     'IMPORTANT: Return only the JSON object. Do not include citation markers, footnote references, or annotations (e.g. [cite: 1], [1], [^1]) anywhere in the JSON — not in string values, not in keys, not anywhere. Clean values only.

Return this JSON structure exactly:'
   ),
   updated_at = now()
 WHERE slug = 'coggins';
