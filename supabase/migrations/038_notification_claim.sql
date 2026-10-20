-- Recupera mensagens presas em sending e reivindica a fila com trava.
-- Cole no SQL Editor DEPOIS da 037. Não reescreve 030–035.

CREATE INDEX IF NOT EXISTS notifications_sending_idx
  ON notifications (updated_at)
  WHERE status = 'sending';

CREATE OR REPLACE FUNCTION public.claim_due_notifications(p_limit integer DEFAULT 40)
RETURNS SETOF notifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE notifications
  SET status = 'pending',
      error_message = 'recovered_stuck_sending',
      updated_at = now()
  WHERE status = 'sending'
    AND updated_at < now() - interval '5 minutes';

  RETURN QUERY
  UPDATE notifications n
  SET status = 'sending',
      updated_at = now()
  FROM (
    SELECT id
    FROM notifications
    WHERE status = 'pending'
      AND scheduled_for <= now()
      AND next_attempt_at <= now()
    ORDER BY next_attempt_at
    LIMIT GREATEST(COALESCE(p_limit, 40), 1)
    FOR UPDATE SKIP LOCKED
  ) picked
  WHERE n.id = picked.id
  RETURNING n.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_due_notifications(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_notifications(integer) TO service_role;

NOTIFY pgrst, 'reload schema';
