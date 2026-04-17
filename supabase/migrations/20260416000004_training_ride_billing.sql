-- Training rides are billable. Each provider has a default per-ride rate
-- (snapshotted onto each ride at log time). Two providers can ride the same
-- horse in the same billing period at different rates.

-- Per-provider default rate on Person
ALTER TABLE person
  ADD COLUMN default_training_ride_rate numeric(10,2) NOT NULL DEFAULT 0.00;

-- Rate snapshot + billing link on TrainingRide
ALTER TABLE training_ride
  ADD COLUMN unit_price          numeric(10,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN billing_line_item_id uuid REFERENCES billing_line_item(id);

CREATE INDEX training_ride_billing_idx ON training_ride(billing_line_item_id)
  WHERE billing_line_item_id IS NOT NULL;

-- Source FK on BillingLineItem (staging queue)
ALTER TABLE billing_line_item
  ADD COLUMN source_training_ride_id uuid REFERENCES training_ride(id);

CREATE INDEX billing_line_item_training_ride_idx ON billing_line_item(source_training_ride_id)
  WHERE source_training_ride_id IS NOT NULL;

-- Source FK on InvoiceLineItem (final invoice)
ALTER TABLE invoice_line_item
  ADD COLUMN training_ride_id uuid REFERENCES training_ride(id);

CREATE INDEX invoice_line_item_training_ride_idx ON invoice_line_item(training_ride_id)
  WHERE training_ride_id IS NOT NULL;
