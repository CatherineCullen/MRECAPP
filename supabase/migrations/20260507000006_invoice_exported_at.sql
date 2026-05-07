-- Adds `invoice.exported_at` for the CSV Export leg of the fork
-- (ADR-0021). Stamped by the export action when admin chooses Export
-- instead of NMI at Send All time. Mutually exclusive with
-- `nmi_invoice_id` on a given invoice — populated fields tell the
-- story (no `provider` enum needed per ADR-0021 refinement).
--
-- exported_at IS NOT NULL  → invoice went via the export path; admin
--                            handles billing externally and uses
--                            manual mark-paid to settle in CHIA.
-- nmi_invoice_id IS NOT NULL → invoice went via NMI; the webhook
--                              handles settlement.
-- Both NULL while status='draft' → not yet sent.

ALTER TABLE invoice
  ADD COLUMN exported_at timestamptz;

COMMENT ON COLUMN invoice.exported_at IS
  'Set when invoice was emitted via the CSV Export fork (ADR-0021). '
  'Mutually exclusive with nmi_invoice_id; NULL for invoices that '
  'went through NMI or are still drafts.';
