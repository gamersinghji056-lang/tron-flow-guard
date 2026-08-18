import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SectionHeader } from "@/components/stat-card";

export interface AdminColumn {
  key: string;
  label: string;
}

interface LooseQuery {
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

export function AdminTablePage({
  title,
  description,
  table,
  columns,
  orderBy = "created_at",
}: {
  title: string;
  description: string;
  table: string;
  columns: AdminColumn[];
  orderBy?: string;
}) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const columnList = useMemo(() => columns.map((column) => column.key).join(", "), [columns]);

  const load = useCallback(async () => {
    setLoading(true);
    const query = supabase.from(table as never) as unknown as LooseQuery;
    const { data, error } = await query
      .select(columnList)
      .order(orderBy, { ascending: false })
      .limit(100);
    if (error) toast.error(error.message);
    setRows((data ?? []) as Record<string, unknown>[]);
    setLoading(false);
  }, [columnList, orderBy, table]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <SectionHeader title={title} description={description} />
      <div className="panel overflow-x-auto">
        {loading ? (
          <div className="grid h-40 place-items-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs tracking-wide text-muted-foreground uppercase">
              <tr>
                {columns.map((column) => (
                  <th key={column.key} className="px-4 py-2.5 text-left font-medium">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="px-4 py-10 text-center text-muted-foreground"
                  >
                    No records found.
                  </td>
                </tr>
              ) : (
                rows.map((row, index) => (
                  <tr key={String(row["id"] ?? index)} className="hover:bg-secondary/30">
                    {columns.map((column) => (
                      <td key={column.key} className="max-w-80 truncate px-4 py-2.5">
                        {formatValue(row[column.key])}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? value.toLocaleString()
      : value.toLocaleString(undefined, { maximumFractionDigits: 6 });
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return new Date(value).toLocaleString();
  }
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
