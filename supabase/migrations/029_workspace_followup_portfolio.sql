-- Retorno e galeria passam a usar o mesmo workspace das outras tabelas do salão.
-- Cole no SQL Editor depois da 028.

DROP POLICY IF EXISTS followup_own ON followup_reminders;
CREATE POLICY followup_own ON followup_reminders
  FOR ALL USING (user_id = public.workspace_id()) WITH CHECK (user_id = public.workspace_id());

DROP POLICY IF EXISTS portfolio_write_own ON portfolio_photos;
CREATE POLICY portfolio_write_own ON portfolio_photos
  FOR ALL USING (user_id = public.workspace_id()) WITH CHECK (user_id = public.workspace_id());

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['followup_reminders', 'portfolio_photos']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_workspace_user ON %I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_workspace_user BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE PROCEDURE public.force_workspace_user_id()',
      t
    );
  END LOOP;
END $$;

DROP POLICY IF EXISTS portfolio_storage_insert ON storage.objects;
CREATE POLICY portfolio_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'portfolio'
    AND (storage.foldername(name))[1] = public.workspace_id()::text
  );

DROP POLICY IF EXISTS portfolio_storage_delete ON storage.objects;
CREATE POLICY portfolio_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'portfolio'
    AND (storage.foldername(name))[1] = public.workspace_id()::text
  );
