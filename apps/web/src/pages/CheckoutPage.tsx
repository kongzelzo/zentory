import { useQuery } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { ArrowLeft, CheckCircle2, CreditCard, QrCode, ShieldCheck } from "lucide-react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { api, post } from "../lib/api";
import { baht, thaiDate } from "../lib/format";
import { useAuth } from "../state/auth";

type PlanCode = "starter" | "professional" | "multi_branch";
export type CheckoutMode = "subscription" | "promptpay";
type AccountPayment = {
  reference: string;
  amount: number;
  currency: string;
  status: string;
  checkoutUrl?: string | null;
};
type CheckoutConfirmation = {
  sessionId: string;
  reference?: string;
};
type CheckoutBusiness = {
  subscription?: {
    status?: string;
    paymentMode?: "FREE" | "STRIPE_SUBSCRIPTION" | "PROMPTPAY_ONE_TIME";
    expiresAt?: string | null;
    currentPeriodEnd?: string | null;
    plan?: { code?: string; name: string };
  } | null;
};
export const checkoutPlans: Record<PlanCode, {
  name: string;
  subtitle: string;
  monthlyPrice: number;
  yearlyPrice: number;
  features: string[];
}> = {
  starter: {
    name: "Starter",
    subtitle: "ร้านเล็กที่เริ่มใช้จริง",
    monthlyPrice: 399,
    yearlyPrice: 3990,
    features: ["สินค้า 200 รายการ", "ผู้ใช้ 2 คน", "1 สาขา", "1 คลัง", "POS และ Stock Count พื้นฐาน"]
  },
  professional: {
    name: "Professional",
    subtitle: "ร้านเดียวที่บริหารจริงจัง",
    monthlyPrice: 899,
    yearlyPrice: 8990,
    features: ["สินค้า 1,500 รายการ", "ผู้ใช้ 6 คน", "1 สาขา", "2 คลัง", "รายงานเต็มและ approval"]
  },
  multi_branch: {
    name: "Multi-Branch",
    subtitle: "ร้านที่เริ่มขยายหลายสาขา",
    monthlyPrice: 1790,
    yearlyPrice: 17900,
    features: ["สินค้า 3,000 รายการ", "ผู้ใช้ 12 คน", "2 สาขา", "4 คลัง", "โอนสินค้าและรายงานแยกสาขา"]
  }
};

export function planFromParam(value: string | null): PlanCode {
  const normalized = value?.trim().toLowerCase().replace(/-/g, "_");
  if (normalized === "free") return "starter";
  if (normalized === "pro") return "professional";
  if (normalized === "premium") return "multi_branch";
  if (normalized === "starter" || normalized === "professional" || normalized === "multi_branch") return normalized;
  return "professional";
}

function apiPlanCode(planCode: PlanCode) {
  return planCode.toUpperCase();
}

export function checkoutModeFromParam(value: string | null): CheckoutMode {
  return value === "promptpay" ? "promptpay" : "subscription";
}

export function checkoutProviderForMode(mode: CheckoutMode) {
  return mode === "promptpay" ? "stripe_promptpay" : "stripe";
}

export function checkoutSubmitLabel(mode: CheckoutMode) {
  return mode === "promptpay" ? "ไปจ่ายด้วย PromptPay" : "สมัครแบบตัดบัตรอัตโนมัติ";
}

export function checkoutSummaryLabel(mode: CheckoutMode) {
  return mode === "promptpay" ? "จ่าย PromptPay ใช้งาน 30 วัน" : "ชำระรายเดือนอัตโนมัติ";
}

export function checkoutConfirmationPayload(paymentStatus: string | null, sessionId: string | null, reference: string | null): CheckoutConfirmation | undefined {
  const normalizedSessionId = sessionId?.trim();
  if (paymentStatus !== "success" || !normalizedSessionId) return undefined;
  return {
    sessionId: normalizedSessionId,
    ...(reference?.trim() ? { reference: reference.trim() } : {})
  };
}

