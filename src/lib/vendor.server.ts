import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Client = SupabaseClient<Database>;

export interface ApprovedVendor {
  id: string;
  user_id: string;
  name: string;
  status: "approved";
}

export async function requireApprovedVendor(
  client: Client,
  userId: string,
): Promise<ApprovedVendor> {
  const { data, error } = await client
    .from("trading_vendors" as never)
    .select("id, user_id, name, status")
    .eq("user_id", userId as never)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const vendor = data as unknown as ApprovedVendor | null;
  if (!vendor) throw new Error("Vendor application required");
  if (vendor.status !== "approved") throw new Error("Vendor approval required");
  return vendor;
}
