import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Boxes, Building2, CheckCircle2, ChevronRight, Clipboard, ClipboardList, Save, Settings2, ShieldCheck, Store, Target, Users } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Dropdown } from "../components/Dropdown";
import { api, patch } from "../lib/api";
import { baht, number } from "../lib/format";

type SalesTargetMode = "ANNUAL" | "MONTHLY" | "DAILY";

type Business = {
  id: string;
  name: string;
  province?: string | null;
  businessType?: string | null;
  branchCount?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  taxId?: string | null;
  logoUrl?: string | null;
  receiptFooter?: string | null;
  currency?: string | null;
  taxRate?: number | string | null;
  salesTargetMode?: SalesTargetMode;
  annualSalesTarget?: number | string | null;
  monthlySalesTarget?: number | string | null;
  dailySalesTarget?: number | string | null;
  subscription?: {
    status?: string;
    plan: {
      name: string;
      productLimit: number;
      userLimit: number;
      branchLimit?: number;
      warehouseLimit?: number;
      priceMonthly?: number | string;
    };
  } | null;
};

type Branch = {
  id: string;
  name: string;
  code: string;
  status: "ACTIVE" | "INACTIVE";
  isDefault?: boolean;
  warehouses?: Warehouse[];
};

type Warehouse = {
  id: string;
  name: string;
  code: string;
  type?: string;
  status: "ACTIVE" | "INACTIVE";
  isDefault?: boolean;
  branch?: { id: string; name: string } | null;
};

type Member = {
  id: string;
  role: string;
  status: string;
};

type StoreForm = {
  name: string;
  province: string;
  businessType: string;
  branchCount: string;
  address: string;
  phone: string;
  email: string;
  taxId: string;
  logoUrl: string;
  receiptFooter: string;
  currency: string;
  taxRate: string;
};

type GoalForm = {
  salesTargetMode: SalesTargetMode;
  target: string;
};

const emptyStoreForm: StoreForm = {
  name: "",
  province: "",
  businessType: "",
  branchCount: "1",
  address: "",
  phone: "",
  email: "",
  taxId: "",
  logoUrl: "",
  receiptFooter: "",
  currency: "THB",
  taxRate: "0"
};

const businessTypes = ["ร้านขายของชำ", "ร้านเครื่องสำอาง", "ร้านเสื้อผ้า", "ร้านอุปกรณ์มือถือ", "ร้านเครื่องเขียน", "ร้านอะไหล่", "ร้านขายส่ง", "ร้านค้าออนไลน์", "อื่น ๆ"];

const branchCounts = [
  { value: "1", label: "1 สาขา" },
  { value: "2-3", label: "2-3 สาขา" },
  { value: "4+", label: "4 สาขาขึ้นไป" }
];

const currencies = [
  { value: "THB", label: "THB - บาทไทย" },
  { value: "USD", label: "USD - ดอลลาร์สหรัฐ" },
  { value: "LAK", label: "LAK - กีบลาว" },
  { value: "KHR", label: "KHR - เรียลกัมพูชา" },
  { value: "MMK", label: "MMK - จ๊าตเมียนมา" }
];

const targetModes: Array<{ value: SalesTargetMode; label: string; placeholder: string }> = [
  { value: "ANNUAL", label: "ต่อปี", placeholder: "เป้ายอดขายต่อปี" },
  { value: "MONTHLY", label: "ต่อเดือน", placeholder: "เป้ายอดขายต่อเดือน" },
  { value: "DAILY", label: "ต่อวัน", placeholder: "เป้ายอดขายต่อวัน" }
];

function targetValue(business?: Business) {
  const mode = business?.salesTargetMode ?? "ANNUAL";
  if (mode === "MONTHLY") return business?.monthlySalesTarget ?? "";
  if (mode === "DAILY") return business?.dailySalesTarget ?? "";
  return business?.annualSalesTarget ?? "";
}

