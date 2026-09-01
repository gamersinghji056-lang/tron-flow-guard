import { supabase } from "@/integrations/supabase/client";

export async function authenticatedServerFnOptions() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { headers: { Authorization: `Bearer ${token}` } } : undefined;
}
