import { supabase } from "@/integrations/supabase/client";

export async function authenticatedServerFnOptions(accessToken?: string) {
  const token = accessToken ?? (await supabase.auth.getSession()).data.session?.access_token;
  return token ? { headers: { Authorization: `Bearer ${token}` } } : undefined;
}