function statusPill(status: string) {
  if (status === "ACTIVE") return "bg-teal-50 text-teal-700";
  if (status === "INACTIVE") return "bg-stone-100 text-stone-600";
  return "bg-amber-50 text-amber-800";
}

function StatTile({ icon, label, value, caption }: { icon: ReactNode; label: string; value: string; caption: string }) {
  return (
    <Card className="min-h-32">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-stone-500">{label}</p>
          <p className="mt-2 text-2xl font-black text-ink">{value}</p>
        </div>
        <span className="grid h-10 w-10 place-items-center rounded-md bg-teal-50 text-leaf">{icon}</span>
      </div>
      <p className="mt-3 text-sm font-semibold text-stone-500">{caption}</p>
    </Card>
  );
}

function SettingsLink({ to, icon, title, detail }: { to: string; icon: ReactNode; title: string; detail: string }) {
  return (
    <Link to={to} className="flex min-h-20 items-center justify-between gap-3 rounded-lg border border-stone-200 bg-white px-4 py-3 transition hover:border-teal-200 hover:bg-teal-50/40">
      <span className="flex min-w-0 items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-stone-100 text-stone-700">{icon}</span>
        <span className="min-w-0">
          <span className="block text-sm font-black text-ink">{title}</span>
          <span className="mt-0.5 block text-sm font-semibold text-stone-500">{detail}</span>
        </span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-stone-400" />
    </Link>
  );
}

