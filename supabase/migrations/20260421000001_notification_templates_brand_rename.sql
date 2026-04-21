-- Rename "Marlboro Ridge" → "Marlboro Ridge Equestrian Center" in notification
-- templates. Marlboro Ridge is the HOA community; the barn is MREC. Only
-- updates rows the admin hasn't customized (subject/body still matches default).

update notification_template
   set subject      = replace(subject,      'Marlboro Ridge', 'Marlboro Ridge Equestrian Center'),
       default_subject = replace(default_subject, 'Marlboro Ridge', 'Marlboro Ridge Equestrian Center')
 where subject is not null
   and subject = default_subject
   and subject like '%Marlboro Ridge%'
   and subject not like '%Marlboro Ridge Equestrian Center%';

update notification_template
   set body         = replace(body,         'at Marlboro Ridge.', 'at Marlboro Ridge Equestrian Center.'),
       default_body = replace(default_body, 'at Marlboro Ridge.', 'at Marlboro Ridge Equestrian Center.')
 where body = default_body
   and body like '%at Marlboro Ridge.%'
   and body not like '%at Marlboro Ridge Equestrian Center.%';
