-- Documents v1b: self-serve enrollment + waiver signing.
--
-- Adds:
--   * emergency contact fields on person (waiver captures these)
--   * document_template: versioned waiver text. Each signed waiver snapshots
--     the template_version_id so old signatures stay bound to the text that
--     was in force when they signed. Edits create new versions; prior
--     versions are immutable.
--   * document.template_version_id + document.signature_png_path: wire the
--     signed Waiver document to its template and preserve the raw signature
--     stroke independently of the rendered PDF.
--   * enrollment_token: tokenized invitation the admin generates for a new
--     rider / boarder. Single-use, 30-day default TTL. Covers both the
--     adult path (one person) and the minor path (guardian + child, both
--     pre-created so a lesson can be scheduled against the child stub
--     immediately).

-- ---------- person: emergency contact ----------
alter table person
  add column if not exists emergency_contact_name  text,
  add column if not exists emergency_contact_phone text;

-- ---------- document_template ----------
create table if not exists document_template (
  id               uuid primary key default gen_random_uuid(),
  kind             text not null check (kind in ('waiver', 'boarding_agreement')),
  version          integer not null,
  body_markdown    text not null,
  effective_from   timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  created_by       uuid references person(id),
  deleted_at       timestamptz,
  unique (kind, version)
);

-- Convenience index for "latest active template of kind X".
create index if not exists idx_document_template_kind_effective
  on document_template (kind, effective_from desc)
  where deleted_at is null;

-- ---------- document: template + signature linkage ----------
alter table document
  add column if not exists template_version_id uuid references document_template(id),
  add column if not exists signature_png_path  text,
  add column if not exists signed_by_person_id uuid references person(id);
  -- signed_by_person_id matters for minors: waiver attaches to the child
  -- (person_id) but is signed by the parent (signed_by_person_id). For
  -- adults, both columns point at the same person.

-- ---------- enrollment_token ----------
create table if not exists enrollment_token (
  id                uuid primary key default gen_random_uuid(),
  token             text not null unique,
  -- For an adult invite, rider_person_id is the adult.
  -- For a minor invite, rider_person_id is the CHILD and
  -- guardian_person_id is the parent — the parent fills out the form.
  rider_person_id     uuid not null references person(id),
  guardian_person_id  uuid references person(id),
  kind                text not null check (kind in ('adult', 'minor')),
  -- Which document the form will produce at submit time. 'waiver' for
  -- lesson riders, 'boarding_agreement' for boarders. Future-proof.
  template_kind       text not null check (template_kind in ('waiver', 'boarding_agreement')),
  expires_at          timestamptz not null,
  used_at             timestamptz,
  created_at          timestamptz not null default now(),
  created_by          uuid references person(id),
  deleted_at          timestamptz
);

create index if not exists idx_enrollment_token_token
  on enrollment_token (token)
  where deleted_at is null and used_at is null;

create index if not exists idx_enrollment_token_rider
  on enrollment_token (rider_person_id)
  where deleted_at is null;

