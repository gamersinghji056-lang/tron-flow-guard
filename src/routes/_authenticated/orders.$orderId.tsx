import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, Loader2, Send, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import {
  cancelP2pOrder,
  confirmP2pPaymentReceived,
  createP2pAttachmentUpload,
  getP2pAttachmentViewUrl,
  markP2pPaymentSent,
  raiseP2pDispute,
  registerP2pAttachment,
  sendP2pMessage,
} from "@/lib/p2p.functions";
import {
  createPaymentProofUpload,
  getPaymentProofViewUrl,
  registerPaymentProof,
} from "@/lib/proofs.functions";
import { formatUsdt } from "@/lib/chain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SectionHeader } from "@/components/stat-card";

export const Route = createFileRoute("/_authenticated/orders/$orderId")({
  component: P2pOrderDetailPage,
});

interface OrderRow {
  id: string;
  order_ref: string;
  buyer_user_id: string | null;
  seller_id: string;
  side: string;
  status: string;
  usdt_amount: number;
  price_inr: number;
  total_inr: number;
  payment_method: string;
  payout_upi_id: string | null;
  payout_holder_name: string | null;
  utr_reference: string | null;
  paid_amount_inr: number | null;
  payment_proof_path: string | null;
  escrow_locked: boolean;
  escrow_settled: boolean;
  payment_deadline: string | null;
  confirm_deadline: string | null;
  created_at: string;
}

interface EventRow {
  id: string;
  from_status: string | null;
  to_status: string | null;
  note: string | null;
  created_at: string;
}

interface MessageRow {
  id: string;
  sender_role: string;
  body: string;
  is_system: boolean;
  created_at: string;
}

interface AttachmentRow {
  id: string;
  message_id: string;
  attachment_type: string;
  mime_type: string;
  created_at: string;
}

