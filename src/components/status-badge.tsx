import { cn } from "@/lib/utils";
import { DEPOSIT_STATUS_META, type DepositStatus } from "@/lib/chain";
import { CheckCircle2, Clock, Loader2, Radar, TriangleAlert, XCircle } from "lucide-react";

const TONE_CLASSES: Record<string, string> = {
  muted: "bg-muted text-muted-foreground border-border",
  info: "bg-info/12 text-info border-info/30",
  warning: "bg-warning/12 text-warning border-warning/30",
  success: "bg-success/12 text-success border-success/30",
  destructive: "bg-destructive/12 text-destructive border-destructive/30",
};

const ICONS: Record<DepositStatus, typeof Clock> = {
  waiting: Clock,
  detected: Radar,
  confirming: Loader2,
  confirmed: CheckCircle2,
  failed: XCircle,
  expired: TriangleAlert,
};

export function StatusBadge({
  status,
  className,
}: {
  status: DepositStatus;
  className?: string;
}) {
  const meta = DEPOSIT_STATUS_META[status];
  const Icon = ICONS[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap",
        TONE_CLASSES[meta.tone],
        className,
      )}
      title={meta.hint}
    >
      <Icon className={cn("h-3.5 w-3.5", status === "confirming" && "animate-spin")} />
      {meta.label}
    </span>
  );
}

export function LiveDot({ online }: { online: boolean | null }) {
  return (
    <span className="relative inline-flex h-2.5 w-2.5">
      <span
        className={cn(
          "absolute inline-flex h-full w-full rounded-full",
          online === false ? "bg-destructive" : online === null ? "bg-muted-foreground" : "bg-success animate-pulse-ring",
        )}
      />
      <span
        className={cn(
          "relative inline-flex h-2.5 w-2.5 rounded-full",
          online === false ? "bg-destructive" : online === null ? "bg-muted-foreground" : "bg-success",
        )}
      />
    </span>
  );
}
