-- Conexão do WhatsApp do salão. A sessão e a chave ficam no gateway, fora deste banco.
-- Cole no SQL Editor depois da 030.

CREATE TABLE IF NOT EXISTS whatsapp_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'wa_akg' CHECK (provider IN ('wa_akg', 'meta')),
  provider_session_id text,
  phone_number text,
  display_name text,
  status text NOT NULL DEFAULT 'disconnected' CHECK (status IN ('disconnected', 'connecting', 'connected', 'attention')),
  connected_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS whatsapp_connections_session_idx
  ON whatsapp_connections (provider_session_id);

CREATE TABLE IF NOT EXISTS whatsapp_inbound (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_session_id text,
  remote_jid text,
  phone text,
  body text,
  provider_message_id text,
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE whatsapp_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_inbound ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_connections_read ON whatsapp_connections;
CREATE POLICY whatsapp_connections_read ON whatsapp_connections
  FOR SELECT USING (user_id = public.workspace_id());

DROP POLICY IF EXISTS whatsapp_inbound_read ON whatsapp_inbound;
CREATE POLICY whatsapp_inbound_read ON whatsapp_inbound
  FOR SELECT USING (user_id = public.workspace_id());

GRANT SELECT ON TABLE whatsapp_connections TO authenticated;
GRANT SELECT ON TABLE whatsapp_inbound TO authenticated;

NOTIFY pgrst, 'reload schema';
