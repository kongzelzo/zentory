import { FormEvent, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ArrowLeft, Building2, ClipboardList } from "lucide-react";
import type { AuthSession } from "@zentory/shared";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { post } from "../lib/api";
import { useAuth } from "../state/auth";

const provinces = ["กรุงเทพฯ", "นนทบุรี", "ปทุมธานี", "เชียงใหม่", "ชลบุรี", "ขอนแก่น", "นครราชสีมา", "สงขลา", "อื่น ๆ"];
const businessTypes = ["ร้านขายของชำ", "ร้านเครื่องสำอาง", "ร้านเสื้อผ้า", "ร้านอุปกรณ์มือถือ", "ร้านเครื่องเขียน", "ร้านอะไหล่", "ร้านขายส่ง", "ร้านค้าออนไลน์", "อื่น ๆ"];
const branchCounts = [
  { value: "1", label: "1 สาขา" },
  { value: "2-3", label: "2-3 สาขา" },
  { value: "4+", label: "4 สาขาขึ้นไป" }
];

export function SetupStorePage() {
  const navigate = useNavigate();
  const session = useAuth((state) => state.session);
  const setSession = useAuth((state) => state.setSession);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!session) return <Navigate to="/login" replace />;
  if (session.business?.onboardingCompleted) return <Navigate to="/app/dashboard" replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const province = String(form.get("province") ?? "");
    const businessType = String(form.get("businessType") ?? "");
    const branchCount = String(form.get("branchCount") ?? "1");
    const setupMode = String(form.get("setupMode") ?? "empty");
    const nextErrors: Record<string, string> = {};

    if (!name) nextErrors.name = "กรุณากรอกชื่อร้าน";
    if (!province) nextErrors.province = "กรุณาเลือกจังหวัด";
    if (!businessType) nextErrors.businessType = "กรุณาเลือกประเภทธุรกิจ";

    setFieldErrors(nextErrors);
    setError("");
    if (Object.keys(nextErrors).length > 0) return;

    setIsSubmitting(true);
    try {
      const nextSession = await post<AuthSession>("/businesses", { name, province, businessType, branchCount, setupMode });
      setSession(nextSession);
      navigate("/app/onboarding");
    } catch (err) {
      setError(err instanceof Error ? err.message : "ตั้งค่าร้านไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-8">
      <div className="mx-auto max-w-2xl">
        <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-moss transition hover:text-leaf">
          <ArrowLeft size={16} />
          กลับหน้าแรก
        </Link>

        <Card className="mt-6 p-6 shadow-soft">
          <div className="mb-7 flex items-start gap-4">
            <div className="grid size-12 shrink-0 place-items-center rounded-lg bg-teal-50 text-leaf">
              <Building2 size={24} />
            </div>
            <div>
              <h1 className="text-3xl font-black text-ink">ตั้งค่าร้านของคุณ</h1>
              <p className="mt-2 text-sm leading-6 text-stone-600">กรอกข้อมูลพื้นฐานของร้าน เพื่อเริ่มใช้งาน Zentory ได้อย่างถูกต้อง</p>
            </div>
          </div>

          <form onSubmit={submit} noValidate className="space-y-5">
            <label className="block">
              <span className="text-sm font-semibold text-ink">ชื่อร้าน</span>
              <input className="field mt-1" name="name" placeholder="เช่น ร้านก้องมาร์ท" defaultValue={session.business?.name ?? ""} aria-invalid={Boolean(fieldErrors.name)} />
              {fieldErrors.name ? <span className="mt-1 block text-sm font-semibold text-red-700">{fieldErrors.name}</span> : null}
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-semibold text-ink">จังหวัด</span>
                <select className="field mt-1" name="province" defaultValue={session.business?.province ?? ""} aria-invalid={Boolean(fieldErrors.province)}>
                  <option value="">เลือกจังหวัด</option>
                  {provinces.map((province) => <option key={province} value={province}>{province}</option>)}
                </select>
                {fieldErrors.province ? <span className="mt-1 block text-sm font-semibold text-red-700">{fieldErrors.province}</span> : null}
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-ink">ประเภทธุรกิจ</span>
                <select className="field mt-1" name="businessType" defaultValue={session.business?.businessType ?? ""} aria-invalid={Boolean(fieldErrors.businessType)}>
                  <option value="">เลือกประเภทธุรกิจ</option>
                  {businessTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
                {fieldErrors.businessType ? <span className="mt-1 block text-sm font-semibold text-red-700">{fieldErrors.businessType}</span> : null}
              </label>
            </div>

            <label className="block">
              <span className="text-sm font-semibold text-ink">จำนวนสาขา</span>
              <select className="field mt-1" name="branchCount" defaultValue={session.business?.branchCount ?? "1"}>
                {branchCounts.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>

            <fieldset>
              <legend className="text-sm font-semibold text-ink">ตัวเลือกการเริ่มต้นข้อมูล</legend>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <label className="rounded-md border border-stone-200 p-4 transition has-[:checked]:border-leaf has-[:checked]:bg-teal-50/60">
                  <input className="sr-only" type="radio" name="setupMode" value="empty" defaultChecked />
                  <span className="flex items-center gap-2 font-black text-ink"><ClipboardList size={18} className="text-leaf" /> เริ่มจากข้อมูลเปล่า</span>
                  <span className="mt-1 block text-sm text-stone-600">เหมาะสำหรับเริ่มใส่สินค้าจริงด้วยตัวเอง</span>
                </label>
                <label className="rounded-md border border-stone-200 p-4 transition has-[:checked]:border-leaf has-[:checked]:bg-teal-50/60">
                  <input className="sr-only" type="radio" name="setupMode" value="sample" />
                  <span className="flex items-center gap-2 font-black text-ink"><ClipboardList size={18} className="text-leaf" /> ใช้ข้อมูลตัวอย่าง</span>
                  <span className="mt-1 block text-sm text-stone-600">สร้างตัวอย่างภายหลังได้จากหน้าเริ่มต้นใช้งาน</span>
                </label>
              </div>
            </fieldset>

            {error ? <p className="rounded-md bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p> : null}

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button type="button" variant="ghost" onClick={() => navigate("/app/onboarding")}>ทำภายหลัง</Button>
              <Button disabled={isSubmitting}>{isSubmitting ? "กำลังบันทึก..." : "เริ่มใช้งาน"}</Button>
            </div>
          </form>
        </Card>
      </div>
    </main>
  );
}
