import { StatusBadge } from "@/components/status-badge";
import {
  V17CompactEmpty,
  V17MetricGrid,
  V17Screen,
  V17Section,
} from "@/components/mini-app/shared/v17-primitives";
import { v17Money } from "@/components/mini-app/shared/v17-format";
import { shortenHash } from "@/lib/chain";

export interface MiniOrderRow {
  id: string;
  order_ref?: string | null;
  side?: string | null;
  status?: string | null;
  usdt_amount?: number | string | null;
  total_inr?: number | string | null;
  payment_deadline?: string | null;
  created_at?: string | null;
}

export interface MiniDirectSellOrderRow {
  id: string;
  order_ref?: string | null;
  status?: string | null;
  expected_usdt?: number | string | null;
  expected_inr?: number | string | null;
  confirmations?: number | null;
  required_confirmations?: number | null;
  assigned_company_address?: string | null;
}

function OrderList({ orders, empty }: { orders: MiniOrderRow[]; empty: string }) {
  if (!orders.length)
    return <V17CompactEmpty title={empty} body="Activity appears here as it happens." />;
  return (
    <div className="space-y-2">
      {orders.map((order) => (
        <div key={order.id} className="rounded-xl border border-white/10 bg-white/6 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="mono text-sm">{order.order_ref ?? shortenHash(order.id)}</p>
              <p className="mt-1 text-xs text-slate-500">
                {(order.side ?? "order").toUpperCase()} ·{" "}
                {order.created_at ? new Date(order.created_at).toLocaleString() : "Created"}
              </p>
            </div>
            <StatusBadge status={String(order.status ?? "pending")} />
          </div>
          <V17MetricGrid
            items={[
              ["USDT", v17Money(order.usdt_amount)],
              ["INR", v17Money(order.total_inr, "INR")],
            ]}
          />
        </div>
      ))}
    </div>
  );
}

export default function OrdersScreen({
  orders,
  directSellOrders,
  onDirectSell,
}: {
  orders: MiniOrderRow[];
  directSellOrders: MiniDirectSellOrderRow[];
  onDirectSell: (order: MiniDirectSellOrderRow) => void;
}) {
  return (
    <V17Screen title="Orders" subtitle="P2P, WTRON and vendor order activity">
      <V17Section title="WTRON Direct Sell">
        {directSellOrders.length ? (
          directSellOrders.map((order) => (
            <button
              key={order.id}
              type="button"
              className="w-full rounded-xl border border-white/10 bg-white/6 p-3 text-left"
              onClick={() => onDirectSell(order)}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="mono text-sm">{order.order_ref ?? shortenHash(order.id)}</p>
                <StatusBadge status={String(order.status ?? "waiting")} />
              </div>
              <V17MetricGrid
                items={[
                  ["USDT", v17Money(order.expected_usdt)],
                  ["Expected INR", v17Money(order.expected_inr, "INR")],
                  [
                    "Confirmations",
                    `${order.confirmations ?? 0}/${order.required_confirmations ?? 0}`,
                  ],
                  ["Address", order.assigned_company_address ? "Assigned" : "Pending"],
                ]}
              />
            </button>
          ))
        ) : (
          <V17CompactEmpty
            title="No direct sell orders"
            body="Sell USDT to WTRON from the Trade tab."
          />
        )}
      </V17Section>
      <V17Section title="P2P Orders">
        <OrderList orders={orders} empty="No P2P orders yet." />
      </V17Section>
    </V17Screen>
  );
}
