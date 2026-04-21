-- Store Stripe's hosted-invoice URL on the invoice row so we can surface a
-- "Pay now" button to the customer on /my/invoices. Previously we only stored
-- stripe_invoice_id and relied on Stripe's outbound email to deliver the pay
-- link; this makes the link first-class in CHIA too.
--
-- Populated at send time (boarding + lessons send flows, and the ad-hoc
-- createAndSendInvoice path) and refreshed by the invoice.* webhook so it
-- stays accurate if Stripe regenerates the URL.

ALTER TABLE invoice ADD COLUMN hosted_invoice_url text;
