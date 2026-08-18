import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, RotateCcw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { resolveP2pDispute } from "@/lib/admin-disputes.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "@/components/stat-card";

export const Route = createFileRoute("/_authenticated/admin/disputes")({
  component: AdminDisputesPage,
});

interface DisputeRow {
  id: string;
  order_id: string;
  raised_by: string | null;
  reason: string;
  priority: string;
  status: string;
  created_at: string;
}

function AdminDisputesPage() {
  const resolveDispute = useServerFn(resolveP2pDispute);
  const [rows, setRows] = useState<DisputeRow[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [working, setWorking] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("p2p_disputes")
      .select("id, order_id, raised_by, reason, priority, status, created_at")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setRows((data ?? []) as DisputeRow[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function action(id: string, next: "request_evidence" | "release" | "refund" | "reject") {
    setWorking(id);
    try {
      await resolveDispute({
        data: {
          disputeId: id,
          action: next,
          reason: reasons[id] || `${next} by admin`,
        },
      });
      await load();
      toast.success("Dispute action recorded");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed");
    } finally {
      setWorking(null);
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Disputes"
        description="Reasoned admin actions. Escrow release/refund remains atomic in the database."
      />
      <div className="panel overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">Dispute</th>
              <th className="px-4 py-2.5 text-left font-medium">Order</th>
              <th className="px-4 py-2.5 text-left font-medium">Reason</th>
              <th className="px-4 py-2.5 text-left font-medium">Status</th>
              <th className="px-4 py-2.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="mono max-w-44 truncate px-4 py-2.5">{row.id}</td>
                <td className="mono max-w-44 truncate px-4 py-2.5">{row.order_id}</td>
                <td className="px-4 py-2.5">{row.reason}</td>
                <td className="px-4 py-2.5">{row.status}</td>
                <td className="space-y-2 px-4 py-2.5 text-right">
                  <Input
                    className="ml-auto h-8 max-w-72"
                    value={reasons[row.id] ?? ""}
                    onChange={(event) =>
                      setReasons((current) => ({ ...current, [row.id]: event.target.value }))
                    }
                    placeholder="Admin reason"
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={working === row.id}
                      onClick={() => void action(row.id, "request_evidence")}
                    >
                      <ShieldAlert className="mr-1 h-3.5 w-3.5" />
                      Evidence
                    </Button>
                    <Button
                      size="sm"
                      disabled={working === row.id}
                      onClick={() => void action(row.id, "release")}
                    >
                      <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                      Release
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={working === row.id}
                      onClick={() => void action(row.id, "refund")}
                    >
                      <RotateCcw className="mr-1 h-3.5 w-3.5" />
                      Refund
                    </Button>
                    {working === row.id && <Loader2 className="h-4 w-4 animate-spin" />}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