function P2pOrderDetailPage() {
  const { orderId } = Route.useParams() as { orderId: string };
  const auth = useAuth();
  const markPaid = useServerFn(markP2pPaymentSent);
  const confirmPayment = useServerFn(confirmP2pPaymentReceived);
  const cancelOrder = useServerFn(cancelP2pOrder);
  const disputeOrder = useServerFn(raiseP2pDispute);
  const sendMessage = useServerFn(sendP2pMessage);
  const createAttachmentUpload = useServerFn(createP2pAttachmentUpload);
  const registerAttachment = useServerFn(registerP2pAttachment);
  const viewAttachmentUrl = useServerFn(getP2pAttachmentViewUrl);
  const createProofUpload = useServerFn(createPaymentProofUpload);
  const registerProof = useServerFn(registerPaymentProof);
  const getProofView = useServerFn(getPaymentProofViewUrl);
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
  const [utr, setUtr] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [chat, setChat] = useState("");
  const [chatProofFile, setChatProofFile] = useState<File | null>(null);
  const [disputeReason, setDisputeReason] = useState("");
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    const [
      { data: orderRow },
      { data: eventRows },
      { data: messageRows },
      { data: attachmentRows },
    ] = await Promise.all([
      supabase.from("p2p_orders").select("*").eq("id", orderId).maybeSingle(),
      supabase
        .from("p2p_order_events")
        .select("id, from_status, to_status, note, created_at")
        .eq("order_id", orderId)
        .order("created_at", { ascending: true }),
      supabase
        .from("p2p_messages")
        .select("id, sender_role, body, is_system, created_at")
        .eq("order_id", orderId)
        .order("created_at", { ascending: true }),
      supabase
        .from("p2p_message_attachments" as never)
        .select("id, message_id, attachment_type, mime_type, created_at")
        .eq("order_id", orderId as never)
        .order("created_at", { ascending: true }),
    ]);
    setOrder(orderRow as unknown as OrderRow | null);
    setEvents((eventRows ?? []) as EventRow[]);
    setMessages((messageRows ?? []) as MessageRow[]);
    setAttachments((attachmentRows ?? []) as unknown as AttachmentRow[]);
  }, [orderId]);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel(`p2p-order-${orderId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "p2p_orders", filter: `id=eq.${orderId}` },
        () => void load(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "p2p_order_events",
          filter: `order_id=eq.${orderId}`,
        },
        () => void load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "p2p_messages", filter: `order_id=eq.${orderId}` },
        () => void load(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "p2p_message_attachments",
          filter: `order_id=eq.${orderId}`,
        },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load, orderId]);

  const role = useMemo(() => {
    if (!order || !auth.user) return null;
    if (order.buyer_user_id === auth.user.id) return "buyer";
    if (order.seller_id === auth.user.id) return "seller";
    return auth.isAdmin ? "admin" : null;
  }, [auth.isAdmin, auth.user, order]);

  async function run(action: () => Promise<unknown>, success: string) {
    setWorking(true);
    try {
      await action();
      await load();
      toast.success(success);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed");
    } finally {
      setWorking(false);
    }
  }

  async function uploadProof(): Promise<string> {
    if (!proofFile) throw new Error("Upload a payment proof before marking payment sent");
    const upload = await createProofUpload({
      data: {
        orderType: "p2p",
        orderId,
        fileName: proofFile.name,
        contentType: proofFile.type || "application/octet-stream",
        sizeBytes: proofFile.size,
      },
    });
    const { error } = await supabase.storage
      .from("payment-proofs")
      .uploadToSignedUrl(upload.path, upload.token, proofFile);
    if (error) throw new Error(error.message);
    await registerProof({
      data: {
        orderType: "p2p",
        orderId,
        storagePath: upload.path,
        fileName: proofFile.name,
        contentType: proofFile.type || "application/octet-stream",
        sizeBytes: proofFile.size,
      },
    });
    return upload.path;
  }

  async function viewProof(path: string) {
    try {
      const { url } = await getProofView({ data: { proofPath: path } });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to open payment proof");
    }
  }

  async function viewAttachment(attachmentId: string) {
    try {
      const { url } = (await viewAttachmentUrl({ data: { attachmentId } })) as { url: string };
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to open attachment");
    }
  }

  async function sendChatMessage() {
    const body = chat.trim() || (chatProofFile ? "Uploaded payment evidence." : "");
    const sent = (await sendMessage({ data: { orderId, body } })) as { messageId?: string };
    if (chatProofFile) {
      const upload = await createAttachmentUpload({
        data: {
          orderId,
          fileName: chatProofFile.name,
          contentType: chatProofFile.type as "image/jpeg" | "image/png" | "image/webp",
          sizeBytes: chatProofFile.size,
        },
      });
      const { error } = await supabase.storage
        .from("p2p-evidence")
        .uploadToSignedUrl(upload.path, upload.token, chatProofFile);
      if (error) throw new Error(error.message);
      await registerAttachment({
        data: {
          orderId,
          messageId: String(sent.messageId),
          storagePath: upload.path,
          fileName: chatProofFile.name,
          contentType: chatProofFile.type as "image/jpeg" | "image/png" | "image/webp",
          sizeBytes: chatProofFile.size,
          attachmentType: "payment_proof",
        },
      });
    }
    setChat("");
    setChatProofFile(null);
  }

  if (!order) {
    return (
      <div className="grid h-72 place-items-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const canBuyerMarkPaid = role === "buyer" && order.status === "payment_pending";
  const canSellerRelease =
    role === "seller" &&
    ["payment_sent", "payment_submitted", "payment_received"].includes(order.status);
  const canCancel = ["created", "escrow_locked", "payment_pending"].includes(order.status);
  const canDispute = !["completed", "cancelled", "expired"].includes(order.status);

  return (
    <div className="space-y-6">
      <SectionHeader
        title={order.order_ref}
        description="P2P order detail, escrow state, payment status, timeline and chat."
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_24rem]">
        <div className="panel p-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Metric label="Side" value={order.side.toUpperCase()} />
            <Metric label="USDT" value={`${formatUsdt(Number(order.usdt_amount))} USDT`} />
            <Metric
              label="INR total"
              value={`Rs ${Number(order.total_inr).toLocaleString("en-IN")}`}
            />
            <Metric label="Rate" value={`Rs ${Number(order.price_inr).toLocaleString("en-IN")}`} />
            <Metric label="Status" value={order.status.replaceAll("_", " ").toUpperCase()} />
            <Metric
              label="Escrow"
              value={order.escrow_settled ? "SETTLED" : order.escrow_locked ? "LOCKED" : "OPEN"}
            />
          </div>
          <div className="mt-5 rounded-md border p-4 text-sm">
            <p className="font-medium">Payment instructions</p>
            <p className="mt-2 rounded-md border border-amber-400/40 bg-amber-500/10 p-2 text-amber-700 dark:text-amber-200">
              Use only the payment account shown in this order. Third-party payments may increase
              fraud or dispute risk.
            </p>
            <p className="mt-2 text-muted-foreground">
              Pay using {order.payment_method.toUpperCase()} to{" "}
              {order.payout_holder_name ?? "counterparty"} at{" "}
              <span className="mono text-foreground">{order.payout_upi_id ?? "-"}</span>.
            </p>
            <p className="mt-1 text-muted-foreground">
              Deadline:{" "}
              {order.payment_deadline ? new Date(order.payment_deadline).toLocaleString() : "-"}
            </p>
            {order.utr_reference && <p className="mono mt-2">UTR: {order.utr_reference}</p>}
            {order.payment_proof_path && (
              <Button
                className="mt-3"
                size="sm"
                variant="secondary"
                onClick={() => void viewProof(order.payment_proof_path as string)}
              >
                View proof
              </Button>
            )}
          </div>
        </div>

        <div className="panel space-y-3 p-5">
          <p className="text-sm font-semibold">Actions</p>
          {canBuyerMarkPaid && (
            <div className="space-y-2">
              <Input
                value={utr}
                onChange={(event) => setUtr(event.target.value)}
                placeholder="Payment reference / UTR"
              />
              <Input
                value={paidAmount}
                onChange={(event) => setPaidAmount(event.target.value)}
                placeholder="Paid INR amount"
                inputMode="decimal"
              />
              <Input
                type="file"
                accept="image/*,.pdf"
                onChange={(event) => setProofFile(event.target.files?.[0] ?? null)}
              />
              <Button
                className="w-full"
                disabled={working}
                onClick={() =>
                  void run(async () => {
                    const proofPath = await uploadProof();
                    await markPaid({
                      data: { orderId, utr, amountInr: Number(paidAmount), proofPath },
                    });
                  }, "Payment marked sent")
                }
              >
                <CheckCircle2 className="mr-1.5 h-4 w-4" />I have paid
              </Button>
            </div>
          )}
          {canSellerRelease && (
            <Button
              className="w-full"
              disabled={working}
              onClick={() =>
                void run(() => confirmPayment({ data: { orderId } }), "Escrow released")
              }
            >
              <CheckCircle2 className="mr-1.5 h-4 w-4" />
              Payment received / release USDT
            </Button>
          )}
          {canCancel && (
            <Button
              variant="secondary"
              className="w-full"
              disabled={working}
              onClick={() =>
                void run(
                  () => cancelOrder({ data: { orderId, reason: "Cancelled by participant" } }),
                  "Order cancelled",
                )
              }
            >
              <XCircle className="mr-1.5 h-4 w-4" />
              Cancel order
            </Button>
          )}
          {canDispute && (
            <div className="space-y-2">
              <Input
                value={disputeReason}
                onChange={(event) => setDisputeReason(event.target.value)}
                placeholder="Dispute reason"
              />
              <Button
                variant="secondary"
                className="w-full"
                disabled={working}
                onClick={() =>
                  void run(
                    () => disputeOrder({ data: { orderId, reason: disputeReason } }),
                    "Dispute opened",
                  )
                }
              >
                <AlertTriangle className="mr-1.5 h-4 w-4" />
                Raise dispute
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="panel p-5">
          <p className="mb-3 text-sm font-semibold">Timeline</p>
          <div className="space-y-3">
            {events.map((event) => (
              <div key={event.id} className="border-l border-primary/50 pl-3 text-sm">
                <p className="font-medium">{event.to_status?.replaceAll("_", " ") ?? "event"}</p>
                <p className="text-muted-foreground">{event.note ?? "-"}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(event.created_at).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </div>
        <div className="panel p-5">
          <p className="mb-3 text-sm font-semibold">Chat</p>
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {messages.map((message) => (
              <div
                key={message.id}
                className={
                  message.is_system
                    ? "rounded-md bg-secondary p-2 text-sm"
                    : "rounded-md border p-2 text-sm"
                }
              >
                <p>{message.body}</p>
                {attachments
                  .filter((attachment) => attachment.message_id === message.id)
                  .map((attachment) => (
                    <Button
                      key={attachment.id}
                      className="mt-2"
                      size="sm"
                      variant="secondary"
                      onClick={() => void viewAttachment(attachment.id)}
                    >
                      View {attachment.attachment_type.replaceAll("_", " ")}
                    </Button>
                  ))}
                <p className="mt-1 text-xs text-muted-foreground">
                  {message.sender_role} - {new Date(message.created_at).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-3 space-y-2">
            <Textarea
              value={chat}
              onChange={(event) => setChat(event.target.value)}
              placeholder="Write a message"
            />
            <Input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => setChatProofFile(event.target.files?.[0] ?? null)}
            />
            <p className="text-xs text-muted-foreground">
              Image proof is evidence only. It does not automatically confirm payment or release
              escrow.
            </p>
            <Button
              disabled={working || (!chat.trim() && !chatProofFile)}
              onClick={() => void run(sendChatMessage, "Message sent")}
            >
              <Send className="mr-1.5 h-4 w-4" />
              Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mono mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}
