import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Send, Webhook } from "lucide-react";
import { toast } from "sonner";
import { createWebhookEndpoint, testWebhookEndpoint } from "@/lib/webhook-management.functions";
import { WEBHOOK_EVENTS, type WebhookEvent } from "@/lib/webhook-events";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "@/components/stat-card";

export const Route = createFileRoute("/_authenticated/admin/webhooks")({
  component: WebhooksPage,
});

interface EndpointRow {
  id: string;
  url: string;
  events: string[];
  status: string;
  failure_count: number;
  last_delivery_at: string | null;
  last_error: string | null;
}

function WebhooksPage() {
  const createEndpoint = useServerFn(createWebhookEndpoint);
  const testEndpoint = useServerFn(testWebhookEndpoint);
  const [rows, setRows] = useState<EndpointRow[]>([]);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<WebhookEvent[]>(["deposit.detected", "deposit.credited"]);
  const [secret, setSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("webhook_endpoints")
      .select("id, url, events, status, failure_count, last_delivery_at, last_error")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setRows((data ?? []) as unknown as EndpointRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await createEndpoint({ data: { url, events } });
      setSecret(result.secret);
      setUrl("");
      await load();
      toast.success("Webhook endpoint created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create webhook");
    } finally {
      setSubmitting(false);
    }
  }

  function toggleEvent(event: WebhookEvent) {
    setEvents((current) =>
      current.includes(event) ? current.filter((item) => item !== event) : [...current, event],
    );
  }

  async function sendTest(id: string) {
    try {
      const result = await testEndpoint({ data: { id } });
      await load();
      toast.success(`Webhook test queued (${result.processed} delivery attempt(s))`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not test webhook");
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Webhooks"
        description="Signed event delivery with retry records and operational test delivery."
      />
      <form className="panel space-y-4 p-5" onSubmit={submit}>
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <Input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com/webhooks/trondesk"
          />
          <Button disabled={submitting || events.length === 0}>
            {submitting ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Webhook className="mr-1.5 h-4 w-4" />
            )}
            Add endpoint
          </Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {WEBHOOK_EVENTS.map((event) => (
            <label
              key={event}
              className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
            >
              <Checkbox
                checked={events.includes(event)}
                onCheckedChange={() => toggleEvent(event)}
              />
              <span className="mono">{event}</span>
            </label>
          ))}
        </div>
        {secret && (
          <div className="rounded-md border border-primary/40 bg-primary/10 p-3">
            <p className="text-xs text-muted-foreground">Webhook secret shown once</p>
            <p className="mono mt-1 break-all text-sm">{secret}</p>
          </div>
        )}
      </form>

      <div className="panel overflow-x-auto">
        {loading ? (
          <div className="grid h-40 place-items-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs tracking-wide text-muted-foreground uppercase">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">URL</th>
                <th className="px-4 py-2.5 text-left font-medium">Events</th>
                <th className="px-4 py-2.5 text-left font-medium">Status</th>
                <th className="px-4 py-2.5 text-left font-medium">Failures</th>
                <th className="px-4 py-2.5 text-left font-medium">Last delivery</th>
                <th className="px-4 py-2.5 text-left font-medium">Last error</th>
                <th className="px-4 py-2.5 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="max-w-96 truncate px-4 py-2.5">{row.url}</td>
                  <td className="mono max-w-96 px-4 py-2.5 text-xs">{row.events.join(", ")}</td>
                  <td className="px-4 py-2.5">{row.status}</td>
                  <td className="px-4 py-2.5">{row.failure_count ?? 0}</td>
                  <td className="px-4 py-2.5">
                    {row.last_delivery_at ? new Date(row.last_delivery_at).toLocaleString() : "-"}
                  </td>
                  <td className="max-w-72 truncate px-4 py-2.5">{row.last_error ?? "-"}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Button variant="secondary" size="sm" onClick={() => void sendTest(row.id)}>
                      <Send className="mr-1.5 h-3.5 w-3.5" />
                      Test
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
