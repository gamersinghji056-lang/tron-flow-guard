DROP POLICY IF EXISTS personal_wallet_identities_select_linked
  ON public.personal_wallet_identities;

CREATE POLICY personal_wallet_identities_select_linked
  ON public.personal_wallet_identities
  FOR SELECT
  TO authenticated
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.personal_wallet_identity_links link
      WHERE link.identity_id = personal_wallet_identities.id
        AND link.user_id = auth.uid()
        AND link.status = 'active'
    )
  );
