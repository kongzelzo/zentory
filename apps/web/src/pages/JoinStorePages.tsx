import { FormEvent, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { BriefcaseBusiness, Building2, CalendarDays, Clipboard, Clock3, MessageSquareText, Phone, RefreshCw, Save, Store, UserRound, UserRoundPlus, XCircle } from "lucide-react";
import type { AuthSession } from "@zentory/shared";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Dropdown } from "../components/Dropdown";
import { OnboardingTopbar } from "../components/OnboardingTopbar";
import { api, patch, post } from "../lib/api";
import { getPostAuthPath, markProfileSetupCompleted } from "../lib/onboarding";
import { useAuth } from "../state/auth";

type MeResponse = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  isSystemAdmin: boolean;
  business?: AuthSession["business"];
  membershipRequest?: AuthSession["membershipRequest"];
};

type EmployeeApplicationForm = {
  employeeName: string;
  employeePhone: string;
  preferredRole: string;
  preferredBranch: string;
  availableStartDate: string;
  applicationNote: string;
  businessId: string;
  requestedBranchId: string;
};

type MembershipTarget = {
  businessId: string;
  businessName: string;
  selectedBranchId?: string | null;
  branches: Array<{ id: string; name: string; code?: string | null; isDefault?: boolean }>;
};

const roleInterestOptions = [
  "แคชเชียร์",
  "พนักงานขาย",
  "พนักงานคลัง",
  "ผู้จัดการร้าน",
  "ดูรายงาน/แอดมิน"
];

