import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const rails = z
  .array(z.enum(["UPI", "IMPS", "NEFT", "RTGS"]))
  .min(1)
  .default(["UPI"]);

const upiInput = z.object({
  id: z.string().uuid().optional(),
  upiId: z.string().trim().min(3).max(120),
  holderName: z.string().trim().min(2).max(120),
  label: z.string().trim().max(80).optional(),
  isDefault: z.boolean().optional(),
});

const bankInput = z.object({
  id: z.string().uuid().optional(),
  accountHolder: z.string().trim().min(2).max(120),
  accountNumber: z.string().trim().min(6).max(34),
  ifsc: z
    .string()
    .trim()
    .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/i, "Enter a valid IFSC"),
  bankName: z.string().trim().min(2).max(120),
  label: z.string().trim().max(80).optional(),
  supportedRails: rails,
  isDefault: z.boolean().optional(),
});

const idInput = z.object({ id: z.string().uuid() });

export const listPaymentMethods = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("payment_methods" as never)
      .select(
        "id, kind, upi_id, holder_name, bank_name, account_number, ifsc, label, supported_rails, status, is_default, verified, created_at",
      )
      .eq("user_id", context.userId as never)
      .order("kind", { ascending: false })
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const saveUpiMethod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => upiInput.parse(input))
  .handler(async ({ data, context }) => {
    const payload = {
      user_id: context.userId,
      kind: "upi",
      upi_id: data.upiId.trim().toLowerCase(),
      holder_name: data.holderName.trim(),
      label: data.label?.trim() || null,
      bank_name: null,
      account_number: null,
      ifsc: null,
      supported_rails: ["UPI"],
      status: "active",
      is_default: data.isDefault ?? false,
    };
    const query = data.id
      ? context.supabase
          .from("payment_methods" as never)
          .update(payload as never)
          .eq("id", data.id as never)
          .eq("user_id", context.userId as never)
      : context.supabase.from("payment_methods" as never).insert(payload as never);
    const { error } = await query;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveBankMethod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => bankInput.parse(input))
  .handler(async ({ data, context }) => {
    const payload = {
      user_id: context.userId,
      kind: "bank",
      upi_id: null,
      holder_name: data.accountHolder.trim(),
      account_number: data.accountNumber.trim(),
      ifsc: data.ifsc.trim().toUpperCase(),
      bank_name: data.bankName.trim(),
      label: data.label?.trim() || null,
      supported_rails: data.supportedRails,
      status: "active",
      is_default: data.isDefault ?? false,
    };
    const query = data.id
      ? context.supabase
          .from("payment_methods" as never)
          .update(payload as never)
          .eq("id", data.id as never)
          .eq("user_id", context.userId as never)
      : context.supabase.from("payment_methods" as never).insert(payload as never);
    const { error } = await query;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setDefaultPaymentMethod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("payment_methods" as never)
      .update({ is_default: true } as never)
      .eq("id", data.id as never)
      .eq("user_id", context.userId as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePaymentMethod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("payment_methods" as never)
      .delete()
      .eq("id", data.id as never)
      .eq("user_id", context.userId as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
