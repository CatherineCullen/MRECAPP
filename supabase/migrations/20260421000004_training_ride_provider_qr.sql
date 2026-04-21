-- Per-provider QR codes for training ride logging.
-- Scan flow: provider (or a helper) opens /tr/<token>, lands on the same
-- logging surface as /my/training-rides without signing in. Mutations from
-- this surface attribute logged_by_id to the provider, so the horse log is
-- identical to the signed-in flow.
--
-- One QR per provider. Deactivation via is_active = false (keeps audit
-- trail). created_by tracks which admin generated the code.

CREATE TABLE training_ride_provider_qr (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_person_id  uuid NOT NULL UNIQUE REFERENCES person(id),
  token               text NOT NULL UNIQUE,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES person(id)
);

CREATE INDEX training_ride_provider_qr_token_idx
  ON training_ride_provider_qr(token) WHERE is_active = true;

ALTER TABLE training_ride_provider_qr ENABLE ROW LEVEL SECURITY;
