import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Building2, CreditCard, Loader2, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  deletePaymentMethod,
  listPaymentMethods,
  saveBankMethod,
  saveUpiMethod,
  setDefaultPaymentMethod,
} from "@/lib/payment-methods.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionHeader } from "@/components/stat-card";

interface MethodRow {
  id: string;
  kind: "upi" | "bank";
  upi_id: string | null;
  holder_name: string;
  bank_name: string | null;
  account_number: string | null;
  ifsc: string | null;
  label: string | null;
  supported_rails: string[] | null;
  status: string;
  is_default: boolean;
  verified: boolean;
  created_at: string;
}

export function BankAccountsPage() {
  const loadMethods = useServerFn(listPaymentMethods);
  const saveUpi = useServerFn(saveUpiMethod);
  const saveBank = useServerFn(saveBankMethod);
  const makeDefault = useServerFn(setDefaultPaymentMethod);
  const removeMethod = useServerFn(deletePaymentMethod);
  const [rows, setRows] = useState<MethodRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [upi, setUpi] = useState({ upiId: "", holderName: "", label: "" });
  const [bank, setBank] = useState({
    accountHolder: "",
    accountNumber: "",
    ifsc: "",
    bankName: "",
    label: "",
    supportedRails: ["IMPS", "NEFT", "RTGS"],
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows((await loadMethods()) as MethodRow[]);
    } catch (error) {
      toast.error("Unable to load payment methods.");
    } finally {
      setLoading(false);
    }
  }, [loadMethods]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitUpi(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      await saveUpi({
        data: {
          upiId: upi.upiId,
          holderName: upi.holderName,
          label: upi.label || undefined,
          isDefault: rows.filter((row) => row.kind === "upi").length === 0,
        },
      });
      setUpi({ upiId: "", holderName: "", label: "" });
      toast.success("UPI added");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save UPI");
    } finally {
      setPending(false);
    }
  }

  async function submitBank(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      await saveBank({
        data: {
          accountHolder: bank.accountHolder,
          accountNumber: bank.accountNumber,
          ifsc: bank.ifsc,
          bankName: bank.bankName,
          label: bank.label || undefined,
          supportedRails: bank.supportedRails as ["UPI" | "IMPS" | "NEFT" | "RTGS"],
          isDefault: rows.filter((row) => row.kind === "bank").length === 0,
        },
      });
      setBank({
        accountHolder: "",
        accountNumber: "",
        ifsc: "",
        bankName: "",
        label: "",
        supportedRails: ["IMPS", "NEFT", "RTGS"],
      });
      toast.success("Bank account added");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save bank account");
    } finally {
      setPending(false);
    }
  }

  async function setDefault(row: MethodRow) {
    try {
      await makeDefault({ data: { id: row.id } });
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not set default");
    }
  }

  async function remove(row: MethodRow) {
    try {
      await removeMethod({ data: { id: row.id } });
      toast.success("Payment method deleted");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete payment method");
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Bank Accounts & Payment Methods"
        description="UPI and bank details are private and only revealed to the actual counterparty for an active order."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <form className="panel space-y-3 p-5" onSubmit={submitUpi}>
          <h2 className="font-semibold">UPI</h2>
          <Field label="UPI ID">
            <Input
              value={upi.upiId}
              onChange={(event) => setUpi((current) => ({ ...current, upiId: event.target.value }))}
              placeholder="name@bank"
              required
            />
          </Field>
          <Field label="Account holder name">
            <Input
              value={upi.holderName}
              onChange={(event) =>
                setUpi((current) => ({ ...current, holderName: event.target.value }))
              }
              required
            />
          </Field>
          <Field label="Nickname">
            <Input
              value={upi.label}
              onChange={(event) => setUpi((current) => ({ ...current, label: event.target.value }))}
              placeholder="Primary UPI"
            />
          </Field>
          <Button disabled={pending}>
            {pending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-1.5 h-4 w-4" />
            )}
            Add UPI
          </Button>
        </form>

        <form className="panel space-y-3 p-5" onSubmit={submitBank}>
          <h2 className="font-semibold">Bank Account</h2>
          <Field label="Account holder">
            <Input
              value={bank.accountHolder}
              onChange={(event) =>
                setBank((current) => ({ ...current, accountHolder: event.target.value }))
              }
              required
            />
          </Field>
          <Field label="Account number">
            <Input
              value={bank.accountNumber}
              onChange={(event) =>
                setBank((current) => ({ ...current, accountNumber: event.target.value }))
              }
              required
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="IFSC">
              <Input
                value={bank.ifsc}
                onChange={(event) =>
                  setBank((current) => ({ ...current, ifsc: event.target.value.toUpperCase() }))
                }
                required
              />
            </Field>
            <Field label="Bank name">
              <Input
                value={bank.bankName}
                onChange={(event) =>
                  setBank((current) => ({ ...current, bankName: event.target.value }))
                }
                required
              />
            </Field>
          </div>
          <Field label="Nickname">
            <Input
              value={bank.label}
              onChange={(event) =>
                setBank((current) => ({ ...current, label: event.target.value }))
              }
              placeholder="Settlement account"
            />
          </Field>
          <Button disabled={pending} variant="secondary">
            {pending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-1.5 h-4 w-4" />
            )}
            Add Bank
          </Button>
        </form>
      </div>

      <section className="panel overflow-hidden">
        <div className="border-b px-5 py-4">
          <h2 className="font-semibold">Saved Methods</h2>
        </div>
        {loading ? (
          <div className="grid h-32 place-items-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            No UPI IDs or bank accounts yet.
          </p>
        ) : (
          <div className="divide-y">
            {rows.map((row) => (
              <div key={row.id} className="flex items-center gap-3 p-4">
                <span className="grid h-9 w-9 place-items-center rounded-md bg-secondary">
                  {row.kind === "upi" ? (
                    <CreditCard className="h-4 w-4 text-primary" />
                  ) : (
                    <Building2 className="h-4 w-4 text-primary" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {row.label || (row.kind === "upi" ? row.upi_id : row.bank_name)}
                    {row.is_default ? (
                      <Star className="ml-2 inline h-3.5 w-3.5 fill-warning text-warning" />
                    ) : null}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {row.kind === "upi"
                      ? `${row.upi_id} - ${row.holder_name}`
                      : `${row.bank_name} - ${row.ifsc} - ${row.supported_rails?.join(", ")}`}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={row.is_default}
                  onClick={() => void setDefault(row)}
                >
                  Default
                </Button>
                <Button size="icon" variant="ghost" onClick={() => void remove(row)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
