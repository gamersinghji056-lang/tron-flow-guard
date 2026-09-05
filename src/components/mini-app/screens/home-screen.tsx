import { MiniIcons, type MiniIcon } from "@/components/mini-app/crypto-icons";
import { V17Avatar } from "@/components/v17-avatar";
import { StatusBadge } from "@/components/status-badge";
import {
  V17EmptyLine,
  V17ListRow,
  V17Screen,
  V17Section,
  V17StatusPill,
  V17Surface,
} from "@/components/mini-app/shared/v17-primitives";
import { v17Money } from "@/components/mini-app/shared/v17-format";
import { walletDisplayBalance } from "@/lib/wallet-state";
import type { MiniT } from "@/lib/mini-i18n";

export interface HomeProfileSummary {
  balance?: number | string | null;
  locked_balance?: number | string | null;
  full_name?: string | null;
  email?: string | null;
}

export interface HomeOrderRow {
  id: string;
  order_ref?: string | null;
  side?: string | null;
  status?: string | null;
  usdt_amount?: number | string | null;
  total_inr?: number | string | null;
}

export interface HomeTransactionRow {
  id: string;
  entry_type?: string | null;
  direction?: string | null;
  kind?: string | null;
  currency?: string | null;
  amount?: number | string | null;
  status?: string | null;
  created_at?: string | null;
}

export interface HomeAdRow {
  id: string;
  side: "buy" | "sell";
  price_inr: number | string;
  available_usdt: number | string;
  min_order_inr: number | string;
  max_order_inr: number | string;
  payment_methods: string[] | null;
  merchants?: {
    display_name?: string | null;
    completed_orders?: number | null;
    total_orders?: number | null;
    success_rate?: number | string | null;
    verified?: boolean | null;
  } | null;
}

export interface HomeWalletRow {
  id: string;
  name?: string | null;
  address?: string | null;
  network?: string | null;
  balance?: number | string | null;
  onchain_balance?: number | string | null;
  onchain_trx_balance?: number | string | null;
  custody?: string | null;
  wallet_type?: string | null;
  wallet_role?: string | null;
}

type HomeTargetScreen =
  "platform-deposit" | "send" | "wallet-receive" | "trade" | "orders" | "p2p" | "bank-accounts";

function StatTile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-[14px] border border-[#222837] bg-[#10131a] p-3">
      <p className="text-[9px] text-slate-500">{label}</p>
      <p className="mt-1 text-[17px] font-semibold tracking-[-0.03em] tabular-nums">{value}</p>
    </div>
  );
}

function QuickAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: MiniIcon;
  label: string;
  onClick: () => void | Promise<void>;
}) {
  return (
    <button className="text-center" onClick={() => void onClick()}>
      <span className="mx-auto grid h-[45px] w-[45px] place-items-center rounded-[14px] border border-[#222837] bg-[#10131a] text-[#7ba0ff]">
        <Icon className="h-4 w-4" />
      </span>
      <span className="mt-2 block text-[11px] font-normal text-slate-300">{label}</span>
    </button>
  );
}

function completionRate(ad: HomeAdRow) {
  if (ad.merchants?.success_rate != null) return `${Number(ad.merchants.success_rate).toFixed(0)}%`;
  const total = Number(ad.merchants?.total_orders ?? 0);
  const complete = Number(ad.merchants?.completed_orders ?? 0);
  if (!total) return complete ? "100%" : "New";
  return `${Math.round((complete / total) * 100)}%`;
}

