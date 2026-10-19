-- Idempotência financeira do Mercado Pago.
-- Cole no SQL Editor DEPOIS da 028. Não reescreve a 005.

ALTER TABLE billing_events ADD COLUMN IF NOT EXISTS effect text;
ALTER TABLE billing_events ADD COLUMN IF NOT EXISTS effect_applied_at timestamptz;
ALTER TABLE billing_events ADD COLUMN IF NOT EXISTS notification_count integer NOT NULL DEFAULT 1;
ALTER TABLE billing_events ADD COLUMN IF NOT EXISTS last_seen_at timestamptz DEFAULT now();

COMMENT ON COLUMN billing_events.effect IS 'none | activated | refunded — efeito financeiro já aplicado neste payment_id';

-- Pagamentos já aprovados antes da 029: marcar efeito para não renovar de novo no próximo webhook.
UPDATE billing_events
SET effect = 'activated',
    effect_applied_at = COALESCE(effect_applied_at, processed_at, now())
WHERE lower(COALESCE(status, '')) = 'approved'
  AND (effect IS NULL OR effect = 'none');

UPDATE billing_events
SET effect = 'none'
WHERE effect IS NULL;

CREATE INDEX IF NOT EXISTS billing_events_user_idx ON billing_events (user_id, last_seen_at DESC);

NOTIFY pgrst, 'reload schema';
