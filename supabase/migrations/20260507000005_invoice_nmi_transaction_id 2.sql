-- NMI's payment transaction ID — distinct from `nmi_invoice_id`.
--
-- Populated by the NMI webhook receiver (`/api/webhooks/nmi`) when a
-- `transaction.sale.success` event arrives for one of our invoices.
-- Carries the same role as Stripe's transaction reference: lets admin
-- click through to the payment record in NMI's portal for an audit
-- trail or refund. Distinct from nmi_invoice_id (which is set at
-- create time, before any payment).

ALTER TABLE invoice
  ADD COLUMN nmi_transaction_id text;

CREATE UNIQUE INDEX invoice_nmi_transaction_id_key
  ON invoice (nmi_transaction_id)
  WHERE nmi_transaction_id IS NOT NULL;

COMMENT ON COLUMN invoice.nmi_transaction_id IS
  'NMI transaction id for the payment that paid this invoice. Stamped by '
  '/api/webhooks/nmi on transaction.sale.success. Null until paid via NMI; '
  'remains null for invoices paid out-of-band (cash/check) or via the '
  'Export fork.';
