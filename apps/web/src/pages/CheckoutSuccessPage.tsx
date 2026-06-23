import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { CheckCircle2, CreditCard, Loader2, ShieldAlert } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { post } from "../lib/api";
import { useAuth } from "../state/auth";

type AccountPayment = {
  reference: string;
  status: string;
};

type CheckoutSuccessConfirmation = {
  sessionId: string;
  reference?: string;
};

export function checkoutSuccessConfirmationPayload(sessionId: string | null, reference: string | null): CheckoutSuccessConfirmation | undefined {
  const normalizedSessionId = sessionId?.trim();
  if (!normalizedSessionId) return undefined;
  return {
    sessionId: normalizedSessionId,
    ...(reference?.trim() ? { reference: reference.trim() } : {})
  };
}

export function checkoutSuccessReturnPath(isSignedIn: boolean) {
  return isSignedIn ? "/app/profile/billing" : "/login";
}

export function CheckoutSuccessPage() {
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const session = useAuth((state) => state.session);
  const returnedReference = searchParams.get("reference");
  const returnedSessionId = searchParams.get("session_id");
  const confirmationPayload = checkoutSuccessConfirmationPayload(returnedSessionId, returnedReference);
  const [confirmationState, setConfirmationState] = useState<"idle" | "confirming" | "confirmed" | "pending" | "failed">("idle");
  const [confirmationError, setConfirmationError] = useState("");

  useEffect(() => {
    if (!session || !confirmationPayload) return;
    let cancelled = false;
    setConfirmationState("confirming");
    setConfirmationError("");
    post<AccountPayment | { pending?: boolean }>("/payments/checkout/confirm", confirmationPayload)
      .then((payment) => {
        if (cancelled) return;
        setConfirmationState("pending" in payment && payment.pending ? "pending" : "confirmed");
        queryClient.invalidateQueries({ queryKey: ["business"] });
        queryClient.invalidateQueries({ queryKey: ["business-current"] });
        queryClient.invalidateQueries({ queryKey: ["business-current", "checkout"] });
        queryClient.invalidateQueries({ queryKey: ["business-current", "billing"] });
      })
      .catch((error) => {
        if (cancelled) return;
        setConfirmationState("failed");
        setConfirmationError(error instanceof Error ? error.message : "ยืนยันการชำระเงินไม่สำเร็จ");
      });
    return () => {
      cancelled = true;
    };
  }, [confirmationPayload?.reference, confirmationPayload?.sessionId, queryClient, session]);

  const isMissingSession = !confirmationPayload;
  const returnPath = checkoutSuccessReturnPath(Boolean(session));
  const stateText = isMissingSession
    ? "ไม่พบข้อมูล session สำหรับยืนยันกับ Stripe"
    : !session
      ? "กรุณาเข้าสู่ระบบเพื่อดูแพ็กเกจบัญชี"
      : confirmationState === "confirming"
        ? "กำลังยืนยันแพ็กเกจกับ Stripe..."
        : confirmationState === "pending"
          ? "Stripe รับรายการแล้ว ระบบจะเปิดสิทธิ์หลังธนาคารยืนยันยอด"
          : confirmationState === "failed"
            ? "ระบบยังยืนยันแพ็กเกจไม่ได้"
            : "อัปเดตแพ็กเกจให้บัญชีแล้ว";

  return (
    <main className="mx-auto grid min-h-[calc(100vh-72px)] max-w-4xl place-items-center px-5 py-12">
      <Card className="w-full overflow-hidden p-0 shadow-soft">
        <div className="grid gap-0 md:grid-cols-[1fr_280px]">
          <section className="p-7 text-center md:p-10">
            <div className="mx-auto grid size-20 place-items-center rounded-lg bg-teal-50 text-leaf">
              {confirmationState === "failed" || isMissingSession ? <ShieldAlert size={42} /> : confirmationState === "confirming" ? <Loader2 className="animate-spin" size={42} /> : <CheckCircle2 size={42} />}
            </div>
            <p className="mt-6 text-sm font-black uppercase tracking-[0.18em] text-leaf">Payment Success</p>
            <h1 className="mt-2 text-3xl font-black leading-tight text-ink md:text-5xl">ชำระเงินสำเร็จ</h1>
            <p className="mx-auto mt-4 max-w-xl text-base font-semibold leading-7 text-stone-600">
              {stateText}
            </p>
            {returnedReference ? (
              <p className="mx-auto mt-4 inline-flex max-w-full rounded-md border border-teal-100 bg-teal-50 px-3 py-2 text-sm font-black text-teal-900">
                เลขอ้างอิง {returnedReference}
              </p>
            ) : null}
            {confirmationState === "failed" && confirmationError ? (
              <p className="mx-auto mt-4 max-w-xl rounded-md bg-amber-50 p-3 text-sm font-semibold leading-6 text-amber-800">
                {confirmationError}
              </p>
            ) : null}
            <div className="mt-7">
              <Link to={returnPath}>
                <Button type="button" icon={<CreditCard size={18} />}>ตกลง</Button>
              </Link>
            </div>
          </section>
          <aside className="border-t border-stone-200 bg-ink p-7 text-white md:border-l md:border-t-0">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-white/70">Next</p>
            <h2 className="mt-3 text-2xl font-black">แพ็กเกจบัญชี</h2>
            <p className="mt-3 text-sm font-semibold leading-6 text-white/70">
              กดตกลงเพื่อกลับไปตรวจสอบแพ็กเกจ สถานะรอบบิล และช่องทางชำระเงินของบัญชีคุณ
            </p>
          </aside>
        </div>
      </Card>
    </main>
  );
}
