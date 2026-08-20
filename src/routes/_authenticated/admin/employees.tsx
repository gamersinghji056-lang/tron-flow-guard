import { useCallback, useEffect, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  createEmployeeAccount,
  listEmployees,
  updateEmployeePermissions,
} from "@/lib/employee.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "@/components/stat-card";

export const Route = createFileRoute("/_authenticated/admin/employees")({
  component: AdminEmployeesPage,
});

const PERMISSIONS = [
  "users.read",
  "users.manage",
  "p2p.read",
  "p2p.manage",
  "disputes.manage",
  "direct_sell.manage",
  "vendors.review",
  "deposits.manage",
  "wallets.manage",
  "ledger.read",
  "system_health.read",
  "settings.manage",
  "employees.manage",
];

interface EmployeeRow {
  id: string;
  email?: string | null;
  full_name?: string | null;
  permissions: string[];
}

function AdminEmployeesPage() {
  const createEmployee = useServerFn(createEmployeeAccount);
  const fetchEmployees = useServerFn(listEmployees);
  const updatePerms = useServerFn(updateEmployeePermissions);
  const [rows, setRows] = useState<EmployeeRow[]>([]);
  const [pending, setPending] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    permissions: [] as string[],
  });

  const load = useCallback(async () => {
    try {
      setRows(((await fetchEmployees()) ?? []) as unknown as EmployeeRow[]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load employees");
    }
  }, [fetchEmployees]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      await createEmployee({ data: form });
      setForm({ name: "", email: "", password: "", permissions: [] });
      toast.success("Employee created");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create employee");
    } finally {
      setPending(false);
    }
  }

  async function toggle(row: EmployeeRow, permission: string) {
    const permissions = row.permissions.includes(permission)
      ? row.permissions.filter((item) => item !== permission)
      : [...row.permissions, permission];
    try {
      await updatePerms({ data: { userId: row.id, permissions } });
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update permissions");
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Employees"
        description="Operator accounts for the Admin Operations Panel with explicit permissions."
      />
      <form className="panel space-y-4 p-5" onSubmit={submit}>
        <div className="grid gap-3 md:grid-cols-3">
          <Input
            placeholder="Name"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
          <Input
            placeholder="Email"
            type="email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
          />
          <Input
            placeholder="Password"
            type="password"
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
          />
        </div>
        <PermissionPicker
          selected={form.permissions}
          onToggle={(permission) =>
            setForm((current) => ({
              ...current,
              permissions: current.permissions.includes(permission)
                ? current.permissions.filter((item) => item !== permission)
                : [...current.permissions, permission],
            }))
          }
        />
        <Button disabled={pending}>
          {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Create Employee
        </Button>
      </form>

      <div className="grid gap-4">
        {rows.map((row) => (
          <div key={row.id} className="panel p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">{row.full_name ?? row.email}</h2>
                <p className="text-sm text-muted-foreground">{row.email}</p>
              </div>
              <span className="rounded-full bg-secondary px-3 py-1 text-xs">employee</span>
            </div>
            <PermissionPicker
              selected={row.permissions}
              onToggle={(permission) => void toggle(row, permission)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function PermissionPicker({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (permission: string) => void;
}) {
  return (
    <div className="grid gap-2 md:grid-cols-3 lg:grid-cols-4">
      {PERMISSIONS.map((permission) => (
        <label key={permission} className="flex items-center gap-2 rounded-md border p-2 text-sm">
          <input
            type="checkbox"
            checked={selected.includes(permission)}
            onChange={() => onToggle(permission)}
          />
          {permission}
        </label>
      ))}
    </div>
  );
}
