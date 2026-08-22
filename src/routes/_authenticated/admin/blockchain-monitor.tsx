import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/blockchain-monitor")({
  component: () => (
    <div className="panel p-6">
      <h1 className="text-xl font-semibold">Blockchain Monitor</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Blockchain status and listener errors now live in System Health with stage, cursor,
        transfer, credit and retry detail.
      </p>
      <Button asChild className="mt-4">
        <Link to="/admin/system-health">Open System Health</Link>
      </Button>
    </div>
  ),
});
