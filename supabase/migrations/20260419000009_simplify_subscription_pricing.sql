-- Simplify subscription pricing: private/semi-private/group are the same
-- price per subscription type — only duration differs. Replace the 6 rows
-- with 2 rows (Standard, Boarder).
DELETE FROM pricing_config WHERE section = 'subscription';

INSERT INTO pricing_config (key, section, label, sort_order) VALUES
  ('subscription_standard', 'subscription', 'Standard', 10),
  ('subscription_boarder',  'subscription', 'Boarder',  20);