function AdCard({ ad, onTake }: { ad: HomeAdRow; onTake: () => void }) {
  const name = ad.merchants?.display_name ?? "Advertiser";
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const verified =
    Number(ad.merchants?.completed_orders ?? 0) > 0 || Boolean(ad.merchants?.verified);
  return (
    <div className="border-b border-[#222837] py-[15px] last:border-b-0">
      <div className="flex items-start gap-[9px]">
        <V17Avatar initials={initials || "WT"} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold">
            {name}{" "}
            <span
              className={verified ? "text-[8.5px] text-emerald-300" : "text-[8.5px] text-amber-300"}
            >
              {verified ? "VERIFIED" : "UNVERIFIED"}
            </span>
          </p>
          <p className="mt-1 text-[9px] text-slate-500">WTRON member / release tracked by orders</p>
        </div>
        <V17StatusPill label="Online" tone="success" />
      </div>
      <p className="mt-[10px] text-[22px] font-semibold tracking-[-0.04em] tabular-nums">
        {v17Money(ad.price_inr, "INR")}{" "}
        <span className="text-[9px] font-normal text-slate-500">/ USDT</span>
      </p>
      <p className="mt-1 text-[8.8px] text-slate-500">
        {v17Money(ad.min_order_inr, "INR")}-{v17Money(ad.max_order_inr, "INR")} /{" "}
        {(ad.payment_methods ?? ["upi"]).join(" / ").toUpperCase()} / {v17Money(ad.available_usdt)}U
        available
      </p>
      <div className="mt-[10px] flex justify-end">
        <button
          className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
          onClick={onTake}
        >
          {ad.side === "sell" ? "Buy" : "Sell"}
        </button>
      </div>
    </div>
  );
}

function OrderCard({ order }: { order: HomeOrderRow }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/6 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{order.order_ref ?? "P2P Order"}</p>
          <p className="mt-1 text-xs text-slate-500">{order.side ?? "order"}</p>
        </div>
        <StatusBadge status={String(order.status ?? "pending")} />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <StatTile label="USDT" value={v17Money(order.usdt_amount)} />
        <StatTile label="INR" value={v17Money(order.total_inr, "INR")} />
      </div>
    </div>
  );
}

function TransactionList({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: HomeTransactionRow[];
  empty: string;
}) {
  return (
    <V17Section title={title}>
      {rows.length ? (
        rows.slice(0, 5).map((row) => (
          <div key={row.id} className="rounded-xl border border-white/10 bg-white/6 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{row.entry_type ?? row.kind ?? "Activity"}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {row.created_at ? new Date(row.created_at).toLocaleString() : "Recorded"}
                </p>
              </div>
              <p className="text-sm font-semibold">
                {v17Money(row.amount, row.currency ?? "USDT")}
              </p>
            </div>
          </div>
        ))
      ) : (
        <V17EmptyLine>{empty}</V17EmptyLine>
      )}
    </V17Section>
  );
}

