import { type Dispatch, type SetStateAction, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { formatUsdt } from "@/lib/chain";
import {
  confirmDirectSellPaymentItem,
  disputeDirectSellPaymentItem,
} from "@/lib/direct-sell-admin.functions";
import { createPaymentProofUpload, registerPaymentProof } from "@/lib/proofs.functions";
import { submitVendorPayment } from "@/lib/vendor-trade.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "@/components/stat-card";

export const Route = createFileRoute("/_authenticated/orders")({
  head: () => ({ meta: [{ title: "Orders - TRONDESK" }] }),
  component: OrdersPage,
});

interface P2pOrderRow {
  id: string;
  order_ref: string;
  side: string;
  status: string;
  usdt_amount: number;
  price_inr: number;
  total_inr: number;
  payment_deadline: string | null;
  created_at: string;
}

interface DirectSellRow {
  id: string;
  order_ref: string;
  expected_usdt: number;
  received_usdt: number;
  expected_inr: number;
  locked_rate_inr: number;
  status: string;
  assigned_company_address: string;
  txid: string | null;
  confirmations: number;
  required_confirmations: number;
  created_at: string;
}

interface DirectSellPaymentItemRow {
  id: string;
  direct_sell_order_id: string;
  amount_inr: number;
  utr_reference: string | null;
  status: string;
  confirmation_deadline: string | null;
  created_at: string;
}

interface VendorOrderRow {
  id: string;
  order_ref: string;
  usdt_amount: number;
  total_inr: number;
  rate_inr: number;
  status: string;
  payment_deadline: string | null;
  payment_account_snapshot: Record<string, unknown>;
  created_at: string;
}

type RawP2pOrderRow = Omit<P2pOrderRow, "usdt_amount" | "price_inr" | "total_inr"> & {
  usdt_amount: unknown;
  price_inr: unknown;
  total_inr: unknown;
};

type RawDirectSellRow = Omit<
  DirectSellRow,
  "expected_usdt" | "received_usdt" | "expected_inr" | "locked_rate_inr"
> & {
  expected_usdt: unknown;
  received_usdt: unknown;
  expected_inr: unknown;
  locked_rate_inr: unknown;
};

interface LooseDirectSellQuery {
  select: (columns: string) => {
    order: (
      column: string,
      options: { ascending: boolean },
    ) => {
      limit: (
        count: number,
      ) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
    };
  };
}

function OrdersPage() {
  const submitVendor = useServerFn(submitVendorPayment);
  const createProofUpload = useServerFn(createPaymentProofUpload);
  const registerProof = useServerFn(registerPaymentProof);
  const confirmPaymentItem = useServerFn(confirmDirectSellPaymentItem);
  const disputePaymentItem = useServerFn(disputeDirectSellPaymentItem);
  const [p2pOrders, setP2pOrders] = useState<P2pOrderRow[]>([]);
  const [directSellOrders, setDirectSellOrders] = useState<DirectSellRow[]>([]);
  const [directSellItems, setDirectSellItems] = useState<DirectSellPaymentItemRow[]>([]);
  const [vendorOrders, setVendorOrders] = useState<VendorOrderRow[]>([]);
  const [vendorInputs, setVendorInputs] = useState<
    Record<string, { utr: string; amount: string; file: File | null }>
  >({});

  async function load() {
    const [{ data: p2p }, { data: direct }, { data: items }, { data: vendorRows }] =
      await Promise.all([
        supabase
          .from("p2p_orders")
          .select(
            "id, order_ref, side, status, usdt_amount, price_inr, total_inr, payment_deadline, created_at",
          )
          .order("created_at", { ascending: false })
          .limit(100),
        (supabase.from("direct_sell_orders" as never) as unknown as LooseDirectSellQuery)
          .select(
            "id, order_ref, expected_usdt, received_usdt, expected_inr, locked_rate_inr, status, assigned_company_address, txid, confirmations, required_confirmations, created_at",
          )
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("direct_sell_payment_items" as never)
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("vendor_orders" as never)
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100),
      ]);
    setP2pOrders(((p2p ?? []) as unknown as RawP2pOrderRow[]).map(numberizeP2p));
    setDirectSellOrders(((direct ?? []) as unknown as RawDirectSellRow[]).map(numberizeDirect));
    setDirectSellItems((items ?? []) as unknown as DirectSellPaymentItemRow[]);
    setVendorOrders((vendorRows ?? []) as unknown as VendorOrderRow[]);
  }

  useEffect(() => {
    void load();
    const channel = supabase
      .channel(`orders-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "p2p_orders" },
        () => void load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "direct_sell_orders" },
        () => void load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vendor_orders" },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Orders"
        description="P2P and direct-sell order state from the database."
      />
      <OrderTable rows={p2pOrders} />
      <DirectSellTable rows={directSellOrders} />
      <DirectSellPaymentItems
        rows={directSellItems}
        onConfirm={async (itemId) => {
          await confirmPaymentItem({ data: { itemId } });
          await load();
        }}
        onDispute={async (itemId) => {
          await disputePaymentItem({ data: { itemId, reason: "Payment not received" } });
          await load();
        }}
      />
      <VendorOrderTable
        rows={vendorOrders}
        inputs={vendorInputs}
        setInputs={setVendorInputs}
        onSubmit={async (row) => {
          const input = vendorInputs[row.id];
          if (!input?.file) throw new Error("Upload payment proof");
          const upload = await createProofUpload({
            data: {
              orderType: "vendor",
              orderId: row.id,
              fileName: input.file.name,
              contentType: input.file.type || "application/octet-stream",
              sizeBytes: input.file.size,
            },
          });
          const { error } = await supabase.storage
            .from("payment-proofs")
            .uploadToSignedUrl(upload.path, upload.token, input.file);
          if (error) throw new Error(error.message);
          await registerProof({
            data: {
              orderType: "vendor",
              orderId: row.id,
              storagePath: upload.path,
              fileName: input.file.name,
              contentType: input.file.type || "application/octet-stream",
              sizeBytes: input.file.size,
            },
          });
          await submitVendor({
            data: {
              orderId: row.id,
              utr: input.utr,
              amountInr: Number(input.amount),
              proofPath: upload.path,
            },
          });
          await load();
        }}
      />
    </div>
  );
}

function numberizeP2p(row: RawP2pOrderRow): P2pOrderRow {
  return {
    ...row,
    usdt_amount: Number(row.usdt_amount ?? 0),
    price_inr: Number(row.price_inr ?? 0),
    total_inr: Number(row.total_inr ?? 0),
  };
}

function numberizeDirect(row: RawDirectSellRow): DirectSellRow {
  return {
    ...row,
    expected_usdt: Number(row.expected_usdt ?? 0),
    received_usdt: Number(row.received_usdt ?? 0),
    expected_inr: Number(row.expected_inr ?? 0),
    locked_rate_inr: Number(row.locked_rate_inr ?? 0),
  };
}

function OrderTable({ rows }: { rows: P2pOrderRow[] }) {
  return (
    <div className="panel overflow-hidden">
      <div className="border-b px-5 py-3 text-sm font-semibold">P2P orders</div>
      <table className="w-full text-sm">
        <thead className="bg-secondary/50 text-xs tracking-wide text-muted-foreground uppercase">
          <tr>
            <th className="px-4 py-2.5 text-left font-medium">Order</th>
            <th className="px-4 py-2.5 text-left font-medium">Side</th>
            <th className="px-4 py-2.5 text-left font-medium">USDT</th>
            <th className="px-4 py-2.5 text-left font-medium">INR</th>
            <th className="px-4 py-2.5 text-left font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                No P2P orders yet.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id}>
                <td className="mono px-4 py-2.5">
                  <Link
                    className="text-primary hover:underline"
                    to={"/orders/$orderId" as never}
                    params={{ orderId: row.id } as never}
                  >
                    {row.order_ref}
                  </Link>
                </td>
                <td className="px-4 py-2.5">{row.side}</td>
                <td className="mono px-4 py-2.5">{formatUsdt(row.usdt_amount)}</td>
                <td className="mono px-4 py-2.5">Rs {row.total_inr.toLocaleString("en-IN")}</td>
                <td className="px-4 py-2.5">{row.status}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function DirectSellTable({ rows }: { rows: DirectSellRow[] }) {
  return (
    <div className="panel overflow-hidden">
      <div className="border-b px-5 py-3 text-sm font-semibold">Direct sell</div>
      <table className="w-full text-sm">
        <thead className="bg-secondary/50 text-xs tracking-wide text-muted-foreground uppercase">
          <tr>
            <th className="px-4 py-2.5 text-left font-medium">Order</th>
            <th className="px-4 py-2.5 text-left font-medium">Expected</th>
            <th className="px-4 py-2.5 text-left font-medium">Received</th>
            <th className="px-4 py-2.5 text-left font-medium">INR</th>
            <th className="px-4 py-2.5 text-left font-medium">Confirmations</th>
            <th className="px-4 py-2.5 text-left font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                No direct-sell orders yet.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id}>
                <td className="mono px-4 py-2.5">{row.order_ref}</td>
                <td className="mono px-4 py-2.5">{formatUsdt(row.expected_usdt)}</td>
                <td className="mono px-4 py-2.5">{formatUsdt(row.received_usdt)}</td>
                <td className="mono px-4 py-2.5">Rs {row.expected_inr.toLocaleString("en-IN")}</td>
                <td className="mono px-4 py-2.5">
                  {row.confirmations}/{row.required_confirmations}
                </td>
                <td className="px-4 py-2.5">{row.status}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function DirectSellPaymentItems({
  rows,
  onConfirm,
  onDispute,
}: {
  rows: DirectSellPaymentItemRow[];
  onConfirm: (itemId: string) => Promise<void>;
  onDispute: (itemId: string) => Promise<void>;
}) {
  return (
    <div className="panel overflow-hidden">
      <div className="border-b px-5 py-3 text-sm font-semibold">WTRON INR payment items</div>
      <table className="w-full text-sm">
        <thead className="bg-secondary/50 text-xs tracking-wide text-muted-foreground uppercase">
          <tr>
            <th className="px-4 py-2.5 text-left font-medium">Payment</th>
            <th className="px-4 py-2.5 text-left font-medium">Amount</th>
            <th className="px-4 py-2.5 text-left font-medium">UTR</th>
            <th className="px-4 py-2.5 text-left font-medium">Status</th>
            <th className="px-4 py-2.5 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                No WTRON INR payment items yet.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id}>
                <td className="mono px-4 py-2.5">{row.id.slice(0, 8)}</td>
                <td className="mono px-4 py-2.5">
                  Rs {Number(row.amount_inr).toLocaleString("en-IN")}
                </td>
                <td className="mono px-4 py-2.5">{row.utr_reference ?? "-"}</td>
                <td className="px-4 py-2.5">{row.status}</td>
                <td className="space-x-2 px-4 py-2.5 text-right">
                  {row.status === "sent" && (
                    <>
                      <Button size="sm" onClick={() => void onConfirm(row.id)}>
                        Confirm
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => void onDispute(row.id)}>
                        Dispute
                      </Button>
                    </>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function VendorOrderTable({
  rows,
  inputs,
  setInputs,
  onSubmit,
}: {
  rows: VendorOrderRow[];
  inputs: Record<string, { utr: string; amount: string; file: File | null }>;
  setInputs: Dispatch<
    SetStateAction<Record<string, { utr: string; amount: string; file: File | null }>>
  >;
  onSubmit: (row: VendorOrderRow) => Promise<void>;
}) {
  return (
    <div className="panel overflow-hidden">
      <div className="border-b px-5 py-3 text-sm font-semibold">Vendor buy orders</div>
      <table className="w-full text-sm">
        <thead className="bg-secondary/50 text-xs tracking-wide text-muted-foreground uppercase">
          <tr>
            <th className="px-4 py-2.5 text-left font-medium">Order</th>
            <th className="px-4 py-2.5 text-left font-medium">USDT / INR</th>
            <th className="px-4 py-2.5 text-left font-medium">Status</th>
            <th className="px-4 py-2.5 text-right font-medium">Payment</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                No vendor orders yet.
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const input = inputs[row.id] ?? { utr: "", amount: "", file: null };
              return (
                <tr key={row.id}>
                  <td className="mono px-4 py-2.5">{row.order_ref}</td>
                  <td className="mono px-4 py-2.5">
                    {formatUsdt(Number(row.usdt_amount))} / Rs{" "}
                    {Number(row.total_inr).toLocaleString("en-IN")}
                  </td>
                  <td className="px-4 py-2.5">{row.status}</td>
                  <td className="space-y-2 px-4 py-2.5 text-right">
                    {row.status === "payment_pending" ? (
                      <div className="ml-auto grid max-w-xl gap-2 md:grid-cols-[1fr_1fr_1fr_auto]">
                        <Input
                          value={input.utr}
                          onChange={(event) =>
                            setInputs((current) => ({
                              ...current,
                              [row.id]: { ...input, utr: event.target.value },
                            }))
                          }
                          placeholder="UTR"
                        />
                        <Input
                          value={input.amount}
                          onChange={(event) =>
                            setInputs((current) => ({
                              ...current,
                              [row.id]: { ...input, amount: event.target.value },
                            }))
                          }
                          placeholder="Paid INR"
                        />
                        <Input
                          type="file"
                          accept="image/*,.pdf"
                          onChange={(event) =>
                            setInputs((current) => ({
                              ...current,
                              [row.id]: { ...input, file: event.target.files?.[0] ?? null },
                            }))
                          }
                        />
                        <Button size="sm" onClick={() => void onSubmit(row)}>
                          I paid
                        </Button>
                      </div>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
