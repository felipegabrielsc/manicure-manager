-- Qualquer conta admin não pode ficar marcada como profissional.
-- Rode só este UPDATE (sem SELECT no mesmo Run).

UPDATE profiles
SET salon_owner_id = NULL
WHERE is_admin IS TRUE
  AND salon_owner_id IS NOT NULL;
