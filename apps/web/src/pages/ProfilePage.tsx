import { useMutation } from "@tanstack/react-query";
import type { AuthSession, Role } from "@zentory/shared";
import { ArrowLeft, BriefcaseBusiness, CalendarClock, CreditCard, KeyRound, LockKeyhole, Mail, Phone, Save, ShieldCheck, Store, UserCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { patch, post } from "../lib/api";
import { useAuth } from "../state/auth";

const roleLabels: Record<Role, string> = {
  OWNER: "เจ้าของร้าน",
  MANAGER: "ผู้จัดการ",
  BRANCH_MANAGER: "ผู้จัดการสาขา",
  CASHIER: "แคชเชียร์",
  STOCK_STAFF: "พนักงานคลัง",
  VIEWER: "ดูรายงาน"
};

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function InfoRow({ icon: Icon, label, value, tone = "default" }: { icon: LucideIcon; label: string; value?: string | null; tone?: "default" | "success" | "muted" }) {
  const iconClass = tone === "success" ? "bg-teal-50 text-teal-700" : tone === "muted" ? "bg-stone-100 text-stone-600" : "bg-stone-50 text-stone-600";
  return (
    <div className="flex items-center gap-2.5 border-b border-stone-100 py-2 last:border-b-0">
      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${iconClass}`}>
        <Icon size={14} />
      </div>
      <div className="grid min-w-0 flex-1 gap-0.5 sm:grid-cols-[128px_minmax(0,1fr)] sm:items-center">
        <p className="text-xs font-semibold text-stone-500">{label}</p>
        <p className="break-words text-sm font-bold text-ink">{value?.trim() || "-"}</p>
      </div>
    </div>
  );
}

export function ProfilePage() {
  const navigate = useNavigate();
  const session = useAuth((state) => state.session);
  const setSession = useAuth((state) => state.setSession);
  const [name, setName] = useState(session?.user.name ?? "");
  const [phone, setPhone] = useState(session?.user.phone ?? "");
  const [message, setMessage] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const role = session?.business?.role;
  const authProviders = session?.user.authProviders;
  const providerLabels = [
    authProviders?.password ? "รหัสผ่าน" : "",
    authProviders?.google ? "Google" : ""
  ].filter(Boolean);

  useEffect(() => {
    setName(session?.user.name ?? "");
    setPhone(session?.user.phone ?? "");
  }, [session?.user.name, session?.user.phone]);

  const updateMutation = useMutation({
    mutationFn: (body: { name: string; phone?: string }) => patch<AuthSession>("/me/profile", body),
    onSuccess: (nextSession) => {
      setSession(nextSession);
      setMessage("บันทึกโปรไฟล์แล้ว");
      setFieldError("");
    },
    onError: (error) => {
      setMessage("");
      setFieldError(error instanceof Error ? error.message : "บันทึกโปรไฟล์ไม่สำเร็จ");
    }
  });

  const resetMutation = useMutation({
    mutationFn: () => post<{ ok: boolean }>("/auth/forgot-password", { email: session?.user.email }),
    onSuccess: () => setResetMessage("ส่งลิงก์เปลี่ยนรหัสผ่านไปที่อีเมลของคุณแล้ว"),
    onError: () => setResetMessage("ส่งลิงก์เปลี่ยนรหัสผ่านไม่สำเร็จ กรุณาลองอีกครั้ง")
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    if (trimmedName.length < 2) {
      setFieldError("ชื่อต้องมีอย่างน้อย 2 ตัวอักษร");
      setMessage("");
      return;
    }
    updateMutation.mutate({ name: trimmedName, phone: trimmedPhone || undefined });
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-xl font-black">บัญชีของฉัน</h1>
          <p className="mt-0.5 text-sm font-semibold text-stone-500">จัดการข้อมูลเข้าสู่ระบบและตัวตนใน Zentory</p>
        </div>
        <Button className="!h-9" type="button" variant="secondary" icon={<ArrowLeft size={16} />} onClick={() => navigate(-1)}>กลับ</Button>
      </div>

      <Card className="!p-4">
        <div className="flex min-w-0 items-center gap-3 border-b border-stone-100 pb-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-leaf text-base font-black text-white">
            {session?.user.name?.trim().charAt(0).toUpperCase() || "Z"}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-black text-ink">{session?.user.name || "-"}</h2>
              <span className="inline-flex items-center gap-1 rounded-md bg-teal-50 px-2 py-0.5 text-xs font-black text-leaf">
                <ShieldCheck size={12} />
                {session?.user.isSystemAdmin ? "System Admin" : "ผู้ใช้ Zentory"}
              </span>
            </div>
            <p className="truncate text-sm font-semibold text-stone-500">{session?.user.email || "-"}</p>
          </div>
        </div>

        <form onSubmit={submit} className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_auto]" noValidate>
          <label className="block">
            <span className="text-xs font-bold text-stone-600">ชื่อผู้ใช้</span>
            <div className="relative mt-1">
              <UserCircle className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={16} />
              <input className="field field-with-left-icon !py-2 text-sm" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" aria-invalid={Boolean(fieldError)} />
            </div>
          </label>
          <label className="block">
            <span className="text-xs font-bold text-stone-600">เบอร์โทร</span>
            <div className="relative mt-1">
              <Phone className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={16} />
              <input className="field field-with-left-icon !py-2 text-sm" value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" placeholder="ยังไม่ได้ระบุ" />
            </div>
          </label>
          <div className="rounded-md border border-stone-100 bg-stone-50/60 px-3 md:col-span-2 xl:col-span-2">
            <InfoRow icon={Mail} label="อีเมลเข้าสู่ระบบ" value={session?.user.email} tone="muted" />
          </div>
          {fieldError ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 md:col-span-2 xl:col-span-3">{fieldError}</p> : null}
          {message ? <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 md:col-span-2 xl:col-span-3">{message}</p> : null}
          <div className="flex justify-end md:col-span-2 xl:col-span-1 xl:row-start-2">
            <Button className="!h-9 w-full sm:w-auto" icon={<Save size={15} />} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "กำลังบันทึก..." : "บันทึกข้อมูลส่วนตัว"}
            </Button>
          </div>
        </form>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="!p-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-stone-100 text-stone-700">
              <Store size={16} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-black">สังกัดงาน</h2>
              <p className="text-sm text-stone-500">ข้อมูลนี้กำหนดโดยร้านและระบบสิทธิ์</p>
            </div>
          </div>
          <div className="mt-2">
            <InfoRow icon={Store} label="ร้านที่สังกัด" value={session?.business?.name ?? "ยังไม่ได้สังกัดร้าน"} />
            <InfoRow icon={BriefcaseBusiness} label="ตำแหน่งในร้าน" value={role ? roleLabels[role] : "-"} />
            <InfoRow icon={ShieldCheck} label="สิทธิ์ระดับสูง" value={session?.user.isSystemAdmin ? "System Admin" : role ? roleLabels[role] : "ผู้ใช้ทั่วไป"} tone="success" />
          </div>
          {role === "OWNER" || session?.user.isSystemAdmin ? (
            <Link to="/app/profile/billing">
              <Button className="mt-3 !h-9 w-full" type="button" variant="secondary" icon={<CreditCard size={15} />}>จัดการแพ็กเกจบัญชี</Button>
            </Link>
          ) : null}
        </Card>

        <Card className="!p-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-stone-100 text-stone-700">
              <LockKeyhole size={16} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-black">ความปลอดภัยบัญชี</h2>
              <p className="text-sm text-stone-500">วิธีเข้าสู่ระบบและรหัสผ่าน</p>
            </div>
          </div>
          <div className="mt-2">
            <InfoRow icon={KeyRound} label="วิธีเข้าสู่ระบบ" value={providerLabels.length > 0 ? providerLabels.join(" + ") : "ยังไม่ระบุ"} />
            <InfoRow icon={CalendarClock} label="สร้างบัญชีเมื่อ" value={formatDateTime(session?.user.createdAt)} />
            <InfoRow icon={CalendarClock} label="อัปเดตล่าสุด" value={formatDateTime(session?.user.updatedAt)} />
          </div>
          <p className="mt-2 rounded-md bg-stone-50 px-3 py-2 text-sm font-semibold leading-6 text-stone-600">
            เพื่อความปลอดภัย ระบบจะส่งลิงก์ไปที่อีเมลเข้าสู่ระบบ แทนการเปลี่ยนรหัสผ่านบนหน้านี้โดยตรง
          </p>
          {resetMessage ? <p className="mt-2 rounded-md bg-stone-100 px-3 py-2 text-sm font-semibold text-stone-700">{resetMessage}</p> : null}
          <Button className="mt-3 !h-9 w-full" type="button" variant="secondary" icon={<KeyRound size={15} />} onClick={() => resetMutation.mutate()} disabled={resetMutation.isPending || !session?.user.email}>
            {resetMutation.isPending ? "กำลังส่งลิงก์..." : "ส่งลิงก์เปลี่ยนรหัสผ่าน"}
          </Button>
        </Card>
      </div>
    </div>
  );
}
