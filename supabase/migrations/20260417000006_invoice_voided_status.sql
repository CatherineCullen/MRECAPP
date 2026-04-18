-- Add 'voided' to invoice_status enum.
--
-- Previously, Void & Cancel on a sent lesson invoice was forced to set
-- status='overdue' (the enum had no 'voided' value) and then soft-delete the
-- invoice row to hide it. That made voided invoices invisible — bad for audit
-- trail. With this value, voided invoices stay visible in the Sent view
-- (grayed, grouped at the bottom) and the audit story is "the invoice
-- existed, was sent, and was then voided."

ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'voided';
