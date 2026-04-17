-- Track payment method on each invoice once paid.
--
-- Populated by the Stripe webhook on invoice.paid. We store Stripe's
-- own payment_method type string (e.g. 'card', 'us_bank_account',
-- 'link') verbatim for forward-compatibility — if Stripe adds a new
-- method, we just reflect it. Out-of-band payments (check, cash,
-- ACH wire marked manually in the dashboard) come through as
-- 'out_of_band' — admin disambiguates by adding a note in Stripe.
--
-- Null until paid. Not used for any business logic — display only.

ALTER TABLE invoice
  ADD COLUMN paid_method TEXT;

COMMENT ON COLUMN invoice.paid_method IS
  'Payment method type reported by Stripe at invoice.paid time. '
  'E.g. ''card'', ''us_bank_account'', ''link'', ''out_of_band''. '
  'Display only; null until paid.';