export function CheckoutPage() {
  const [searchParams] = useSearchParams();
  const initialPlan = planFromParam(searchParams.get("plan"));
  const initialCheckoutMode = checkoutModeFromParam(searchParams.get("mode"));
  const paymentStatus = searchParams.get("payment");
  const returnedReference = searchParams.get("reference");
  const returnedSessionId = searchParams.get("session_id");
  const planCode = initialPlan;
  const billingCycle = "monthly";
  const [checkoutMode, setCheckoutMode] = useState<CheckoutMode>(initialCheckoutMode);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submittedReference, setSubmittedReference] = useState("");
  const session = useAuth((state) => state.session);
  const business = useQuery({
    queryKey: ["business-current", "checkout"],
    queryFn: () => api<CheckoutBusiness>("/businesses/current"),
    enabled: Boolean(session?.business)
  });
  const plan = checkoutPlans[planCode];
  const amount = plan.monthlyPrice;
  const currentSubscription = business.data?.subscription;
  const currentPeriodEnd = currentSubscription?.currentPeriodEnd ?? currentSubscription?.expiresAt;
  const currentPlanCode = (currentSubscription?.plan?.code ?? currentSubscription?.plan?.name ?? "").toLowerCase();
  const isPromptPayToSubscription = checkoutMode === "subscription" && currentSubscription?.status === "ACTIVE" && currentSubscription.paymentMode === "PROMPTPAY_ONE_TIME" && currentPlanCode === planCode && Boolean(currentPeriodEnd);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError("");

    if (!session) {
      setSubmitError("กรุณาสร้างบัญชีหรือเข้าสู่ระบบก่อนชำระเงิน เพื่อให้แพ็กเกจผูกกับบัญชีได้ถูกต้อง");
      return;
    }

    setIsSubmitting(true);
    try {
      const payment = await post<AccountPayment>("/payments/checkout", {
        planCode: apiPlanCode(planCode),
        billingCycle,
        checkoutMode,
        provider: checkoutProviderForMode(checkoutMode),
        metadata: {
          accountName: session.user.name,
          storeName: session.business?.name ?? "",
          email: session.user.email
        }
      });
      if (payment.checkoutUrl) {
        window.location.assign(payment.checkoutUrl);
        return;
      }
      setSubmittedReference(payment.reference);
      setIsSubmitted(true);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "สร้างรายการชำระเงินไม่สำเร็จ");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (paymentStatus === "success") {
    const successParams = new URLSearchParams({
      plan: planCode,
      method: checkoutMode
    });
    if (returnedReference) successParams.set("reference", returnedReference);
    if (returnedSessionId) successParams.set("session_id", returnedSessionId);
    return <Navigate to={`/checkout/success?${successParams.toString()}`} replace />;
  }

  if (isSubmitted) {
    return (
      <main className="mx-auto grid min-h-[72vh] max-w-3xl place-items-center px-5 py-12">
        <Card className="w-full p-7 text-center shadow-soft">
          <div className="mx-auto grid size-16 place-items-center rounded-lg bg-teal-50 text-leaf">
            <CheckCircle2 size={34} />
          </div>
          <p className="mt-5 text-sm font-black uppercase tracking-[0.18em] text-leaf">Payment Request</p>
          <h1 className="mt-2 text-3xl font-black text-ink">สร้างรายการชำระเงินแล้ว</h1>
          <p className="mx-auto mt-3 max-w-xl leading-7 text-stone-600">
            เลขอ้างอิง {submittedReference || "-"} ระบบจะรอการยืนยันเงินเข้า และอัปเดตแพ็กเกจให้บัญชีของคุณอัตโนมัติหลังรายการชำระเงินสำเร็จ
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link to="/pricing">
              <Button type="button" variant="secondary" icon={<ArrowLeft size={16} />}>กลับหน้าราคา</Button>
            </Link>
            <Link to={session ? "/app/profile/billing" : "/register"}>
              <Button type="button">{session ? "ไปหน้าจัดการแพ็กเกจ" : "สร้างบัญชี"}</Button>
            </Link>
          </div>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-5 py-10 md:py-14">
      <Link to="/pricing" className="inline-flex items-center gap-2 text-sm font-semibold text-moss transition hover:text-leaf">
        <ArrowLeft size={16} />
        กลับหน้าราคา
      </Link>

      <div className="mt-7 grid gap-5 lg:grid-cols-[minmax(0,1fr)_430px] lg:items-start">
        <section>
          <div className="max-w-3xl">
            <p className="text-sm font-black uppercase tracking-[0.2em] text-leaf">Checkout</p>
            <h1 className="mt-3 text-3xl font-black leading-tight text-ink md:text-5xl">ชำระเงินแพ็กเกจ Zentory</h1>
            <p className="mt-4 leading-7 text-stone-600">แพ็กเกจเป็นสิทธิ์ที่ติดกับบัญชี เลือกได้ว่าจะสมัครแบบตัดบัตรอัตโนมัติหรือจ่ายรอบนี้ด้วย PromptPay QR</p>
          </div>

          {paymentStatus === "cancelled" ? (
            <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-900">
              ยกเลิกการชำระเงินแล้ว คุณสามารถลองชำระใหม่ได้จากหน้านี้
            </div>
          ) : null}
          <form className="mt-8 grid gap-5" onSubmit={submit}>
            <Card className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2 text-2xl font-black text-ink"><CreditCard size={24} />รายละเอียดการชำระเงิน</h2>
                  <p className="mt-1 text-sm font-semibold text-stone-600">รายการนี้จะสร้างเลขอ้างอิงจริงเมื่อกดไปชำระเงิน</p>
                </div>
                <span className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-black text-stone-700">รายเดือน</span>
              </div>

              {(
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  <button
                    type="button"
                    className={`rounded-lg border p-4 text-left transition ${checkoutMode === "subscription" ? "border-leaf bg-teal-50 ring-2 ring-teal-100" : "border-stone-200 bg-white hover:border-teal-200"}`}
                    onClick={() => setCheckoutMode("subscription")}
                  >
	                    <span className="flex items-center gap-2 text-base font-black text-ink"><CreditCard size={18} />บัตร / รายเดือนอัตโนมัติ</span>
	                    <span className="mt-2 block text-sm font-semibold leading-6 text-stone-600">
	                      {isPromptPayToSubscription ? `ตั้งค่าบัตรไว้ก่อน แล้วเริ่มตัดหลัง ${thaiDate(currentPeriodEnd!)}` : "เหมาะกับสมาชิกต่อเนื่อง Stripe จะจัดการรอบบิลให้"}
	                    </span>
                  </button>
                  <button
                    type="button"
                    className={`rounded-lg border p-4 text-left transition ${checkoutMode === "promptpay" ? "border-leaf bg-teal-50 ring-2 ring-teal-100" : "border-stone-200 bg-white hover:border-teal-200"}`}
                    onClick={() => setCheckoutMode("promptpay")}
                  >
                    <span className="flex items-center gap-2 text-base font-black text-ink"><QrCode size={18} />PromptPay QR</span>
                    <span className="mt-2 block text-sm font-semibold leading-6 text-stone-600">จ่ายรอบนี้ด้วยแอปธนาคาร แล้วเปิดแพ็กเกจหลัง Stripe ยืนยัน</span>
                  </button>
                </div>
              )}

              {(
                <div className="mt-5 grid gap-4 md:grid-cols-[220px_1fr]">
                  <div className="grid aspect-square place-items-center rounded-lg border border-teal-100 bg-teal-50 p-4 text-center">
                    {checkoutMode === "promptpay" ? <QrCode className="mx-auto text-leaf" size={64} /> : <ShieldCheck className="mx-auto text-leaf" size={64} />}
                    <p className="mt-3 text-sm font-black text-teal-900">{checkoutMode === "promptpay" ? "PromptPay QR" : "Stripe Checkout"}</p>
                    <p className="mt-1 text-xs font-semibold leading-5 text-teal-700">{checkoutMode === "promptpay" ? "สแกนจ่ายด้วยแอปธนาคารไทย" : "ชำระบนหน้าที่ Stripe ดูแลความปลอดภัย"}</p>
                  </div>
                  <div className="rounded-lg border border-stone-200 bg-stone-50 p-4">
	                    <p className="text-sm font-bold text-stone-500">{isPromptPayToSubscription ? "ยอดที่ตัดวันนี้" : "ยอดที่ต้องชำระ"}</p>
	                    <p className="mt-1 text-4xl font-black text-ink">{isPromptPayToSubscription ? "฿0" : baht(amount)}</p>
	                    {isPromptPayToSubscription ? <p className="mt-1 text-sm font-semibold text-teal-700">รอบแรก {baht(amount)} จะเริ่มหลัง {thaiDate(currentPeriodEnd!)}</p> : null}
                    <div className="mt-4 grid gap-2 text-sm">
                      <p className="flex justify-between gap-3"><span className="text-stone-500">ผู้ให้บริการ</span><b>Stripe</b></p>
                      <p className="flex justify-between gap-3"><span className="text-stone-500">ช่องทาง</span><b>{checkoutMode === "promptpay" ? "PromptPay QR" : "บัตร / Subscription"}</b></p>
                      <p className="flex justify-between gap-3"><span className="text-stone-500">บัญชีที่จะอัปเกรด</span><b className="min-w-0 truncate text-right">{session?.user.email ?? "ต้องเข้าสู่ระบบก่อน"}</b></p>
                    </div>
                  </div>
                </div>
              )}
            </Card>

            {submitError ? <p className="rounded-md bg-red-50 p-3 text-sm font-semibold text-red-700">{submitError}</p> : null}

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Link to="/pricing">
                <Button type="button" variant="secondary" className="w-full sm:w-auto">ยกเลิก</Button>
              </Link>
              <Button type="submit" className="w-full sm:w-auto" icon={<ShieldCheck size={18} />} disabled={isSubmitting}>
                {isSubmitting ? "กำลังพาไป Stripe..." : isPromptPayToSubscription ? "ตั้งค่าบัตรสำหรับรอบถัดไป" : checkoutSubmitLabel(checkoutMode)}
              </Button>
            </div>
          </form>
        </section>

        <aside className="lg:sticky lg:top-24">
          <Card className="p-5 shadow-soft">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-leaf">Order Summary</p>
            <div className="mt-4 border-b border-stone-200 pb-4">
              <h2 className="text-3xl font-black text-ink">{plan.name}</h2>
              <p className="mt-1 text-sm font-semibold text-stone-600">{plan.subtitle}</p>
            </div>
            <ul className="mt-4 space-y-3 text-sm font-semibold text-stone-700">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="shrink-0 text-leaf" />
                  {feature}
                </li>
              ))}
            </ul>
            <div className="mt-5 rounded-lg bg-ink p-5 text-white">
              <p className="text-sm font-semibold text-white/70">ยอดรวม</p>
	            <p className="mt-1 text-4xl font-black">{isPromptPayToSubscription ? "฿0 วันนี้" : baht(amount)}</p>
	            <p className="mt-1 text-sm font-semibold text-white/70">{isPromptPayToSubscription ? `เริ่มตัดรายเดือนหลัง ${thaiDate(currentPeriodEnd!)}` : checkoutSummaryLabel(checkoutMode)}</p>
            </div>
            <p className="mt-4 text-sm leading-6 text-stone-500">
              หลังชำระเงินสำเร็จ Stripe จะส่ง webhook กลับมาเพื่อเปิดสิทธิ์แพ็กเกจให้บัญชี
            </p>
          </Card>
        </aside>
      </div>
    </main>
  );
}