export function SettingsPage() {
  const queryClient = useQueryClient();
  const business = useQuery({ queryKey: ["business"], queryFn: () => api<Business>("/businesses/current") });
  const branches = useQuery({ queryKey: ["branches"], queryFn: () => api<Branch[]>("/branches") });
  const warehouses = useQuery({ queryKey: ["warehouses"], queryFn: () => api<Warehouse[]>("/warehouses") });
  const members = useQuery({ queryKey: ["members"], queryFn: () => api<Member[]>("/members") });
  const [storeForm, setStoreForm] = useState<StoreForm>(emptyStoreForm);
  const [goalForm, setGoalForm] = useState<GoalForm>({ salesTargetMode: "ANNUAL", target: "" });
  const [storeMessage, setStoreMessage] = useState("");
  const [goalMessage, setGoalMessage] = useState("");
  const plan = business.data?.subscription?.plan;
  const activeBranches = (branches.data ?? []).filter((branch) => branch.status === "ACTIVE");
  const activeWarehouses = (warehouses.data ?? []).filter((warehouse) => warehouse.status === "ACTIVE");
  const activeMembers = (members.data ?? []).filter((member) => member.status === "ACTIVE");
  const defaultBranch = (branches.data ?? []).find((branch) => branch.isDefault) ?? branches.data?.[0];
  const defaultWarehouse = (warehouses.data ?? []).find((warehouse) => warehouse.isDefault) ?? warehouses.data?.[0];
  const currentTargetMode = targetModes.find((mode) => mode.value === goalForm.salesTargetMode) ?? targetModes[0];
  const setupItems = useMemo(() => [
    { label: "ชื่อร้าน", ready: Boolean(business.data?.name?.trim()) },
    { label: "จังหวัด", ready: Boolean(business.data?.province?.trim()) },
    { label: "ประเภทธุรกิจ", ready: Boolean(business.data?.businessType?.trim()) },
    { label: "ที่อยู่ร้าน", ready: Boolean(business.data?.address?.trim()) },
    { label: "ข้อมูลติดต่อ", ready: Boolean(business.data?.phone?.trim() || business.data?.email?.trim()) },
    { label: "ภาษี/สกุลเงิน", ready: Boolean(business.data?.currency?.trim()) },
    { label: "สาขาหลัก", ready: activeBranches.length > 0 },
    { label: "คลังใช้งาน", ready: activeWarehouses.length > 0 }
  ], [activeBranches.length, activeWarehouses.length, business.data]);
  const setupReadyCount = setupItems.filter((item) => item.ready).length;

  useEffect(() => {
    if (!business.data) return;
    setStoreForm({
      name: business.data.name ?? "",
      province: business.data.province ?? "",
      businessType: business.data.businessType ?? "",
      branchCount: business.data.branchCount ?? "1",
      address: business.data.address ?? "",
      phone: business.data.phone ?? "",
      email: business.data.email ?? "",
      taxId: business.data.taxId ?? "",
      logoUrl: business.data.logoUrl ?? "",
      receiptFooter: business.data.receiptFooter ?? "",
      currency: business.data.currency ?? "THB",
      taxRate: String(business.data.taxRate ?? "0")
    });
    setGoalForm({
      salesTargetMode: business.data.salesTargetMode ?? "ANNUAL",
      target: String(targetValue(business.data) ?? "")
    });
  }, [business.data]);

  const saveStore = useMutation({
    mutationFn: (body: Record<string, unknown>) => patch("/businesses/current", body),
    onSuccess: () => {
      setStoreMessage("บันทึกข้อมูลร้านแล้ว");
      queryClient.invalidateQueries({ queryKey: ["business"] });
      queryClient.invalidateQueries({ queryKey: ["onboarding-status"] });
    },
    onError: (error) => setStoreMessage(error.message)
  });

  const saveGoals = useMutation({
    mutationFn: () => {
      const target = goalForm.target.trim() ? Math.max(0, Number(goalForm.target) || 0) : null;
      return patch("/businesses/dashboard-goals", {
        salesTargetMode: goalForm.salesTargetMode,
        annualSalesTarget: goalForm.salesTargetMode === "ANNUAL" ? target : null,
        monthlySalesTarget: goalForm.salesTargetMode === "MONTHLY" ? target : null,
        dailySalesTarget: goalForm.salesTargetMode === "DAILY" ? target : null
      });
    },
    onSuccess: () => {
      setGoalMessage("บันทึกเป้ายอดขายแล้ว");
      queryClient.invalidateQueries({ queryKey: ["business"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error) => setGoalMessage(error.message)
  });

  function submitStore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStoreMessage("");
    saveStore.mutate({
      ...storeForm,
      name: storeForm.name.trim(),
      province: storeForm.province.trim(),
      businessType: storeForm.businessType.trim(),
      address: storeForm.address.trim(),
      phone: storeForm.phone.trim(),
      email: storeForm.email.trim(),
      taxId: storeForm.taxId.trim(),
      logoUrl: storeForm.logoUrl.trim(),
      receiptFooter: storeForm.receiptFooter.trim(),
      currency: storeForm.currency.trim().toUpperCase(),
      taxRate: Math.max(0, Math.min(100, Number(storeForm.taxRate) || 0))
    });
  }

  function submitGoals(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGoalMessage("");
    saveGoals.mutate();
  }

  async function copyStoreUid() {
    const uid = business.data?.id;
    if (!uid) return;
    await navigator.clipboard.writeText(uid);
    setStoreMessage("คัดลอก UID ร้านแล้ว");
  }

  if (business.isLoading) {
    return <Card>กำลังโหลดการตั้งค่าร้าน...</Card>;
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-black">ตั้งค่าร้าน</h1>
          <p className="mt-1 text-sm font-semibold text-stone-500">แก้ข้อมูลร้าน เป้ายอดขาย สาขา คลัง และสิทธิ์การใช้งานของ {business.data?.name ?? "ร้านของคุณ"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/app/branches">
            <Button variant="secondary" icon={<Building2 size={16} />}>จัดการสาขา</Button>
          </Link>
          <Link to="/app/settings/staff">
            <Button variant="secondary" icon={<Users size={16} />}>พนักงาน</Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={<ShieldCheck size={20} />} label="แพ็กเกจ" value={plan?.name ?? "-"} caption={`สินค้า ${number(plan?.productLimit)} รายการ • ผู้ใช้ ${number(plan?.userLimit)} คน`} />
        <StatTile icon={<Building2 size={20} />} label="สาขาใช้งาน" value={number(activeBranches.length)} caption={`จำกัด ${plan?.branchLimit ? number(plan.branchLimit) : "ไม่ระบุ"} สาขา`} />
        <StatTile icon={<Boxes size={20} />} label="คลังใช้งาน" value={number(activeWarehouses.length)} caption={`จำกัด ${plan?.warehouseLimit ? number(plan.warehouseLimit) : "ไม่ระบุ"} คลัง`} />
        <StatTile icon={<Users size={20} />} label="พนักงานใช้งาน" value={number(activeMembers.length)} caption={`จำกัด ${number(plan?.userLimit)} คนตามแพ็กเกจ`} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
        <Card>
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-teal-50 text-leaf"><Store size={22} /></span>
            <div>
              <h2 className="text-xl font-black">ข้อมูลร้าน</h2>
              <p className="mt-1 text-sm font-semibold text-stone-500">ข้อมูลนี้ใช้กับหัวเอกสาร รายงาน และขั้นตอนเริ่มต้นใช้งาน</p>
            </div>
          </div>
          <form onSubmit={submitStore} className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="text-sm font-black text-stone-700">ชื่อร้าน</span>
              <input className="field" value={storeForm.name} onChange={(event) => setStoreForm((form) => ({ ...form, name: event.target.value }))} required />
            </label>
            <label className="grid gap-1.5">
              <span className="text-sm font-black text-stone-700">จังหวัด</span>
              <input className="field" value={storeForm.province} onChange={(event) => setStoreForm((form) => ({ ...form, province: event.target.value }))} placeholder="เช่น ลพบุรี" />
            </label>
            <label className="grid gap-1.5">
              <span className="text-sm font-black text-stone-700">ประเภทธุรกิจ</span>
              <Dropdown
                options={[{ value: "", label: "เลือกประเภทธุรกิจ" }, ...businessTypes.map((type) => ({ value: type, label: type }))]}
                value={storeForm.businessType}
                onValueChange={(businessType) => setStoreForm((form) => ({ ...form, businessType }))}
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-sm font-black text-stone-700">จำนวนสาขาโดยประมาณ</span>
              <Dropdown options={branchCounts} value={storeForm.branchCount} onValueChange={(branchCount) => setStoreForm((form) => ({ ...form, branchCount }))} />
            </label>
            <label className="grid gap-1.5 md:col-span-2">
              <span className="text-sm font-black text-stone-700">ที่อยู่ร้าน</span>
              <textarea className="field min-h-24" value={storeForm.address} onChange={(event) => setStoreForm((form) => ({ ...form, address: event.target.value }))} placeholder="ที่อยู่เต็มสำหรับเอกสาร ใบเสร็จ หรือการติดต่อ" />
            </label>
            <label className="grid gap-1.5">
              <span className="text-sm font-black text-stone-700">เบอร์โทรร้าน</span>
              <input className="field" value={storeForm.phone} onChange={(event) => setStoreForm((form) => ({ ...form, phone: event.target.value }))} placeholder="เช่น 080-000-0000" />
            </label>
            <label className="grid gap-1.5">
              <span className="text-sm font-black text-stone-700">อีเมลร้าน</span>
              <input className="field" type="email" value={storeForm.email} onChange={(event) => setStoreForm((form) => ({ ...form, email: event.target.value }))} placeholder="store@example.com" />
            </label>
            <label className="grid gap-1.5">
              <span className="text-sm font-black text-stone-700">เลขผู้เสียภาษี</span>
              <input className="field" value={storeForm.taxId} onChange={(event) => setStoreForm((form) => ({ ...form, taxId: event.target.value }))} placeholder="ถ้ามี" />
            </label>
            <label className="grid gap-1.5">
              <span className="text-sm font-black text-stone-700">VAT / ภาษี (%)</span>
              <input className="field" inputMode="decimal" value={storeForm.taxRate} onChange={(event) => setStoreForm((form) => ({ ...form, taxRate: event.target.value }))} placeholder="0" />
            </label>
            <label className="grid gap-1.5">
              <span className="text-sm font-black text-stone-700">สกุลเงิน</span>
              <Dropdown options={currencies} value={storeForm.currency} onValueChange={(currency) => setStoreForm((form) => ({ ...form, currency }))} />
            </label>
            <label className="grid gap-1.5">
              <span className="text-sm font-black text-stone-700">ลิงก์โลโก้ร้าน</span>
              <input className="field" value={storeForm.logoUrl} onChange={(event) => setStoreForm((form) => ({ ...form, logoUrl: event.target.value }))} placeholder="https://..." />
            </label>
            <label className="grid gap-1.5 md:col-span-2">
              <span className="text-sm font-black text-stone-700">ข้อความท้ายใบเสร็จ</span>
              <textarea className="field min-h-24" value={storeForm.receiptFooter} onChange={(event) => setStoreForm((form) => ({ ...form, receiptFooter: event.target.value }))} placeholder="เช่น ขอบคุณที่ใช้บริการ / เงื่อนไขการคืนสินค้า" />
            </label>
            <div className="rounded-md border border-stone-200 bg-stone-50 p-3 md:col-span-2">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-stone-500">UID ร้าน</p>
                  <p className="mt-1 break-all font-mono text-sm font-bold text-ink">{business.data?.id ?? "-"}</p>
                </div>
                <Button type="button" variant="secondary" icon={<Clipboard size={15} />} onClick={copyStoreUid} disabled={!business.data?.id}>คัดลอก UID ร้าน</Button>
              </div>
            </div>
            {storeMessage ? <p className="rounded-md bg-stone-100 p-3 text-sm font-bold text-stone-700 md:col-span-2">{storeMessage}</p> : null}
            <Button className="md:col-span-2" disabled={saveStore.isPending} icon={<Save size={16} />}>บันทึกข้อมูลร้าน</Button>
          </form>
        </Card>

        <Card>
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-stone-100 text-stone-700"><ClipboardList size={22} /></span>
            <div>
              <h2 className="text-xl font-black">ความพร้อมร้าน</h2>
              <p className="mt-1 text-sm font-semibold text-stone-500">พร้อมแล้ว {setupReadyCount}/{setupItems.length} รายการ</p>
            </div>
          </div>
          <div className="mt-5 grid gap-2">
            {setupItems.map((item) => (
              <div key={item.label} className="flex items-center justify-between rounded-md border border-stone-200 px-3 py-2">
                <span className="text-sm font-bold text-stone-700">{item.label}</span>
                <span className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-black ${item.ready ? "bg-teal-50 text-teal-700" : "bg-stone-100 text-stone-500"}`}>
                  {item.ready ? <CheckCircle2 size={13} /> : null}
                  {item.ready ? "พร้อม" : "ยังขาด"}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-teal-50 text-leaf"><Target size={22} /></span>
            <div>
              <h2 className="text-xl font-black">เป้ายอดขาย</h2>
              <p className="mt-1 text-sm font-semibold text-stone-500">ใช้คำนวณความคืบหน้าใน Dashboard เจ้าของร้าน</p>
            </div>
          </div>
          <form onSubmit={submitGoals} className="mt-5 grid gap-4">
            <div className="flex rounded-md border border-stone-200 bg-white p-1">
              {targetModes.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  className={`h-9 flex-1 rounded px-3 text-sm font-black transition ${goalForm.salesTargetMode === mode.value ? "bg-leaf text-white" : "text-stone-600 hover:bg-stone-50"}`}
                  onClick={() => setGoalForm((form) => ({ ...form, salesTargetMode: mode.value }))}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            <input className="field" inputMode="decimal" value={goalForm.target} onChange={(event) => setGoalForm((form) => ({ ...form, target: event.target.value }))} placeholder={currentTargetMode.placeholder} />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-semibold text-stone-500">ค่าปัจจุบัน: {goalForm.target.trim() ? baht(goalForm.target) : "ยังไม่ตั้งเป้า"}</p>
              <Button disabled={saveGoals.isPending} icon={<Save size={16} />}>บันทึกเป้ายอดขาย</Button>
            </div>
            {goalMessage ? <p className="rounded-md bg-stone-100 p-3 text-sm font-bold text-stone-700">{goalMessage}</p> : null}
          </form>
        </Card>

        <Card>
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-stone-100 text-stone-700"><Settings2 size={22} /></span>
            <div>
              <h2 className="text-xl font-black">ทางลัดการจัดการ</h2>
              <p className="mt-1 text-sm font-semibold text-stone-500">แก้รายละเอียดที่มีหน้าจัดการเฉพาะได้จากตรงนี้</p>
            </div>
          </div>
          <div className="mt-5 grid gap-3">
            <SettingsLink to="/app/branches" icon={<Building2 size={18} />} title="จัดการสาขา" detail={defaultBranch ? `${defaultBranch.name} • ${defaultBranch.code}` : "เพิ่มหรือแก้ไขสาขา"} />
            <SettingsLink to="/app/branch-settings" icon={<Boxes size={18} />} title="ตั้งค่าสาขาปัจจุบัน" detail={defaultWarehouse ? `${defaultWarehouse.name} • ${defaultWarehouse.code}` : "ตั้งค่าข้อมูลและ POS ของสาขาทำงาน"} />
            <SettingsLink to="/app/settings/staff" icon={<Users size={18} />} title="พนักงานและสิทธิ์" detail={`${number(activeMembers.length)} คนกำลังใช้งาน`} />
            <SettingsLink to="/app/reports/sales" icon={<BarChart3 size={18} />} title="รายงานยอดขาย" detail="ตรวจยอดขายตามสาขาและช่วงเวลา" />
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-black">สาขาและคลังที่ใช้งาน</h2>
            <p className="mt-1 text-sm font-semibold text-stone-500">ดูสถานะหลักก่อนเข้าไปแก้รายละเอียดในหน้าจัดการ</p>
          </div>
          <Link to="/app/branches">
            <Button variant="secondary" icon={<Building2 size={16} />}>จัดการสาขา</Button>
          </Link>
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs font-black uppercase text-stone-500">
              <tr className="border-b border-stone-200">
                <th className="py-3 pr-4">สาขา</th>
                <th className="py-3 pr-4">รหัส</th>
                <th className="py-3 pr-4">คลังในสาขา</th>
                <th className="py-3 pr-4">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {(branches.data ?? []).map((branch) => (
                <tr key={branch.id} className="border-b border-stone-100">
                  <td className="py-3 pr-4 font-black text-ink">{branch.name}{branch.isDefault ? <span className="ml-2 rounded bg-teal-50 px-2 py-1 text-xs text-teal-700">หลัก</span> : null}</td>
                  <td className="py-3 pr-4 font-semibold text-stone-600">{branch.code}</td>
                  <td className="py-3 pr-4 font-semibold text-stone-600">{number(branch.warehouses?.length ?? 0)}</td>
                  <td className="py-3 pr-4"><span className={`rounded px-2 py-1 text-xs font-black ${statusPill(branch.status)}`}>{branch.status === "ACTIVE" ? "เปิดใช้งาน" : "ปิดใช้งาน"}</span></td>
                </tr>
              ))}
              {branches.data?.length === 0 ? (
                <tr>
                  <td className="py-6 text-center text-sm font-semibold text-stone-500" colSpan={4}>ยังไม่มีสาขา</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
