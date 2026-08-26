-- Signer replay nonces are server-internal. The service role bypasses RLS;
-- browser roles must never inspect or mutate these values.
ALTER TABLE public.signer_request_nonces ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.signer_request_nonces FROM anon, authenticated;

-- PostgreSQL gives every new function EXECUTE to PUBLIC by default. Preserve
-- each function's existing explicit authenticated/service_role grants while
-- removing inherited anonymous execution from every privileged function.
DO $$
DECLARE
  privileged_function record;
BEGIN
  FOR privileged_function IN
    SELECT procedure.oid::regprocedure AS signature
    FROM pg_proc procedure
    JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.prosecdef
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon',
      privileged_function.signature
    );
  END LOOP;
END;
$$;