export function AccountSetupPage() {
  const session = useAuth((state) => state.session);
  const setSession = useAuth((state) => state.setSession);
  const navigate = useNavigate();
  const [name, setName] = useState(session?.user.name ?? "");
  const [phone, setPhone] = useState(session?.user.phone ?? "");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!session) return <Navigate to="/login" replace />;
  if (session.business) return <Navigate to="/app/dashboard" replace />;
  if (session.membershipRequest?.status === "PENDING") return <Navigate to="/join-request/pending" replace />;
  if (session.membershipRequest?.status === "REJECTED") return <Navigate to="/join-request/rejected" replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    if (trimmedName.length < 2) {
      setError("กรุณากรอกชื่ออย่างน้อย 2 ตัวอักษร");
      return;
    }

    setError("");
    setIsSubmitting(true);
    try {
      const nextSession = await patch<AuthSession>("/me/profile", {
        name: trimmedName,
        phone: trimmedPhone || undefined
      });
      markProfileSetupCompleted(nextSession.user.id);
      setSession(nextSession);
      navigate("/join-or-create", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกข้อมูลไม่สำเร็จ");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <OnboardingTopbar />
      <div className="mx-auto max-w-xl px-5 py-8">
        <Card className="p-6">
          <div className="grid size-12 place-items-center rounded-md bg-teal-50 text-leaf">
            <UserRound size={24} />
          </div>
          <h1 className="mt-4 text-3xl font-black text-ink">ข้อมูลผู้ใช้งาน</h1>
          <p className="mt-2 text-sm leading-6 text-stone-600">ยืนยันชื่อที่จะแสดงในร้าน ก่อนเลือกว่าจะสร้างร้านใหม่หรือสมัครเข้าร้านเดิม</p>
          <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
            <label className="block">
              <span className="text-sm font-semibold text-ink">ชื่อผู้ใช้งาน</span>
              <input
                className="field mt-1"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                placeholder="เช่น คุณเมย์ ใจดี"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-ink">เบอร์โทร</span>
              <input
                className="field mt-1"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                autoComplete="tel"
                placeholder="เช่น 0812345678"
              />
            </label>
            {error ? <p className="rounded-md bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p> : null}
            <Button className="w-full" icon={<Save size={16} />} disabled={isSubmitting}>
              {isSubmitting ? "กำลังบันทึก..." : "บันทึกและเลือกวิธีเริ่มต้น"}
            </Button>
          </form>
        </Card>
      </div>
    </main>
  );
}

export function JoinOrCreatePage() {
  const session = useAuth((state) => state.session);
  if (!session) return <Navigate to="/login" replace />;
  if (session.business) return <Navigate to="/app/dashboard" replace />;

  return (
    <main className="min-h-screen bg-slate-50">
      <OnboardingTopbar />
      <div className="mx-auto max-w-3xl px-5 py-8">
        <div className="mb-6">
          <h1 className="mt-2 text-3xl font-black text-ink">เริ่มต้นใช้งาน</h1>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="p-5">
            <div className="grid size-12 place-items-center rounded-md bg-teal-50 text-leaf">
              <Store size={24} />
            </div>
            <h2 className="mt-4 text-xl font-black">สร้างร้านใหม่</h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">สำหรับเจ้าของร้านที่ต้องการตั้งค่าร้านและเริ่มจัดการสินค้า</p>
            <Link to="/setup-store" className="mt-5 block">
              <Button className="w-full" icon={<Building2 size={16} />}>สร้างร้าน</Button>
            </Link>
          </Card>
          <Card className="p-5">
            <div className="grid size-12 place-items-center rounded-md bg-amber-50 text-amber-700">
              <UserRoundPlus size={24} />
            </div>
            <h2 className="mt-4 text-xl font-black">เป็นพนักงาน</h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">กรอก UID สาขาที่ได้รับ เพื่อขอเข้าทำงานในสาขานั้น</p>
            <Link to="/join-store" className="mt-5 block">
              <Button className="w-full" variant="secondary" icon={<Clipboard size={16} />}>กรอก UID สาขา</Button>
            </Link>
          </Card>
        </div>
      </div>
    </main>
  );
}

export function JoinStorePage() {
  const session = useAuth((state) => state.session);
  const setSession = useAuth((state) => state.setSession);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const linkedBranchUid = searchParams.get("branchUid") ?? searchParams.get("branch_uid") ?? "";
  const linkedBusinessId = searchParams.get("businessId") ?? searchParams.get("store_uid") ?? searchParams.get("storeUid") ?? linkedBranchUid;
  const linkedBranchId = searchParams.get("branchId") ?? "";
  const [form, setForm] = useState<EmployeeApplicationForm>({
    employeeName: session?.user.name ?? "",
    employeePhone: session?.user.phone ?? "",
    preferredRole: "แคชเชียร์",
    preferredBranch: "",
    availableStartDate: "",
    applicationNote: "",
    businessId: linkedBusinessId,
    requestedBranchId: linkedBranchId
  });
  const [target, setTarget] = useState<MembershipTarget | null>(null);
  const [isLoadingTarget, setIsLoadingTarget] = useState(false);
  const [targetError, setTargetError] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateForm<K extends keyof EmployeeApplicationForm>(key: K, value: EmployeeApplicationForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setIsConfirming(false);
    if (key === "businessId") {
      setTarget(null);
      setTargetError("");
    }
  }

  useEffect(() => {
    if (!session || session.business) return;
    const businessId = form.businessId.trim();
    if (!businessId) {
      setTarget(null);
      setTargetError("");
      return;
    }
    const timeout = window.setTimeout(async () => {
      setIsLoadingTarget(true);
      setTargetError("");
      try {
        const branchId = form.requestedBranchId.trim();
        const params = new URLSearchParams({ businessId });
        if (branchId) params.set("branchId", branchId);
        const nextTarget = await api<MembershipTarget>(`/membership-requests/target?${params.toString()}`);
        const selectedBranchId = nextTarget.selectedBranchId ?? (nextTarget.branches.length === 1 ? nextTarget.branches[0].id : "");
        const selectedBranch = nextTarget.branches.find((branch) => branch.id === selectedBranchId);
        setTarget(nextTarget);
        setForm((current) => ({
          ...current,
          requestedBranchId: selectedBranchId,
          preferredBranch: selectedBranch?.name ?? current.preferredBranch
        }));
      } catch (err) {
        setTarget(null);
        setTargetError(err instanceof Error ? err.message : "ตรวจสอบ UID ไม่สำเร็จ");
      } finally {
        setIsLoadingTarget(false);
      }
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [form.businessId, form.requestedBranchId, session]);

  if (!session) return <Navigate to="/login" replace />;
  if (session.business) return <Navigate to="/app/dashboard" replace />;

  function validateForm() {
    if (!form.employeeName.trim()) return "กรุณากรอกชื่อพนักงาน";
    if (!form.employeePhone.trim()) return "กรุณากรอกเบอร์โทร";
    if (!form.preferredRole.trim()) return "กรุณาเลือกตำแหน่งที่สนใจ";
    if (!form.businessId.trim()) return "กรุณากรอก UID ร้านหรือสาขา";
    if (target && target.branches.length > 1 && !form.requestedBranchId.trim()) return "กรุณาเลือกสาขาที่สมัคร";
    return "";
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError("");
    if (!isConfirming) {
      setIsConfirming(true);
      return;
    }
    setIsSubmitting(true);
    try {
      const nextSession = await post<AuthSession>("/membership-requests", {
        businessId: form.businessId.trim(),
        employeeName: form.employeeName.trim(),
        employeePhone: form.employeePhone.trim(),
        preferredRole: form.preferredRole.trim(),
        preferredBranch: form.preferredBranch.trim() || undefined,
        requestedBranchId: form.requestedBranchId.trim() || undefined,
        availableStartDate: form.availableStartDate || undefined,
        applicationNote: form.applicationNote.trim() || undefined
      });
      setSession(nextSession);
      navigate("/join-request/pending");
    } catch (err) {
      setError(err instanceof Error ? err.message : "ส่งคำขอไม่สำเร็จ");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <OnboardingTopbar backTo="/join-or-create" backLabel="เลือกวิธีเริ่มต้น" />
      <div className="mx-auto max-w-2xl px-5 py-8">
        <Card className="p-6">
          <div className="grid size-12 place-items-center rounded-md bg-amber-50 text-amber-700">
            <UserRound size={24} />
          </div>
          <h1 className="mt-4 text-3xl font-black">ข้อมูลพนักงาน</h1>
          <p className="mt-2 text-sm leading-6 text-stone-600">กรอกโปรไฟล์ที่จะใช้สมัครงานก่อน แล้วค่อยส่งคำขอเข้าร้านด้วย UID สาขาที่ได้รับ</p>
          <form onSubmit={submit} className="mt-5 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-semibold text-ink">ชื่อที่ใช้สมัคร</span>
                <input
                  className="field mt-1"
                  name="employeeName"
                  placeholder="เช่น คุณเมย์ ใจดี"
                  value={form.employeeName}
                  onChange={(event) => updateForm("employeeName", event.target.value)}
                  autoComplete="name"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-ink">เบอร์โทร</span>
                <input
                  className="field mt-1"
                  name="employeePhone"
                  placeholder="เช่น 0812345678"
                  value={form.employeePhone}
                  onChange={(event) => updateForm("employeePhone", event.target.value)}
                  autoComplete="tel"
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-semibold text-ink">ตำแหน่งที่สนใจ</span>
                <Dropdown className="mt-1" options={roleInterestOptions.map((option) => ({ value: option, label: option }))} value={form.preferredRole} onValueChange={(value) => updateForm("preferredRole", value)} />
              </label>
              <div>
                <label className="block">
                  <span className="text-sm font-semibold text-ink">สาขาที่สมัคร</span>
                  {target ? (
                    <Dropdown
                      className="mt-1"
                      options={[
                        ...(target.branches.length > 1 ? [{ value: "", label: "เลือกสาขา" }] : []),
                        ...target.branches.map((branch) => ({ value: branch.id, label: `${branch.name}${branch.code ? ` (${branch.code})` : ""}` }))
                      ]}
                      value={form.requestedBranchId}
                      onValueChange={(value) => {
                        const selectedBranch = target.branches.find((branch) => branch.id === value);
                        updateForm("requestedBranchId", value);
                        updateForm("preferredBranch", selectedBranch?.name ?? "");
                      }}
                      disabled={Boolean(linkedBranchId)}
                    />
                  ) : (
                    <input
                      className="field mt-1"
                      name="preferredBranch"
                      placeholder="กรอก UID ก่อนเพื่อเลือกสาขา"
                      value={form.preferredBranch}
                      onChange={(event) => updateForm("preferredBranch", event.target.value)}
                    />
                  )}
                </label>
                {isLoadingTarget ? <p className="mt-1 text-xs font-semibold text-stone-500">กำลังตรวจสอบสาขา...</p> : null}
                {target ? <p className="mt-1 text-xs font-semibold text-teal-700">ร้าน: {target.businessName}</p> : null}
              </div>
            </div>

            <label className="block">
              <span className="text-sm font-semibold text-ink">วันที่พร้อมเริ่มงาน</span>
              <input className="field mt-1" type="date" value={form.availableStartDate} onChange={(event) => updateForm("availableStartDate", event.target.value)} />
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-ink">ข้อความถึงร้าน</span>
              <textarea
                className="field mt-1 min-h-24"
                name="applicationNote"
                placeholder="เช่น ทำงานได้ช่วงเย็น วันเสาร์-อาทิตย์ หรือมีประสบการณ์ขายหน้าร้าน"
                value={form.applicationNote}
                onChange={(event) => updateForm("applicationNote", event.target.value)}
              />
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-ink">UID ร้านหรือสาขา</span>
              <input
                className="field mt-1 font-mono"
                name="businessId"
                placeholder="เช่น clx..."
                value={form.businessId}
                onChange={(event) => updateForm("businessId", event.target.value)}
                autoComplete="off"
                readOnly={Boolean(linkedBusinessId)}
              />
            </label>
            {targetError ? <p className="rounded-md bg-amber-50 p-3 text-sm font-semibold text-amber-800">{targetError}</p> : null}

            {isConfirming ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
                <p className="font-black text-amber-900">ยืนยันส่งคำขอสมัครเข้าร้านนี้</p>
                <div className="mt-3 grid gap-2 text-sm text-amber-900 sm:grid-cols-2">
                  <p className="flex items-center gap-2"><UserRound size={15} />{form.employeeName}</p>
                  <p className="flex items-center gap-2"><Phone size={15} />{form.employeePhone}</p>
                  <p className="flex items-center gap-2"><BriefcaseBusiness size={15} />{form.preferredRole}</p>
                  <p className="flex items-center gap-2"><CalendarDays size={15} />{form.availableStartDate || "ยังไม่ระบุวันเริ่มงาน"}</p>
                  <p className="flex items-center gap-2 sm:col-span-2"><Clipboard size={15} />UID ที่กรอก: {form.businessId}</p>
                  <p className="flex items-center gap-2 sm:col-span-2"><Store size={15} />สาขา: {form.preferredBranch || "ยังไม่ระบุสาขา"}</p>
                  {form.applicationNote ? <p className="flex items-start gap-2 sm:col-span-2"><MessageSquareText size={15} className="mt-0.5 shrink-0" />{form.applicationNote}</p> : null}
                </div>
              </div>
            ) : null}

            {error ? <p className="rounded-md bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p> : null}
            <Button className="w-full" disabled={isSubmitting}>{isSubmitting ? "กำลังส่งคำขอ..." : isConfirming ? "ยืนยันและส่งคำขอ" : "ตรวจสอบข้อมูลก่อนส่ง"}</Button>
          </form>
        </Card>
      </div>
    </main>
  );
}

export function JoinRequestPendingPage() {
  const session = useAuth((state) => state.session);
  const setSession = useAuth((state) => state.setSession);
  const navigate = useNavigate();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  if (!session) return <Navigate to="/login" replace />;
  if (session.business) return <Navigate to="/app/dashboard" replace />;
  if (session.membershipRequest?.status !== "PENDING") return <Navigate to="/join-or-create" replace />;
  const pendingSession = session;

  async function refreshStatus() {
    setIsRefreshing(true);
    setError("");
    setMessage("");
    try {
      const profile = await api<MeResponse>("/me");
      const nextSession: AuthSession = {
        accessToken: pendingSession.accessToken,
        refreshToken: pendingSession.refreshToken,
        user: {
          id: profile.id,
          name: profile.name,
          email: profile.email,
          phone: profile.phone,
          isSystemAdmin: profile.isSystemAdmin
        },
        business: profile.business,
        membershipRequest: profile.membershipRequest
      };
      setSession(nextSession);
      const nextPath = getPostAuthPath(nextSession);
      if (nextPath !== "/join-request/pending") {
        navigate(nextPath, { replace: true });
        return;
      }
      setMessage("ตรวจสอบแล้ว ยังรอเจ้าของร้านอนุมัติอยู่");
    } catch (err) {
      setError(err instanceof Error ? err.message : "ตรวจสอบสถานะไม่สำเร็จ");
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <RequestStatusCard
      icon={<Clock3 size={28} />}
      title="กำลังรออนุมัติ"
      tone="pending"
      description={`ส่งคำขอเข้าร้าน ${session.membershipRequest.businessName} ในนาม ${session.membershipRequest.employeeName ?? session.user.name} แล้ว กรุณารอเจ้าของร้านอนุมัติ`}
      action={
        <div className="space-y-3">
          <Button className="w-full" variant="secondary" icon={<RefreshCw size={16} />} onClick={refreshStatus} disabled={isRefreshing}>
            {isRefreshing ? "กำลังตรวจสอบ..." : "ตรวจสอบสถานะอีกครั้ง"}
          </Button>
          {message ? <p className="rounded-md bg-amber-50 p-3 text-sm font-semibold text-amber-800">{message}</p> : null}
          {error ? <p className="rounded-md bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p> : null}
        </div>
      }
    />
  );
}

export function JoinRequestRejectedPage() {
  const session = useAuth((state) => state.session);
  if (!session) return <Navigate to="/login" replace />;
  if (session.business) return <Navigate to="/app/dashboard" replace />;
  if (session.membershipRequest?.status !== "REJECTED") return <Navigate to="/join-or-create" replace />;

  return (
    <RequestStatusCard
      icon={<XCircle size={28} />}
      title="คำขอถูกปฏิเสธ"
      tone="rejected"
      description={`คำขอเข้าร้าน ${session.membershipRequest.businessName} ถูกปฏิเสธ คุณสามารถกลับไปกรอก UID สาขาอีกครั้งได้`}
      action={<Link to="/join-or-create"><Button>เลือกใหม่</Button></Link>}
    />
  );
}

function RequestStatusCard({ icon, title, description, tone, action }: { icon: ReactNode; title: string; description: string; tone: "pending" | "rejected"; action?: ReactNode }) {
  const color = tone === "pending" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700";
  return (
    <main className="min-h-screen bg-slate-50">
      <OnboardingTopbar />
      <div className="grid min-h-[calc(100vh-4rem)] place-items-center px-5 py-8">
        <Card className="w-full max-w-lg p-6 text-center">
          <div className={`mx-auto grid size-14 place-items-center rounded-md ${color}`}>{icon}</div>
          <h1 className="mt-5 text-3xl font-black text-ink">{title}</h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-stone-600">{description}</p>
          {action ? <div className="mt-5">{action}</div> : null}
        </Card>
      </div>
    </main>
  );
}
