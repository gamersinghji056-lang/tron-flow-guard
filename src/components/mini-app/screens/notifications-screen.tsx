import { Button } from "@/components/ui/button";
import { V17EmptyLine, V17Screen } from "@/components/mini-app/shared/v17-primitives";

export interface MiniNotificationRow {
  id: string;
  title?: string | null;
  body?: string | null;
}

export default function NotificationsScreen({
  rows,
  onMarkRead,
}: {
  rows: MiniNotificationRow[];
  onMarkRead: (id?: string) => void;
}) {
  return (
    <V17Screen title="Notifications" subtitle="Wallet, deposit, P2P and referral alerts">
      <Button variant="secondary" onClick={() => onMarkRead()}>
        Mark All Read
      </Button>
      {rows.length ? (
        rows.map((row) => (
          <div key={row.id} className="rounded-xl border border-white/10 bg-white/6 p-3">
            <div className="flex justify-between gap-3">
              <div>
                <p className="font-semibold">{row.title}</p>
                <p className="mt-1 text-sm text-slate-400">{row.body}</p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => onMarkRead(row.id)}>
                Read
              </Button>
            </div>
          </div>
        ))
      ) : (
        <V17EmptyLine>You are all caught up.</V17EmptyLine>
      )}
    </V17Screen>
  );
}
