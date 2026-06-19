import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Circle, CircleDot, Database, PartyPopper } from "lucide-react";
import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { api, post } from "../lib/api";
import { buildOnboardingSteps, type OnboardingStatusResponse } from "../lib/onboarding";
import { useAuth } from "../state/auth";

const emptyStatus: OnboardingStatusResponse = {
  completed: false,
  completedSteps: 0,
  totalSteps: 5,
  percent: 0,
  steps: {
    setupStore: false,
    firstProduct: false,
    stockIn: false,
    firstSale: false,
    firstReport: false
  }
};

const completedStepTargets: Record<keyof OnboardingStatusResponse["steps"], string> = {
  setupStore: "/app/settings",
  firstProduct: "/app/products",
  stockIn: "/app/inventory/movements",
  firstSale: "/app/sales",
  firstReport: "/app/reports/sales"
};

export function OnboardingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const session = useAuth((state) => state.session);
  const updateBusinessOnboarding = useAuth((state) => state.updateBusinessOnboarding);
  const hasBusiness = Boolean(session?.business);
  const syncOnboardingStatus = (next: OnboardingStatusResponse) => {
    updateBusinessOnboarding({ completed: next.completed, progress: next.steps });
  };
  const status = useQuery({
    queryKey: ["onboarding-status"],
    queryFn: () => api<OnboardingStatusResponse>("/onboarding/status"),
    enabled: hasBusiness
  });
  const sampleData = useMutation({
    mutationFn: () => post<OnboardingStatusResponse>("/onboarding/sample-data", {}),
    onSuccess: (next) => {
      syncOnboardingStatus(next);
      queryClient.invalidateQueries({ queryKey: ["onboarding-status"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    }
  });
  const reportViewed = useMutation({
    mutationFn: () => post<OnboardingStatusResponse>("/onboarding/report-viewed", {}),
    onSuccess: (next) => {
      syncOnboardingStatus(next);
      queryClient.invalidateQueries({ queryKey: ["onboarding-status"] });
      navigate("/app/reports/sales");
    }
  });

  useEffect(() => {
    if (status.data) syncOnboardingStatus(status.data);
  }, [status.data]);

  if (status.isLoading) return <p>กำลังโหลดเส้นทางเริ่มต้น...</p>;
  if (status.error) return <p className="text-red-700">{status.error.message}</p>;

  const data = status.data ?? emptyStatus;
  const steps = buildOnboardingSteps(data.steps);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black text-ink">ตั้งค่าร้านให้พร้อมขายใน 5 ขั้นตอน</h1>
          <p className="mt-1 text-stone-600">ทำตามขั้นตอนนี้เพื่อเริ่มใช้งานด้วยข้อมูลจริงของร้าน</p>
        </div>
        <Link to="/app/dashboard">
          <Button variant="secondary">ไปที่ Dashboard</Button>
        </Link>
      </div>

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-black text-ink">{data.completed ? "ร้านของคุณพร้อมใช้งานแล้ว" : `ทำไปแล้ว ${data.completedSteps} จาก ${data.totalSteps} ขั้นตอน`}</p>
          <p className="text-sm font-bold text-leaf">{data.percent}%</p>
        </div>
        <div className="mt-3 h-3 overflow-hidden rounded-full bg-stone-100">
          <div className="h-full rounded-full bg-leaf transition-all" style={{ width: `${data.percent}%` }} />
        </div>
      </Card>

      <Card className="border-amber-200 bg-amber-50 p-4 shadow-none">
        <div className="flex gap-3">
          <AlertTriangle className="mt-0.5 shrink-0 text-amber-700" size={20} />
          <div>
            <p className="font-black text-amber-950">หน้านี้ไม่ใช่โหมดทดลองแยก</p>
            <p className="mt-1 text-sm leading-6 text-amber-900">ข้อมูลที่บันทึกจะอยู่ในร้านของคุณ รวมถึงสินค้า ประวัติรับเข้า การขาย และการตัดสต็อก</p>
          </div>
        </div>
      </Card>

      {data.completed ? (
        <Card className="border-leaf/40 bg-teal-50/50 p-5 shadow-soft">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="grid size-12 shrink-0 place-items-center rounded-full bg-leaf text-white">
              <PartyPopper size={24} />
            </div>
            <div>
              <h2 className="text-xl font-black text-ink">ร้านของคุณพร้อมขายแล้ว</h2>
              <p className="mt-1 text-sm leading-6 text-stone-600">ตอนนี้คุณสามารถบันทึกสินค้า ขายสินค้า ตัดสต็อก และดูรายงานได้ครบแล้ว</p>
            </div>
          </div>
        </Card>
      ) : null}

      <div className="space-y-3">
        {steps.map((step, index) => {
          const isPending = step.status === "pending";
          const isReportStep = step.key === "firstReport";
          const target = step.done ? completedStepTargets[step.key] : step.to;
          return (
            <Card key={step.key} className={step.status === "completed" ? "border-leaf/40" : step.status === "current" ? "border-leaf shadow-soft" : undefined}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <div className="flex flex-wrap items-center gap-3 sm:w-44">
                  <span className={`grid size-10 shrink-0 place-items-center rounded-full text-sm font-black ${step.status === "completed" ? "bg-teal-50 text-leaf" : "bg-stone-50 text-stone-500"}`}>{index + 1}</span>
                  <StepStatusIcon status={step.status} />
                  <span className={`rounded px-2 py-1 text-xs font-black ${step.status === "completed" ? "bg-teal-50 text-leaf" : step.status === "current" ? "bg-teal-100 text-teal-800" : "bg-stone-100 text-stone-500"}`}>
                    {step.status === "completed" ? "เสร็จแล้ว" : step.status === "current" ? "ทำต่อ" : "ยังไม่ทำ"}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-black text-ink">{step.title}</h2>
                  <p className="mt-1 text-sm leading-6 text-stone-600">{step.description}</p>
                </div>
                {isReportStep && step.status === "current" ? (
                  <div className="w-full sm:w-auto">
                    <Button className="w-full sm:w-auto" variant="primary" disabled={reportViewed.isPending || !hasBusiness} onClick={() => reportViewed.mutate()}>
                      {reportViewed.isPending ? "กำลังเปิดรายงาน..." : step.actionLabel}
                    </Button>
                  </div>
                ) : isPending ? (
                  <div className="w-full sm:w-auto">
                    <Button className="w-full sm:w-auto" variant="secondary" disabled>{step.actionLabel}</Button>
                    {step.disabledReason ? <p className="mt-2 text-xs font-semibold text-stone-500">{step.disabledReason}</p> : null}
                  </div>
                ) : (
                  <Link className="w-full sm:w-auto" to={target}>
                    <Button className="w-full sm:w-auto" variant={step.status === "current" ? "primary" : "secondary"}>{step.actionLabel}</Button>
                  </Link>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {!data.steps.firstProduct ? (
        <Card className="border-dashed p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
              <Database className="mt-1 text-leaf" />
              <div>
                <h2 className="text-xl font-black text-ink">ยังไม่มีข้อมูลสินค้า?</h2>
                <p className="mt-1 text-sm leading-6 text-stone-600">สร้างข้อมูลตัวอย่างสำหรับทดลองระบบ เหมาะสำหรับคนที่อยากลองขาย ลองรับเข้า และดูรายงานโดยไม่ต้องกรอกเอง</p>
                <p className="mt-2 text-xs font-semibold text-amber-700">ข้อมูลตัวอย่างจะถูกเพิ่มเป็นสินค้าจริงและประวัติรับเข้าจริง สามารถเก็บสินค้าเข้าประวัติภายหลังได้</p>
                <p className="mt-1 text-xs font-semibold text-stone-500">ตรวจสอบได้จาก SKU/ชื่อสินค้า และเก็บเข้าประวัติได้ภายหลัง</p>
              </div>
            </div>
            <Button className="w-full sm:w-auto" variant="secondary" disabled={!hasBusiness || sampleData.isPending} onClick={() => sampleData.mutate()}>
              {sampleData.isPending ? "กำลังสร้าง..." : "สร้างข้อมูลตัวอย่าง"}
            </Button>
          </div>
          {!hasBusiness ? <p className="mt-3 text-sm font-semibold text-stone-500">ตั้งค่าร้านก่อนสร้างข้อมูลตัวอย่าง</p> : null}
          {sampleData.error ? <p className="mt-3 text-sm font-semibold text-red-700">{sampleData.error.message}</p> : null}
        </Card>
      ) : null}
    </div>
  );
}

function StepStatusIcon({ status }: { status: "completed" | "current" | "pending" }) {
  if (status === "completed") return <CheckCircle2 className="text-leaf" size={22} />;
  if (status === "current") return <CircleDot className="text-leaf" size={22} />;
  return <Circle className="text-stone-400" size={22} />;
}