export default function HomeScreen({
  vendorMode,
  total,
  profile,
  orders,
  transactions,
  ads,
  wallet,
  preservedWallets = [],
  onNavigate,
}: {
  vendorMode?: boolean;
  total: number;
  profile: HomeProfileSummary | null;
  orders: HomeOrderRow[];
  transactions: HomeTransactionRow[];
  ads: HomeAdRow[];
  wallet: HomeWalletRow | null;
  preservedWallets?: HomeWalletRow[];
  t: MiniT;
  onNavigate: (screen: HomeTargetScreen) => Promise<void>;
}) {
  const walletUsdt = walletDisplayBalance(wallet);
  const walletTrx = Number(wallet?.onchain_trx_balance ?? 0);
  const preservedUsdt = preservedWallets.reduce((sum, row) => sum + walletDisplayBalance(row), 0);
  const preservedTrx = preservedWallets.reduce(
    (sum, row) => sum + Number(row.onchain_trx_balance ?? 0),
    0,
  );
  if (vendorMode) {
    return (
      <V17Screen
        title="Vendor Workspace"
        subtitle="Liquidity, listings and vendor order operations"
        compact
      >
        <section className="space-y-4 pt-1">
          <div>
            <p className="kicker-v17">APPROVED VENDOR</p>
            <h1 className="title-v17">Vendor Workspace</h1>
            <p className="body-v17">
              Liquidity, listings, payout capacity and vendor order operations.
            </p>
          </div>
          <V17Surface className="border-primary/20 bg-[linear-gradient(130deg,rgba(79,124,255,.12),#10131a)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[9px] text-slate-500">Available liquidity</p>
                <p className="balance-v17 mt-1 text-[31px]">{v17Money(walletUsdt)} U</p>
              </div>
              <V17StatusPill label="APPROVED" tone="success" />
            </div>
          </V17Surface>
          <div className="grid grid-cols-2 gap-[10px]">
            <StatTile label="Today sold" value={v17Money(profile?.locked_balance)} />
            <StatTile label="Completion" value="Live after orders" />
            <StatTile label="Active listings" value={String(ads.length)} />
            <StatTile label="Vendor orders" value={String(orders.length)} />
          </div>
        </section>
        <V17Section
          title="Payout capacity"
          action="Manage"
          onAction={() => onNavigate("bank-accounts")}
        >
          <V17ListRow
            icon={MiniIcons.bank}
            title="Vendor payout accounts"
            body="Limits, capacity and default rails"
            onClick={() => onNavigate("bank-accounts")}
          />
        </V17Section>
        <V17Section title="Vendor orders" action="View all" onAction={() => onNavigate("orders")}>
          {orders.length ? (
            orders.slice(0, 3).map((order) => <OrderCard key={order.id} order={order} />)
          ) : (
            <V17EmptyLine>No active vendor orders.</V17EmptyLine>
          )}
        </V17Section>
      </V17Screen>
    );
  }
  return (
    <V17Screen title="Home" subtitle="Wallet, P2P and WTRON trading overview" compact>
      <section className="space-y-5 pt-1">
        <div>
          <p className="kicker-v17">TRADER ACCOUNT</p>
          <h1 className="title-v17 truncate">{profile?.full_name || "WTRON Trader"}</h1>
          <p className="body-v17">Your personal WTRON wallet, P2P and direct trading overview.</p>
        </div>
        <div>
          <p className="text-[9px] text-slate-500">Total portfolio</p>
          <p className="balance-v17">{v17Money(total)} USDT</p>
          <p className="text-[10px] text-slate-500">
            Personal Mainnet wallets. Active wallet TRX: {v17Money(walletTrx, "TRX")} TRX
          </p>
        </div>
        <div className="grid grid-cols-4 gap-3">
          <QuickAction
            icon={MiniIcons.deposit}
            label="Deposit"
            onClick={() => onNavigate("platform-deposit")}
          />
          <QuickAction icon={MiniIcons.send} label="Send" onClick={() => onNavigate("send")} />
          <QuickAction
            icon={MiniIcons.receive}
            label="Receive"
            onClick={() => onNavigate("wallet-receive")}
          />
          <QuickAction icon={MiniIcons.trade} label="Trade" onClick={() => onNavigate("trade")} />
        </div>
        <div className="grid grid-cols-2 gap-[10px]">
          <StatTile label="WTRON balance" value={`${v17Money(profile?.balance)} U`} />
          <StatTile label="Wallet balance" value={`${v17Money(walletUsdt)} U`} />
        </div>
        {preservedWallets.length ? (
          <V17Surface className="p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[13px] font-semibold">Preserved wallet data</p>
                <p className="mt-1 text-[11px] leading-5 text-slate-500">
                  {preservedWallets.length} historical wallet
                  {preservedWallets.length === 1 ? "" : "s"} visible read-only. These balances are
                  not included in Mainnet portfolio totals.
                </p>
              </div>
              <V17StatusPill label="READ ONLY" tone="warning" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <StatTile label="Historical USDT" value={`${v17Money(preservedUsdt)} U`} />
              <StatTile label="Historical TRX" value={`${v17Money(preservedTrx, "TRX")} TRX`} />
            </div>
          </V17Surface>
        ) : null}
      </section>
      <V17Section title="Active Orders" action="View all" onAction={() => onNavigate("orders")}>
        {orders.length ? (
          orders.slice(0, 3).map((order) => <OrderCard key={order.id} order={order} />)
        ) : (
          <V17EmptyLine>No active orders. Browse P2P or WTRON Trade.</V17EmptyLine>
        )}
      </V17Section>
      {!vendorMode ? (
        <V17Section title="Current P2P Orders" action="Market" onAction={() => onNavigate("p2p")}>
          {ads.length ? (
            ads
              .slice(0, 2)
              .map((ad) => <AdCard key={ad.id} ad={ad} onTake={() => onNavigate("p2p")} />)
          ) : (
            <V17EmptyLine>No live marketplace cards loaded yet.</V17EmptyLine>
          )}
        </V17Section>
      ) : null}
      <TransactionList
        title="Recent Activity"
        rows={transactions}
        empty="No ledger activity yet."
      />
    </V17Screen>
  );
}