-- ---------- seed initial waiver template ----------
-- Copy of the current Marlboro Ridge waiver. Admin can edit later via the
-- template editor; that creates a v2 row and leaves this v1 intact.
insert into document_template (kind, version, body_markdown)
values (
  'waiver',
  1,
  $waiver$**RIDE AT YOUR OWN RISK**

As much as we enjoy making our horses and the use of our property available to various riders (paying and otherwise), we respectfully request that if the rider believes that a horse related personal injury or death (apart from MREC/Turner Equestrian Education & Show Stables, LLC's willful and gross negligence) is justifiable grounds for shifting any part of the financial, emotional and physical burdens of his or her injury (as onerous, regrettable and/or tragic as they may be) back to MREC/Turner Equestrian Education & Show Stables, LLC or its associates, please do not participate in this activity on our property or with our horses. Thank you.

**ALL RIDERS OR PARENTS OF RIDERS OR LEGAL GUARDIANS MUST SIGN BELOW AFTER READING THIS ENTIRE DOCUMENT.**

**SIGNER STATEMENT OF AWARENESS**

**I/WE, THE UNDERSIGNED, HAVE READ AND DO UNDERSTAND THE FOREGOING AGREEMENT, WARNING, RELEASE AND ASSUMPTION OF RISK. WE FURTHER ATTEST THAT ALL FACTS RELATING TO THE APPLICANT ARE TRUE AND ACCURATE.**

Turner Equestrian Education & Show Stables

Marlboro Ridge Equestrian Center

11400 Marlboro Ridge Road, Upper Marlboro, Maryland 20772

**HORSEBACK RIDING AGREEMENT AND LIABILITY RELEASE FORM**

PLEASE READ CAREFULLY BEFORE SIGNING

SERIOUS INJURY MAY RESULT FROM YOUR PARTICIPATION IN THIS ACTIVITY

THIS FACILITY AND OR ANY EMPLOYEE AND/OR COMPANY/ASSOCIATION WITH IT DOES NOT GUARANTEE YOUR SAFETY OR THAT OF ANY HORSE

In consideration for participating in horse related activities or instruction connected with MREC/Turner Equestrian Ed. & Show Stables, LLC, the undersigned hereby agrees as follows:

**REGISTRATION OF RIDER AND PURPOSE OF AGREEMENT:** I, the following listed individual hereby known as the "RIDER" and the parents or legal guardian thereof if a minor, do hereby voluntarily request and agree to participate in horse riding or horse riding instruction and on and about the MREC/Paul Turner property (Turner Equestrian Education & Show Stables, LLC), and that the rider will ride a horse provided to him or her by MERC/Turner Equestrian Education & Show Stables, LLC, or by their ownership or acquired means, today and all future dates.

**SCOPE OF AGREEMENT AND DEFINITIONS:** This agreement shall be legally binding upon, ME, the RIDER and the parents of guardian thereof if a minor, my heirs, estate, assigns, including all minor children, and parental representatives. This agreement shall be interpreted according to the laws of the state of Maryland. Any disputes by the rider shall be subject to a paragraph below and litigated in the county in which MREC/Turner Equestrian Education & Show Stables, LLC, is physically located. Id any phrase, clause or word is in conflict with the laws of the State of Maryland then that part is null and void. The term "HORSEBACK RIDING" or "RIDING" herein shall refer to all equine species. The term "HORSEBACK RIDING" OR "RIDING" herein shall refer to riding, instruction in, or otherwise handling of or being near horses or ponies whether from the ground or mounted. The term "RIDER" shall refer to a person who rides a horse or otherwise handles or comes near a horse from the ground. The term "I, ME, and MY" shall herein refer to the above RIDER and the parents of legal guardians thereof if a minor.

**INHERENT RISK OF ACTIVITY:** I understand that horseback riding is a RUGGED RECREATIONAL ACTIVITY and that there are numerous obvious and non-obvious inherent risks always present in such activities despite all safety precautions. As such, related injuries can be severe or even deadly and that least, can require more hospital days and result in more lasting residual effects than injuries from most other activities. Further, this inherent risk is not totally mitigated by either (1) the presence of a guide or (2) by the use of a horse that has been used for it or is considered usable by beginners. Horse accidents are common, and in fact, are virtually guaranteed to occur given enough time around horses. Horse accidents are even more common with beginners although expert riders are still subject to considerable danger from participation in this activity.

**NATURE OF RIDING HORSES:** I understand that no horse is a completely safe horse. Horses are 5 to 15 times larger, 20 to 40 percent more powerful, and 3 to 4 times faster than a human. If a rider falls from a horse to the ground, it will generally be a distance of 3 to 7 feet, and impact may result in injury or even death of a rider. Horseback riding is the only sport where one much smaller, weaker animal (human) tries to impose its will on, and become one unit of movement with, another much larger, stronger animal with a mind of its own (horse) and each has a limited understanding of each other. If a horse is frightened or irritated it may divert from any training it has received and act according to its natural instincts which may include but are not limited to, stopping short, changing its direction or speed at will, shifting its weight, bucking, rearing, kicking, biting, running under obstacles intended to knock the rider off or from danger.

**RIDER RESPONSIBILITY:** I understand that, notwithstanding the presence or participation of a guide instructor, upon mounting and taking up the reins, the RIDER is in primary control of the horse. The rider's safety largely depends upon his or her ability to remain balanced aboard a moving animal (which is not easy for beginners). The rider shall be responsible for hir or her own safety. MREC/Turner Equestrian Education & Show Stables, LLC, DOES NOT PERMIT PREGNANT WOMEN TO RIDE.

**CONDITIONS OR NATURE:** MREC/Turner Equestrian Education & Show Stables, LLC is not responsible for total or partial act, occurrences, or elements of nature that can scare a horse, cause it to fall or otherwise react in some unsafe manner. SOME EXAMPLES are thunder, lightning, rain, wind, wild and domestic animals, insects, reptiles, which may walk, run or fly near, bite or sting a horse or person, further MREC/Turner Equestrian Education & Show Stables, LLC is not responsible for irregular or obstructed footing on groomed or wild land which is subject to constant change in condition according to use, weather, temperature, maintenance (or lack thereof) and natural or manmade changes in land and landscape.

**LIABILITY RELEASE:** I agree that in consideration of MERC/Turner Equestrian Education & Show Stables, LLC allowing my participation in this activity under the terms set forth, I the RIDER, for myself and on behalf of my child or legal ward or other parent, heirs, administrators or personal representatives or assigns, do agree to hold harmless, release, discharge, MREC/Turner Equestrian Education & Show Stables, LLC, its owners agents, independent contractors, employees, officers, directors, representatives, assigns, members, owners or premises and trails (whether or not trails are owned by MREC/Turner Equestrian Education & Show Stables, LLC and the afore mentioned) affiliated organizations and insurers and others acting on its behalf of and from all claims, demands, causes of action and legal liability, whether your damage be known or unknown, anticipated or unanticipated due to MREC/Turner Equestrian Education & Show Stables, LLC and or its associates ordinary negligence: and further agree to accept in the event MREC/Turner Equestrian Education & Show Stables, LLC's gross negligence and willful and wanton misconduct, I shall not bring any claims, demands, legal actions and cause of actions against MREC/Turner Equestrian Education & Show Stables, LLC and its associates as stated in the above clause for any causes of economic or non-economic losses due to bodily injury, death, property damage, sustained by me or my minor child or legal ward in relation to the premises and operations of MREC/Turner Equestrian Education & Show Stables, LLC, to while riding, handling, or otherwise near horses owned by or in the care custody MREC/Turner Equestrian Education & Show Stables, LLC.

**ATTORNEY FEES:** The safest course of action is not to ride or be around horses. Knowing this, anyone who nevertheless engages in and is hurt in this activity also agrees to indemnify MREC/Turner Equestrian Education & Show Stables, LLC and its associates for all reasonable attorney's fees and related cost incurred in defending themselves against and compensatory actions taken or threatened by rider, the parents or guardians thereof, or his or her heirs, estates, assigns, including all minor children, and their parental representatives.
$waiver$
) on conflict (kind, version) do nothing;
