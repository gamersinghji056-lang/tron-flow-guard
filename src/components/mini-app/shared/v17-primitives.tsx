import type { ComponentType, FormEvent, ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { MiniIcon } from "@/components/mini-app/crypto-icons";

export type V17Tone = "muted" | "success" | "warning" | "danger" | "info";

export function V17Screen({
  title,
  subtitle,
  compact,
  children,
}: {
  title: string;
  subtitle: string;
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <main className="space-y-4 pb-[86px]">
      <div className={compact ? "sr-only" : undefined}>
        <h1 className="text-[22px] font-semibold leading-tight tracking-normal">{title}</h1>
        <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
      </div>
      {children}
    </main>
  );
}

export function V17Surface({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-v17-surface
      className={`rounded-[17px] border border-[#222837] bg-[#10131a] ${className}`}
    >
      {children}
    </div>
  );
}

export function V17Section({
  title,
  action,
  onAction,
  children,
}: {
  title: string;
  action?: string;
  onAction?: () => void | Promise<void>;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex w-full items-center justify-between gap-3">
        <h2 className="text-[15px] font-medium">{title}</h2>
        {action ? (
          <button className="text-xs font-medium text-primary" onClick={() => void onAction?.()}>
            {action}
          </button>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function V17EmptyLine({ children }: { children: ReactNode }) {
  return (
    <p className="border-y border-[#222837] py-3 text-center text-sm text-slate-400">{children}</p>
  );
}

export function V17CompactEmpty({ title, body }: { title: string; body: string }) {
  return (
    <div className="border-y border-[#222837] py-3 text-center">
      <p className="text-sm font-medium text-slate-200">{title}</p>
      <p className="mt-1 text-xs text-slate-500">{body}</p>
    </div>
  );
}

export function V17LoadingState({ label = "Loading screen" }: { label?: string }) {
  return <V17Surface className="p-4 text-center text-xs text-slate-400">{label}</V17Surface>;
}

export function V17Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="border-t border-white/8 py-2">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium tabular-nums">{value}</p>
    </div>
  );
}

export function V17MetricGrid({ items }: { items: Array<[string, string]> }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map(([label, value]) => (
        <V17Metric key={label} label={label} value={value} />
      ))}
    </div>
  );
}

export function V17Tabs({
  value,
  setValue,
  items,
}: {
  value: string;
  setValue: (value: string) => void;
  items: Array<[string, string]>;
}) {
  return (
    <div className="flex gap-5 overflow-x-auto border-b border-[#222837]">
      {items.map(([key, label]) => (
        <button
          key={key}
          className={`relative shrink-0 py-[9px] pb-[11px] text-[11px] ${
            value === key
              ? "font-semibold text-white after:absolute after:inset-x-0 after:bottom-[-1px] after:h-0.5 after:bg-primary"
              : "text-slate-500"
          }`}
          onClick={() => setValue(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function V17SegmentedControl({
  value,
  setValue,
  items,
}: {
  value: string;
  setValue: (value: string) => void;
  items: Array<[string, string]>;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-[13px] border border-[#222837] bg-[#151925] p-1">
      {items.map(([key, label]) => (
        <button
          key={key}
          className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold ${
            value === key
              ? "bg-[#10131a] text-white shadow-[0_4px_12px_rgba(0,0,0,.12)]"
              : "text-slate-400"
          }`}
          onClick={() => setValue(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function V17StatusPill({ label, tone = "muted" }: { label: string; tone?: V17Tone }) {
  const toneClass =
    tone === "success"
      ? "border border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
      : tone === "info"
        ? "border border-primary/20 bg-primary/10 text-[#7ba0ff]"
        : tone === "warning"
          ? "border border-amber-400/20 bg-amber-500/12 text-amber-300"
          : tone === "danger"
            ? "border border-red-400/20 bg-red-500/12 text-red-300"
            : "border border-[#222837] bg-white/8 text-slate-400";
  return (
    <span
      className={`inline-flex rounded-full px-[7px] py-[5px] text-[8.5px] font-semibold ${toneClass}`}
    >
      {label}
    </span>
  );
}

export function V17ListRow({
  icon: Icon,
  title,
  body,
  onClick,
}: {
  icon: MiniIcon | ComponentType<{ className?: string }>;
  title: string;
  body: string;
  onClick: () => void | Promise<void>;
}) {
  return (
    <button
      className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-left"
      onClick={() => void onClick()}
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/6">
        <Icon className="h-5 w-5 text-primary" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block truncate text-xs text-slate-500">{body}</span>
      </span>
      <ChevronDown className="h-4 w-4 -rotate-90 text-slate-600" />
    </button>
  );
}

export function V17SettingRow({
  icon: Icon,
  title,
  body,
  onClick,
}: {
  icon: MiniIcon | ComponentType<{ className?: string }>;
  title: string;
  body: string;
  onClick: () => void | Promise<void>;
}) {
  return (
    <button
      className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-left"
      onClick={() => void onClick()}
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/6">
        <Icon className="h-5 w-5 text-primary" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block truncate text-xs text-slate-400">{body}</span>
      </span>
    </button>
  );
}

export function V17FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}

export function V17Input(props: React.ComponentProps<typeof Input>) {
  return <Input {...props} />;
}

export function V17Button(props: React.ComponentProps<typeof Button>) {
  return <Button {...props} />;
}
