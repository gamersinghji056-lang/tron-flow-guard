DROP POLICY IF EXISTS wallet_purpose_assignments_admin_write ON public.wallet_purpose_assignments;
CREATE POLICY wallet_purpose_assignments_admin_insert
  ON public.wallet_purpose_assignments
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());
CREATE POLICY wallet_purpose_assignments_admin_update
  ON public.wallet_purpose_assignments
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
CREATE POLICY wallet_purpose_assignments_admin_delete
  ON public.wallet_purpose_assignments
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS user_transfer_controls_admin_write ON public.user_transfer_controls;
CREATE POLICY user_transfer_controls_admin_insert
  ON public.user_transfer_controls
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());
CREATE POLICY user_transfer_controls_admin_update
  ON public.user_transfer_controls
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
CREATE POLICY user_transfer_controls_admin_delete
  ON public.user_transfer_controls
  FOR DELETE
  TO authenticated
  USING (public.is_admin());
