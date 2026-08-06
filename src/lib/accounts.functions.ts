/**
 * Account provisioning server functions.
 *
 * Trader sign-up happens in the browser through Supabase Auth (with email
 * verification). Administrator sign-up is gated behind a shared secret held in
 * `ADMIN_REGISTRATION_CODE` and is provisioned server-side so the role grant can
 * never be requested by a client.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const registerAdminInput = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(10, "Administrator passwords must be at least 10 characters").max(72),
  fullName: z.string().trim().min(1).max(80),
  code: z.string().trim().min(1, "Administrator code is required").max(200),
});

export const registerAdmin = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => registerAdminInput.parse(data))
  .handler(async ({ data }) => {
    const { provisionAdmin } = await import("@/lib/accounts.server");
    return provisionAdmin(data);
  });
