import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WtronMark } from "@/components/mini-app/crypto-icons";
import type { VendorApprovalStatus } from "@/lib/role-auth-policy";

export default function PendingVendorScreen({
  status,
  busy,
  onRefresh,
}: {
  status: VendorApprovalStatus;
  busy: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="grid min-h-[80vh] place-items-center pb-10 text-center">
      <div className="w-full rounded-3xl border border-white/10 bg-white/6 p-6">
        <WtronMark className="mx-auto h-14 w-14" />
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
          Vendor application
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-normal">
          {status === "rejected"
            ? "Application Rejected"
            : status === "disabled" || status === "suspended"
              ? "Vendor Access Disabled"
              : "Pending Review"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Vendor financial tools remain blocked until WTRON approves the application. You can
          refresh this status after admin review.
        </p>
        <Button className="mt-6 w-full bg-red-500 text-white hover:bg-red-400" onClick={onRefresh}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Refresh Status
        </Button>
      </div>
    </div>
  );
}
