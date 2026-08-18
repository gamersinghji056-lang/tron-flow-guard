import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { createAdminApiKey, revokeAdminApiKey } from "@/lib/api-management.functions";
import { API_SCOPES, type ApiScope } from "@/lib/api-scopes";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "@/components/stat-card";

export const Route = createFileRoute("/_authenticated/admin/api-management")({
  component: ApiManagementPage,
});

interface ApiKeyRow {
  id: string;
  key_id: string;
  name: string;
  permissions: string[];
  status: string;
  request_count: number;
  last_used_at: string | null;
  created_at: string;
}

function ApiManagementPage() {
  const createKey = useServerFn(createAdminApiKey);
  const revokeKey = useServerFn(revokeAdminApiKey);
  const [rows, setRows] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<ApiScope[]>(["deposit:create", "deposit:read"]);
  const [oneTimeKey, setOneTimeKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("api_keys")
      .select("id, key_id, name, permissions, status, request_count, last_used_at, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) toast.error(error.message);
    setRows((data ?? []) as unknown as ApiKeyRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await createKey({ data: { name, scopes } });
      setOneTimeKey(result.key);
      setName("");
      await load();
      toast.success("API key created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create API key");
    } finally {
      setSubmitting(false);
    }
  }

  async function revoke(id: string) {
    try {
      await revokeKey({ data: { id } });
      await load();
      toast.success("API key revoked");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not revoke API key");
    }
  }

  function toggleScope(scope: ApiScope) {
    setScopes((current) =>
      current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope],
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="API Management"
        description="Create scoped integration keys. Plaintext secrets are shown once."
      />

      <form className="panel space-y-4 p-5" onSubmit={submit}>
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Key name"
          />
          <Button disabled={submitting || scopes.length === 0}>
            {submitting ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <KeyRound className="mr-1.5 h-4 w-4" />
            )}
            Create key
          </Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {API_SCOPES.map((scope) => (
            <label
              key={scope}
              className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
            >
              <Checkbox
                checked={scopes.includes(scope)}
                onCheckedChange={() => toggleScope(scope)}
              />
              <span className="mono">{scope}</span>
            </label>
          ))}
        </div>
        {oneTimeKey && (
          <div className="rounded-md border border-primary/40 bg-primary/10 p-3">
            <p className="text-xs text-muted-foreground">One-time secret</p>
            <p className="mono mt-1 break-all text-sm">{oneTimeKey}</p>
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
                <th className="px-4 py-2.5 text-left font-medium">Key ID</th>
                <th className="px-4 py-2.5 text-left font-medium">Name</th>
                <th className="px-4 py-2.5 text-left font-medium">Scopes</th>
                <th className="px-4 py-2.5 text-left font-medium">Status</th>
                <th className="px-4 py-2.5 text-left font-medium">Requests</th>
                <th className="px-4 py-2.5 text-left font-medium">Last used</th>
                <th className="px-4 py-2.5 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="mono px-4 py-2.5">{row.key_id}</td>
                  <td className="px-4 py-2.5">{row.name}</td>
                  <td className="mono max-w-96 px-4 py-2.5 text-xs">
                    {row.permissions?.join(", ")}
                  </td>
                  <td className="px-4 py-2.5">{row.status}</td>
                  <td className="px-4 py-2.5">{row.request_count ?? 0}</td>
                  <td className="px-4 py-2.5">
                    {row.last_used_at ? new Date(row.last_used_at).toLocaleString() : "-"}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={row.status === "revoked"}
                      onClick={() => void revoke(row.id)}
                    >
                      <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                      Revoke
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
