import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, RouteIcon, Send } from "lucide-react";
import { toast } from "sonner";
import {
  assignDirectSellPayment,
  completeDirectSellOrder,
  createDirectSellPaymentItem,
  markDirectSellPaymentSent,
} from "@/lib/direct-sell-admin.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "@/components/stat-card";

export const Route = createFileRoute("/_authenticated/admin/direct-sell")({
  component: AdminDirectSellPage,
});

interface DirectSellRow {
  id: string;
  order_ref: string;
  user_id: string;
  expected_usdt: number;
  received_usdt: number;
  locked_rate_inr: number;
  expected_inr: number;
  assigned_company_address: string;
  sender_address: string | null;
  txid: string | null;
  confirmations: number;
  required_confirmations: number;
  payment_reference: string | null;
  status: string;
  created_at: string;
}

function AdminDirectSellPage() {
  const assignPayment = useServerFn(assignDirectSellPayment);
  const markSent = useServerFn(markDirectSellPaymentSent);
  const completeOrder = useServerFn(completeDirectSellOrder);
  const createPaymentItem = useServerFn(createDirectSellPaymentItem);
  const [rows, setRows] = useState<DirectSellRow[]>([]);
  const [references, setReferences] = useState<Record<string, string>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [working, setWorking] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("direct_sell_orders" as never)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) toast.error(error.message);
    setRows((data ?? []) as unknown as DirectSellRow[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(id: string, action: () => Promise<unknown>, success: string) {
    setWorking(id);
    try {
      await action();
      await load();
      toast.success(success);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed");
    } finally {
      setWorking(null);
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Direct Sell"
        description="USDT confirmation, payment-source assignment and INR settlement operations."
      />
      <div className="panel overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">Order</th>
              <th className="px-4 py-2.5 text-left font-medium">User</th>
              <th className="px-4 py-2.5 text-left font-medium">USDT / INR</th>
              <th className="px-4 py-2.5 text-left font-medium">Blockchain</th>
              <th className="px-4 py-2.5 text-left font-medium">Status</th>
              <th className="px-4 py-2.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="mono px-4 py-2.5">{row.order_ref}</td>
                <td className="mono max-w-48 truncate px-4 py-2.5">{row.user_id}</td>
                <td className="mono px-4 py-2.5">
                  {Number(row.expected_usdt).toLocaleString()} USDT
                  <br />
                  Rs {Number(row.expected_inr).toLocaleString("en-IN")}
                </td>
                <td className="mono max-w-72 truncate px-4 py-2.5 text-xs">
                  {row.txid ?? row.assigned_company_address}
                  <br />
                  {row.confirmations}/{row.required_confirmations}
                </td>
                <td className="px-4 py-2.5">{row.status}</td>
                <td className="space-y-2 px-4 py-2.5 text-right">
                  {["usdt_confirmed", "inr_payment_pending"].includes(row.status) && (
                    <Button
                      size="sm"
                      disabled={working === row.id}
                      onClick={() =>
                        void run(
                          row.id,
                          () => assignPayment({ data: { orderId: row.id } }),
                          "Payment source assigned",
                        )
                      }
                    >
                      <RouteIcon className="mr-1.5 h-3.5 w-3.5" />
                      Assign
                    </Button>
                  )}
                  {row.status === "payment_assigned" && (
                    <div className="flex justify-end gap-2">
                      <Input
                        className="h-8 max-w-40"
                        value={references[row.id] ?? ""}
                        onChange={(event) =>
                          setReferences((current) => ({ ...current, [row.id]: event.target.value }))
                        }
                        placeholder="Reference"
                      />
                      <Button
                        size="sm"
                        disabled={working === row.id}
                        onClick={() =>
                          void run(
                            row.id,
                            () =>
                              markSent({
                                data: { orderId: row.id, reference: references[row.id] ?? "" },
                              }),
                            "Payment marked sent",
                          )
                        }
                      >
                        <Send className="mr-1.5 h-3.5 w-3.5" />
                        Sent
                      </Button>
                    </div>
                  )}
                  {["inr_payment_sent", "payment_verifying"].includes(row.status) && (
                    <Button
                      size="sm"
                      disabled={working === row.id}
                      onClick={() =>
                        void run(
                          row.id,
                          () => completeOrder({ data: { orderId: row.id } }),
                          "Direct sell completed",
                        )
                      }
                    >
                      <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                      Complete
                    </Button>
                  )}
                  {[
                    "inr_payment_pending",
                    "payment_assigned",
                    "inr_payment_sent",
                    "payment_verifying",
                  ].includes(row.status) && (
                    <div className="flex justify-end gap-2">
                      <Input
                        className="h-8 max-w-32"
                        value={amounts[row.id] ?? ""}
                        onChange={(event) =>
                          setAmounts((current) => ({ ...current, [row.id]: event.target.value }))
                        }
                        placeholder="INR"
                      />
                      <Input
                        className="h-8 max-w-40"
                        value={references[`item-${row.id}`] ?? ""}
                        onChange={(event) =>
                          setReferences((current) => ({
                            ...current,
                            [`item-${row.id}`]: event.target.value,
                          }))
                        }
                        placeholder="UTR"
                      />
                      <Button
                        size="sm"
                        disabled={working === row.id}
                        onClick={() =>
                          void run(
                            row.id,
                            () =>
                              createPaymentItem({
                                data: {
                                  orderId: row.id,
                                  amountInr: Number(amounts[row.id] ?? 0),
                                  utr: references[`item-${row.id}`] ?? "",
                                },
                              }),
                            "Payment item created",
                          )
                        }
                      >
                        Add item
                      </Button>
                    </div>
                  )}
                  {working === row.id && <Loader2 className="ml-auto h-4 w-4 animate-spin" />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
