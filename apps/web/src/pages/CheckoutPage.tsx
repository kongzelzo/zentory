import { useQuery } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { ArrowLeft, CheckCircle2, CreditCard, QrCode, ShieldCheck, Sparkles } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { api, post } from "../lib/api";
import { baht, thaiDate } from "../lib/format";
import { useAuth } from "../state/auth";

type PlanCode = "free" | "pro" | "premium";
export type CheckoutMode = "subscription" | "promptpay";
type AccountPayment = {
  reference: string;
  amount: number;
  currency: string;
  status: string;
  checkoutUrl?: string | null;
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
const plans: Record<PlanCode, {
  name: string;
  subtitle: string;
  monthlyPrice: number | null;
  yearlyPrice?: number;
  features: string[];
}> = {
  free: {
    name: "Free",
    subtitle: "สำหรับทดลองใช้",
    monthlyPrice: 0,
    features: ["สินค้า 30 รายการ", "ผู้ใช้ 1 คน", "รายงานพื้นฐาน", "สาขาเดียว"]
  },
  pro: {
    name: "Pro",
    subtitle: "สำหรับบัญชีที่ใช้งานจริง",
    monthlyPrice: 590,
    yearlyPrice: 5900,
    features: ["สินค้า 1,000 รายการ", "ผู้ใช้ 5 คน", "สูงสุด 5 สาขา", "POS และ barcode", "รายงานยอดขาย"]
  },
  premium: {
    name: "Premium",
    subtitle: "สำหรับบัญชีที่ต้องการหลายฟีเจอร์หรือหลายสาขา",
    monthlyPrice: null,
    features: ["หลายสาขา", "รายงานขั้นสูง", "สิทธิ์พนักงานละเอียด", "คุยรายละเอียดก่อนเปิดใช้งาน"]
  }
};

function planFromParam(value: string | null): PlanCode {
  if (value === "premium" || value === "free" || value === "pro") return value;
  return "pro";
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

export function CheckoutPage() {
  const [searchParams] = useSearchParams();
  const initialPlan = planFromParam(searchParams.get("plan"));
  const initialCheckoutMode = checkoutModeFromParam(searchParams.get("mode"));
  const paymentStatus = searchParams.get("payment");
  const returnedReference = searchParams.get("reference");
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
  const plan = plans[planCode];
  const amount = plan.monthlyPrice;
  const isFree = amount === 0;
  const needsContact = amount === null;
  const currentSubscription = business.data?.subscription;
  const currentPeriodEnd = currentSubscription?.currentPeriodEnd ?? currentSubscription?.expiresAt;
  const currentPlanCode = (currentSubscription?.plan?.code ?? currentSubscription?.plan?.name ?? "").toLowerCase();
  const isPromptPayToSubscription = checkoutMode === "subscription" && currentSubscription?.status === "ACTIVE" && currentSubscription.paymentMode === "PROMPTPAY_ONE_TIME" && currentPlanCode === planCode && Boolean(currentPeriodEnd);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError("");

    if (needsContact) {
      setSubmittedReference("");
      setIsSubmitted(true);
      return;
    }

    if (!session) {
      setSubmitError("กรุณาสร้างบัญชีหรือเข้าสู่ระบบก่อนชำระเงิน เพื่อให้แพ็กเกจผูกกับบัญชีได้ถูกต้อง");
      return;
    }

    setIsSubmitting(true);
    try {
      const payment = await post<AccountPayment>("/payments/checkout", {
        planCode: planCode.toUpperCase(),
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

  if (isSubmitted) {
    return (
      <main className="mx-auto grid min-h-[72vh] max-w-3xl place-items-center px-5 py-12">
        <Card className="w-full p-7 text-center shadow-soft">
          <div className="mx-auto grid size-16 place-items-center rounded-lg bg-teal-50 text-leaf">
            <CheckCircle2 size={34} />
          </div>
          <p className="mt-5 text-sm font-black uppercase tracking-[0.18em] text-leaf">Payment Request</p>
          <h1 className="mt-2 text-3xl font-black text-ink">{needsContact ? "ส่งคำขอ Premium แล้ว" : "สร้างรายการชำระเงินแล้ว"}</h1>
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

          {paymentStatus === "success" ? (
            <div className="mt-6 rounded-lg border border-teal-200 bg-teal-50 p-4 text-sm font-semibold leading-6 text-teal-900">
              ชำระเงินผ่าน Stripe สำเร็จแล้ว{returnedReference ? ` เลขอ้างอิง ${returnedReference}` : ""} ระบบจะอัปเดตแพ็กเกจหลังได้รับ webhook จาก Stripe
            </div>
          ) : paymentStatus === "cancelled" ? (
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

              {!isFree && !needsContact ? (
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
              ) : null}

              {needsContact ? (
                <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <p className="font-black text-amber-900">Premium ต้องให้ทีมงานติดต่อกลับก่อนเปิดชำระเงิน</p>
                  <p className="mt-1 text-sm leading-6 text-amber-800">ส่งข้อมูลบัญชีไว้ได้เลย ทีมงานจะคุยจำนวนสาขา ผู้ใช้ และรายงานที่ต้องการก่อนสรุปราคา</p>
                </div>
              ) : isFree ? (
                <div className="mt-5 rounded-lg border border-teal-100 bg-teal-50 p-4">
                  <p className="font-black text-leaf">Free ไม่ต้องชำระเงิน</p>
                  <p className="mt-1 text-sm leading-6 text-teal-800">สร้างบัญชีแล้วเริ่มใช้งานแพ็กเกจฟรีได้ทันที</p>
                </div>
              ) : (
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
              {isFree ? (
                <Link to="/register">
                  <Button type="button" className="w-full sm:w-auto">เริ่มใช้ฟรี</Button>
                </Link>
              ) : (
                <Button type="submit" className="w-full sm:w-auto" icon={needsContact ? <Sparkles size={18} /> : <ShieldCheck size={18} />} disabled={isSubmitting}>
                  {isSubmitting ? "กำลังพาไป Stripe..." : needsContact ? "ส่งข้อมูลให้ทีมติดต่อ" : isPromptPayToSubscription ? "ตั้งค่าบัตรสำหรับรอบถัดไป" : checkoutSubmitLabel(checkoutMode)}
                </Button>
              )}
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
	            <p className="mt-1 text-4xl font-black">{amount === null ? "คุยราคา" : isPromptPayToSubscription ? "฿0 วันนี้" : baht(amount)}</p>
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
