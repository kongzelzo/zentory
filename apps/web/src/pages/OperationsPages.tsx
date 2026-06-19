import { AlertTriangle, ArrowLeft, ArrowRight, BookOpen, CheckCircle2, Clock3, Download, FileSpreadsheet, Gift, HelpCircle, History, LifeBuoy, Mail, MessageCircle, Phone, Printer, QrCode, ReceiptText, ScanLine, Search, Send, ShoppingCart, Upload, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BarcodeScanner } from "../components/BarcodeScanner";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Dropdown } from "../components/Dropdown";
import { api, post } from "../lib/api";
import { thaiDate } from "../lib/format";

const pageCopy: Record<string, { title: string; subtitle: string; fields: string[]; rows: string[][] }> = {
  suppliers: {
    title: "ซัพพลายเออร์",
    subtitle: "รายชื่อผู้ขายส่งและข้อมูลติดต่อ",
    fields: ["ชื่อบริษัท / ร้าน", "ผู้ติดต่อ", "เบอร์โทร", "อีเมล"],
    rows: [["Demo Supply", "คุณเอ", "080-000-0000", "demo@supply.test"]]
  },
  "purchase-orders": {
    title: "ใบสั่งซื้อ / PO",
    subtitle: "สร้างและติดตามคำสั่งซื้อจากซัพพลายเออร์",
    fields: ["เลข PO", "ซัพพลายเออร์", "สถานะ", "วันที่คาดว่าจะได้รับ"],
    rows: [["PO-2026-00001", "Demo Supply", "ร่าง", "15 มิ.ย. 2026"]]
  },
  customers: {
    title: "ลูกค้า",
    subtitle: "ข้อมูลลูกค้า ประวัติซื้อ และแต้มสะสมในอนาคต",
    fields: ["ชื่อลูกค้า", "เบอร์โทร", "อีเมล", "ยอดซื้อสะสม"],
    rows: [["ลูกค้าทั่วไป", "-", "-", "฿0"]]
  },
  "audit-log": {
    title: "Audit Log",
    subtitle: "กล้องวงจรปิดของข้อมูล: ใครทำอะไร เมื่อไหร่",
    fields: ["เวลา", "ผู้ใช้", "เหตุการณ์", "ข้อมูล"],
    rows: [["ตอนนี้", "Demo User", "เปิดดูระบบ", "local demo"]]
  },
  transfers: {
    title: "โอนสินค้าระหว่างสาขา",
    subtitle: "เตรียม flow สำหรับหลายสาขาใน Phase 2",
    fields: ["เลขเอกสาร", "จาก", "ไป", "สถานะ"],
    rows: [["TRF-2026-00001", "หน้าร้านหลัก", "คลังสำรอง", "ร่าง"]]
  },
  branches: {
    title: "สาขา / คลัง",
    subtitle: "จัดการสาขา คลัง และตำแหน่งจัดเก็บ",
    fields: ["ชื่อสาขา", "ประเภท", "สถานะ", "หมายเหตุ"],
    rows: [["หน้าร้านหลัก", "Branch", "เปิดใช้งาน", "default"]]
  }
};

export function OperationPage({ kind }: { kind: keyof typeof pageCopy }) {
  if (kind === "customers") return <CustomerDevelopmentPage />;

  const copy = pageCopy[kind];
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-black">{copy.title}</h1>
        <p className="text-stone-600">{copy.subtitle}</p>
      </div>
      <Card>
        <div className="grid gap-3 md:grid-cols-4">
          {copy.fields.map((field) => <input key={field} className="field" placeholder={field} />)}
        </div>
        <Button className="mt-4">เพิ่มรายการ</Button>
      </Card>
      <div className="table-shell">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-stone-50 text-stone-500"><tr>{copy.fields.map((field) => <th key={field} className="p-3">{field}</th>)}</tr></thead>
          <tbody>
            {copy.rows.map((row) => <tr key={row.join("|")} className="border-t border-stone-100">{row.map((cell) => <td key={cell} className="p-3">{cell}</td>)}</tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CustomerDevelopmentPage() {
  const plannedFeatures = [
    {
      title: "ข้อมูลลูกค้า",
      description: "เก็บชื่อ เบอร์โทร อีเมล และหมายเหตุที่ช่วยให้ร้านจำลูกค้าแต่ละคนได้"
    },
    {
      title: "ประวัติการซื้อ",
      description: "ดูว่ายอดซื้อและรายการสินค้าของลูกค้าแต่ละรายเกิดขึ้นเมื่อไหร่"
    },
    {
      title: "สมาชิกและแต้มสะสม",
      description: "เตรียมต่อยอดเป็นระบบสมาชิก โปรโมชัน และคะแนนสะสมในรอบถัดไป"
    },
    {
      title: "ติดตามหลังการขาย",
      description: "ใช้ช่วยติดตามลูกค้าที่ต้องการใบกำกับซ้ำ คืนสินค้า หรือสอบถามข้อมูลสินค้า"
    }
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-md bg-amber-50 px-3 py-1 text-sm font-black text-amber-800 ring-1 ring-amber-100">
            <Clock3 size={16} />
            กำลังพัฒนา
          </div>
          <h1 className="mt-3 text-3xl font-black">ลูกค้า</h1>
          <p className="mt-1 max-w-3xl text-stone-600">
            หน้านี้เตรียมไว้สำหรับจัดการฐานข้อมูลลูกค้า ดูประวัติการซื้อ และต่อยอดเป็นสมาชิกหรือแต้มสะสม ตอนนี้ยังไม่บันทึกข้อมูลจริง
          </p>
        </div>
      </div>

      <Card className="border-amber-200 bg-amber-50/60">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-center">
          <div>
            <h2 className="text-xl font-black">หน้าที่ของเมนูลูกค้า</h2>
            <p className="mt-2 text-sm leading-6 text-stone-700">
              เมื่อเปิดใช้งานเต็มรูปแบบ ร้านจะสามารถค้นหาลูกค้าจากเบอร์โทร ผูกลูกค้ากับบิลขาย ดูยอดซื้อสะสม และใช้ข้อมูลนี้ช่วยดูแลลูกค้าประจำได้เป็นระบบมากขึ้น
            </p>
          </div>
          <div className="rounded-md border border-amber-200 bg-white p-4 text-sm font-semibold text-stone-700">
            <p className="font-black text-amber-800">สถานะปัจจุบัน</p>
            <p className="mt-1">แสดงตัวอย่างหน้าจอและขอบเขตงานเท่านั้น ปุ่มเพิ่ม/ค้นหาจะเชื่อมต่อ API ในรอบพัฒนาถัดไป</p>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {plannedFeatures.map((feature, index) => {
          const icons = [UserRound, History, Gift, MessageCircle];
          const Icon = icons[index];
          return (
            <Card key={feature.title}>
              <span className="grid h-11 w-11 place-items-center rounded-md bg-teal-50 text-leaf">
                <Icon size={20} />
              </span>
              <h2 className="mt-4 text-lg font-black">{feature.title}</h2>
              <p className="mt-2 text-sm leading-6 text-stone-600">{feature.description}</p>
            </Card>
          );
        })}
      </div>

      <Card>
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="flex-1">
            <label className="text-sm font-bold text-stone-700" htmlFor="customer-preview-search">ค้นหาลูกค้า</label>
            <div className="field-icon-wrap mt-1">
              <Search className="field-icon" size={18} />
              <input id="customer-preview-search" className="field field-with-left-icon" placeholder="ชื่อ เบอร์โทร หรืออีเมล" disabled />
            </div>
          </div>
          <Button disabled>เพิ่มลูกค้า</Button>
        </div>
        <div className="mt-4 rounded-md border border-dashed border-stone-300 bg-stone-50 p-4 text-sm font-semibold text-stone-600">
          ตัวอย่างข้อมูลลูกค้าจะแสดงที่นี่หลังจากระบบฐานข้อมูลลูกค้าพร้อมใช้งาน
        </div>
      </Card>
    </div>
  );
}

export function BarcodePage() {
  const [barcodeValue, setBarcodeValue] = useState("");
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
      <BarcodeScanner
        open={isScannerOpen}
        title="สแกนบาร์โค้ด"
        onDetected={setBarcodeValue}
        onClose={() => setIsScannerOpen(false)}
      />
      <Card>
        <h1 className="text-3xl font-black">Barcode</h1>
        <p className="mt-2 text-stone-600">สแกนด้วย input จากเครื่องยิง barcode หรือเตรียมพิมพ์ label</p>
        <div className="mt-6 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <input className="field" value={barcodeValue} onChange={(event) => setBarcodeValue(event.target.value)} placeholder="ยิง barcode ที่นี่" autoFocus />
          <Button type="button" variant="secondary" icon={<ScanLine size={16} />} onClick={() => setIsScannerOpen(true)}>
            สแกน
          </Button>
        </div>
        <div className="mt-4 flex gap-3">
          <Button icon={<QrCode size={16} />}>ค้นหา</Button>
          <Button variant="secondary" icon={<Printer size={16} />}>พิมพ์ label</Button>
        </div>
      </Card>
      <Card>
        <h2 className="text-xl font-black">รูปแบบ label</h2>
        <div className="mt-5 rounded-md border border-dashed border-stone-300 p-6 text-center">
          <p className="text-3xl font-black tracking-widest">885000000001</p>
          <p className="mt-2 text-sm text-stone-500">DRINK-001 • น้ำดื่ม 600ml</p>
        </div>
      </Card>
    </div>
  );
}

export function ImportExportPage() {
  function downloadTemplate() {
    const rows = [
      ["name", "sku", "barcode", "unit", "categoryName", "brandName", "costPrice", "salePrice", "minStock", "initialStock"],
      ["น้ำดื่ม 600ml", "DRINK-001", "885000000001", "ชิ้น", "เครื่องดื่ม", "Demo", "5", "10", "12", "48"]
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "zentory-product-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-black">นำเข้า / ส่งออกข้อมูล</h1>
        <p className="text-stone-600">ใช้สำหรับงาน bulk data เช่นเตรียมรายการสินค้าหลายรายการหรือส่งออกข้อมูลไปตรวจ ไม่ใช่หน้ารับสินค้าเข้าแบบเอกสาร</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <Upload className="text-leaf" />
          <h2 className="mt-4 text-xl font-black">นำเข้าสินค้าแบบไฟล์</h2>
          <p className="mt-2 text-stone-600">เตรียมไว้สำหรับสร้างสินค้าหลายรายการจาก CSV/XLSX ในรอบถัดไป ตอนนี้ดาวน์โหลด template ไปกรอกข้อมูลได้ก่อน</p>
          <div className="mt-4 rounded-md bg-amber-50 p-3 text-sm font-semibold text-amber-800">สถานะ: เตรียมใช้งาน ยังไม่บันทึกข้อมูลจากไฟล์เข้าระบบจริง</div>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button type="button" icon={<FileSpreadsheet size={16} />} onClick={downloadTemplate}>ดาวน์โหลด template CSV</Button>
            <Button type="button" variant="secondary" disabled>ตรวจไฟล์</Button>
          </div>
        </Card>
        <Card>
          <Download className="text-ember" />
          <h2 className="mt-4 text-xl font-black">ส่งออกข้อมูล</h2>
          <p className="mt-2 text-stone-600">ใช้ส่งออกข้อมูลสินค้า สต็อก ยอดขาย และ movement history เพื่อสำรองหรือนำไปตรวจนอกร้าน</p>
          <div className="mt-4 rounded-md bg-stone-100 p-3 text-sm font-semibold text-stone-700">สถานะ: เตรียมใช้งาน ปุ่ม export จริงจะเชื่อมกับ API รอบถัดไป</div>
          <Button className="mt-4" variant="secondary" icon={<FileSpreadsheet size={16} />} disabled>Export Excel</Button>
        </Card>
      </div>
    </div>
  );
}

export function BillingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const business = useQuery({ queryKey: ["business-current", "billing"], queryFn: () => api<BillingBusiness>("/businesses/current") });
  const subscription = business.data?.subscription;
  const paymentMode = subscription?.paymentMode;
  const periodEnd = subscription?.currentPeriodEnd ?? subscription?.expiresAt;
  const currentPlanName = subscription?.plan.name ?? "Free";
  const currentPlanLimits = subscription?.plan ?? { productLimit: 30, userLimit: 1, branchLimit: 1 };
  const paymentLabel = billingPaymentLabel(currentPlanName, paymentMode, subscription?.cancelAtPeriodEnd);
  const periodLabel = subscription?.cancelAtPeriodEnd ? "ใช้ได้ถึง" : paymentMode === "PROMPTPAY_ONE_TIME" ? "หมดอายุ/ต่ออายุภายใน" : paymentMode === "STRIPE_SUBSCRIPTION" ? "รอบบิลถัดไป" : "สถานะล่าสุด";
  const visibleBillingPlans = billingPlans.filter((plan) => currentPlanName.toLowerCase() === "free" || plan.code !== "free");
  const portalMutation = useMutation({
    mutationFn: () => post<{ url: string }>("/payments/portal", {}),
    onSuccess: (result) => {
      window.location.assign(result.url);
    }
  });
  const cancelMutation = useMutation({
    mutationFn: () => post("/payments/subscription/cancel-at-period-end", {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["business-current"] })
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-black">แพ็กเกจ</h1>
          <p className="text-stone-600">ดูสถานะแพ็กเกจปัจจุบันและการชำระเงินที่ผูกกับบัญชีเจ้าของร้าน</p>
        </div>
        <Button type="button" variant="secondary" icon={<ArrowLeft size={16} />} onClick={() => navigate(-1)}>กลับไปหน้าก่อนหน้า</Button>
      </div>

      <Card className="p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-leaf">Current plan</p>
            <h2 className="mt-2 text-3xl font-black text-ink">{business.isLoading ? "กำลังโหลด..." : currentPlanName}</h2>
            <p className="mt-2 text-stone-600">{paymentLabel}</p>
            {periodEnd ? (
              <p className="mt-3 rounded-md bg-stone-50 px-3 py-2 text-sm font-semibold text-stone-700">
                {periodLabel} {thaiDate(periodEnd)}
              </p>
            ) : null}
          </div>
          <div className="rounded-md border border-stone-200 bg-stone-50 p-4 text-sm font-semibold text-stone-700">
            <p className="font-black text-ink">สิทธิ์แพ็กเกจ</p>
            <p className="mt-2">สินค้า {currentPlanLimits.productLimit} รายการ</p>
            <p>ผู้ใช้ {currentPlanLimits.userLimit} คน</p>
            <p>สาขา {currentPlanLimits.branchLimit} สาขา</p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 border-t border-stone-100 pt-5 md:grid-cols-3">
          <div className="rounded-md border border-stone-200 bg-white p-4">
            <p className="text-sm font-bold text-stone-500">สถานะแพ็กเกจ</p>
            <p className="mt-1 text-lg font-black text-ink">{business.isLoading ? "กำลังโหลด..." : billingStatusLabel(subscription?.status, paymentMode)}</p>
          </div>
          <div className="rounded-md border border-stone-200 bg-white p-4">
            <p className="text-sm font-bold text-stone-500">วิธีชำระเงิน</p>
            <p className="mt-1 text-lg font-black text-ink">{paymentLabel}</p>
          </div>
          <div className="rounded-md border border-stone-200 bg-white p-4">
            <p className="text-sm font-bold text-stone-500">วันที่เกี่ยวข้อง</p>
            <p className="mt-1 text-lg font-black text-ink">{periodEnd ? thaiDate(periodEnd) : "ไม่มีรอบบิล"}</p>
          </div>
        </div>
      </Card>

      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-black text-ink">แพ็กเกจทั้งหมด</h2>
            <p className="text-sm font-semibold text-stone-600">เลือกแพ็กเกจที่ต้องการ แล้วค่อยเลือกวิธีชำระเงินในหน้าถัดไป</p>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {visibleBillingPlans.map((plan) => {
            const isCurrent = plan.name.toLowerCase() === currentPlanName.toLowerCase();
            return (
              <Card key={plan.code} className={`flex flex-col ${plan.highlight ? "border-leaf" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-black text-ink">{plan.name}</h3>
                    <p className="mt-1 text-sm font-semibold text-stone-600">{plan.subtitle}</p>
                  </div>
                  {isCurrent ? <span className="rounded-md bg-teal-50 px-2 py-1 text-xs font-black text-leaf">ใช้อยู่</span> : null}
                </div>
                <p className="mt-4 text-3xl font-black text-ink">{plan.price}</p>
                <ul className="mt-4 grid gap-2 text-sm font-semibold text-stone-700">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2">
                      <CheckCircle2 size={16} className="shrink-0 text-leaf" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-5">
                  {isCurrent && plan.code === "free" ? (
                    <Button type="button" className="w-full" variant="secondary" disabled>แพ็กเกจปัจจุบัน</Button>
                  ) : isCurrent && paymentMode === "STRIPE_SUBSCRIPTION" ? (
                    <Button type="button" className="w-full" variant="secondary" onClick={() => portalMutation.mutate()} disabled={portalMutation.isPending}>
                      {portalMutation.isPending ? "กำลังเปิด Portal..." : "จัดการการต่ออายุ"}
                    </Button>
                  ) : isCurrent && plan.checkoutPath ? (
                    <Link to={plan.checkoutPath}>
                      <Button className="w-full" icon={<ArrowRight size={16} />}>
                        ต่ออายุ {plan.name}
                      </Button>
                    </Link>
                  ) : plan.checkoutPath ? (
                    <Link to={plan.checkoutPath}>
                      <Button className="w-full" variant={plan.highlight ? "primary" : "secondary"} icon={<ArrowRight size={16} />}>
                        {plan.cta}
                      </Button>
                    </Link>
                  ) : (
                    <Button type="button" className="w-full" variant="secondary" disabled>{plan.cta}</Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {paymentMode === "STRIPE_SUBSCRIPTION" ? (
        <Card>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-black">จัดการการชำระเงินปัจจุบัน</h2>
              <p className="mt-1 text-stone-600">บัตร ใบเสร็จ และการต่ออายุอัตโนมัติจัดการผ่าน Stripe Portal</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button type="button" onClick={() => portalMutation.mutate()} disabled={portalMutation.isPending}>
                {portalMutation.isPending ? "กำลังเปิด Portal..." : "จัดการบัตร/ใบเสร็จ"}
              </Button>
              {!subscription?.cancelAtPeriodEnd ? (
                <Button type="button" variant="secondary" onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending}>
                  {cancelMutation.isPending ? "กำลังตั้งค่า..." : "หยุดต่ออายุหลังจบรอบบิล"}
                </Button>
              ) : null}
            </div>
          </div>
        </Card>
      ) : null}

      {(business.error || portalMutation.error || cancelMutation.error) ? (
        <p className="rounded-md bg-red-50 p-3 text-sm font-semibold text-red-700">
          {(business.error ?? portalMutation.error ?? cancelMutation.error as Error)?.message}
        </p>
      ) : null}
    </div>
  );
}

const billingPlans = [
  {
    code: "free",
    name: "Free",
    subtitle: "สำหรับเริ่มทดลองใช้",
    price: "฿0/เดือน",
    features: ["สินค้า 30 รายการ", "ผู้ใช้ 1 คน", "สาขาเดียว", "รายงานพื้นฐาน"],
    cta: "แพ็กเกจพื้นฐาน",
    checkoutPath: "",
    highlight: false
  },
  {
    code: "pro",
    name: "Pro",
    subtitle: "สำหรับร้านที่ใช้งานจริง",
    price: "฿590/เดือน",
    features: ["สินค้า 1,000 รายการ", "ผู้ใช้ 5 คน", "สูงสุด 5 สาขา", "POS และ barcode", "รายงานยอดขาย"],
    cta: "เลือก Pro",
    checkoutPath: "/checkout?plan=pro",
    highlight: true
  },
  {
    code: "premium",
    name: "Premium",
    subtitle: "สำหรับร้านหลายสาขาหรือทีมใหญ่",
    price: "คุยราคา",
    features: ["หลายสาขา", "รายงานขั้นสูง", "สิทธิ์พนักงานละเอียด", "คุยรายละเอียดก่อนเปิดใช้งาน"],
    cta: "คุย Premium",
    checkoutPath: "/checkout?plan=premium",
    highlight: false
  }
] as const;

type BillingBusiness = {
  subscription?: {
    status: string;
    paymentMode: "FREE" | "STRIPE_SUBSCRIPTION" | "PROMPTPAY_ONE_TIME";
    expiresAt?: string | null;
    currentPeriodEnd?: string | null;
    cancelAtPeriodEnd?: boolean;
    plan: { name: string; productLimit: number; userLimit: number; branchLimit: number };
  } | null;
};

export function billingModeLabel(mode: "FREE" | "STRIPE_SUBSCRIPTION" | "PROMPTPAY_ONE_TIME", cancelAtPeriodEnd?: boolean) {
  if (mode === "STRIPE_SUBSCRIPTION") return cancelAtPeriodEnd ? "รายเดือนอัตโนมัติ: ยกเลิกแล้วและใช้ได้ถึงวันจบรอบ" : "รายเดือนอัตโนมัติผ่าน Stripe";
  if (mode === "PROMPTPAY_ONE_TIME") return "PromptPay แบบจ่ายครั้งเดียว";
  return "Free";
}

function billingPaymentLabel(planName: string, mode?: "FREE" | "STRIPE_SUBSCRIPTION" | "PROMPTPAY_ONE_TIME", cancelAtPeriodEnd?: boolean) {
  const isFreePlan = planName.toLowerCase() === "free";
  if (!mode) return isFreePlan ? "Free" : "ยังไม่ระบุวิธีชำระเงิน";
  if (mode === "FREE" && !isFreePlan) return "เปิดใช้งานโดยระบบ";
  return billingModeLabel(mode, cancelAtPeriodEnd);
}

function billingStatusLabel(status?: string, paymentMode?: "FREE" | "STRIPE_SUBSCRIPTION" | "PROMPTPAY_ONE_TIME") {
  if (status === "ACTIVE") return "ใช้งานอยู่";
  if (status === "PAST_DUE") return "รอชำระเงิน";
  if (status === "CANCELED") return "ยกเลิกแล้ว";
  if (paymentMode === "FREE") return "ใช้งาน Free";
  return "ยังไม่ระบุสถานะ";
}

const helpTopics: Array<{ title: string; description: string; to: string; icon: LucideIcon }> = [
  {
    title: "เริ่มต้นตั้งค่าร้าน",
    description: "ตรวจข้อมูลร้าน สาขา คลัง ผู้ใช้ และสิทธิ์ ก่อนเปิดให้ทีมเริ่มทำงาน",
    to: "/app/onboarding",
    icon: CheckCircle2
  },
  {
    title: "เพิ่มสินค้าและบาร์โค้ด",
    description: "สร้างสินค้า ใส่ราคา รูปภาพ หมวดหมู่ จุดสั่งซื้อ และเตรียมสแกนบาร์โค้ด",
    to: "/app/products",
    icon: BookOpen
  },
  {
    title: "ขายหน้าร้าน",
    description: "เปิด POS ค้นหาสินค้า รับชำระเงิน และตรวจบิลขายย้อนหลัง",
    to: "/app/pos",
    icon: ShoppingCart
  },
  {
    title: "จัดการสต็อก",
    description: "รับสินค้าเข้า ปรับยอด ตรวจ movement และนับสต็อกเมื่อยอดไม่ตรง",
    to: "/app/inventory/movements",
    icon: ReceiptText
  }
];

const troubleshootingItems = [
  {
    problem: "ขายไม่ได้หรือสินค้าหาไม่เจอ",
    checks: ["ตรวจว่าสินค้ามีสถานะพร้อมขาย", "ดูว่าสินค้าเปิดใช้งานในสาขาที่กำลังทำงาน", "ลองค้นหาด้วย SKU หรือบาร์โค้ดแทนชื่อสินค้า"]
  },
  {
    problem: "ยอดสต็อกไม่ตรง",
    checks: ["เปิดประวัติ movement ของสินค้า", "ตรวจรายการรับเข้า/ปรับยอดล่าสุด", "ใช้หน้านับสต็อกเพื่อบันทึกยอดตรวจนับจริง"]
  },
  {
    problem: "พนักงานเข้าเมนูไม่ได้",
    checks: ["ตรวจบทบาทและสิทธิ์ของพนักงาน", "ดูว่าสมาชิกถูกผูกกับสาขาที่ถูกต้อง", "ให้ผู้ใช้ลองออกจากระบบแล้วเข้าใหม่หลังแก้สิทธิ์"]
  }
];

const faqItems: Array<[string, string]> = [
  ["หน้านี้เอาไว้ทำอะไร", "เป็นศูนย์ช่วยเหลือสำหรับเจ้าของร้านและทีมหน้าร้าน ใช้หาคู่มือสั้น ๆ ทางลัดไปหน้าที่เกี่ยวข้อง และส่งรายละเอียดปัญหาให้ทีมดูแลต่อ"],
  ["ควรส่งคำขอช่วยเหลือเมื่อไหร่", "ส่งเมื่อทำตาม checklist แล้วยังไปต่อไม่ได้ หรือมีข้อมูลผิดปกติที่กระทบการขาย สต็อก รายงาน หรือสิทธิ์ผู้ใช้"],
  ["ต้องใส่ข้อมูลอะไรในคำขอ", "ระบุหน้าที่เกิดปัญหา ขั้นตอนที่ทำก่อนเจอปัญหา ชื่อสินค้า/เลขบิล/สาขาที่เกี่ยวข้อง และอีเมลสำหรับติดต่อกลับ"],
  ["มีระบบ ticket จริงหรือยัง", "หน้านี้เตรียม UX สำหรับรับเรื่องจากร้านค้า ส่วนการบันทึก ticket เข้า backend ยังต้องเชื่อมต่อ API ในรอบถัดไป"]
];

export function SupportPage() {
  const [requestStatus, setRequestStatus] = useState<"idle" | "sent">("idle");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRequestStatus("sent");
  }

  return (
    <div className="space-y-6">
      <div>
        <div>
          <div className="inline-flex items-center gap-2 rounded-md bg-teal-50 px-3 py-1 text-sm font-black text-teal-800 ring-1 ring-teal-100">
            <LifeBuoy size={16} />
            Support center
          </div>
          <h1 className="mt-3 text-3xl font-black">ช่วยเหลือ</h1>
          <p className="mt-2 max-w-3xl text-stone-600">
            หน้านี้เป็นจุดรวมคำตอบและทางลัดเมื่อทีมร้านติดขัด ใช้ตรวจปัญหาเบื้องต้น เปิดคู่มือของงานสำคัญ และส่งรายละเอียดให้ทีมดูแลต่อได้ในที่เดียว
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {helpTopics.map((topic) => {
          const Icon = topic.icon;
          return (
            <Link key={topic.title} to={topic.to} className="group rounded-lg border border-stone-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-md">
              <div className="flex items-start justify-between gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-md bg-teal-50 text-leaf">
                  <Icon size={20} />
                </span>
                <ArrowRight size={18} className="mt-1 text-stone-400 transition group-hover:translate-x-1 group-hover:text-leaf" />
              </div>
              <h2 className="mt-4 text-lg font-black text-ink">{topic.title}</h2>
              <p className="mt-2 text-sm leading-6 text-stone-600">{topic.description}</p>
            </Link>
          );
        })}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card>
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-amber-50 text-amber-700">
              <AlertTriangle size={20} />
            </span>
            <div>
              <h2 className="text-xl font-black">ตรวจปัญหาก่อนส่งเรื่อง</h2>
              <p className="mt-1 text-sm leading-6 text-stone-600">ช่วยลดเวลารอคำตอบ และทำให้ทีม support เห็นภาพเดียวกับหน้าร้านเร็วขึ้น</p>
            </div>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {troubleshootingItems.map((item) => (
              <div key={item.problem} className="rounded-md border border-stone-200 bg-stone-50 p-4">
                <h3 className="font-black text-ink">{item.problem}</h3>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-stone-600">
                  {item.checks.map((check) => (
                    <li key={check} className="flex gap-2">
                      <CheckCircle2 size={16} className="mt-1 shrink-0 text-leaf" />
                      <span>{check}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="text-xl font-black">ช่องทางติดต่อ</h2>
          <div className="mt-4 space-y-3">
            <a className="flex items-center gap-3 rounded-md border border-stone-200 p-3 text-sm font-semibold text-ink hover:bg-stone-50" href="mailto:support@zentory.test">
              <Mail size={18} className="text-leaf" />
              support@zentory.test
            </a>
            <a className="flex items-center gap-3 rounded-md border border-stone-200 p-3 text-sm font-semibold text-ink hover:bg-stone-50" href="tel:020000000">
              <Phone size={18} className="text-leaf" />
              02-000-0000
            </a>
            <a className="flex items-center gap-3 rounded-md border border-stone-200 p-3 text-sm font-semibold text-ink hover:bg-stone-50" href="https://line.me" target="_blank" rel="noreferrer">
              <MessageCircle size={18} className="text-leaf" />
              LINE OA: @zentory
            </a>
          </div>
          <div className="mt-4 rounded-md bg-stone-100 p-3 text-sm leading-6 text-stone-700">
            สำหรับเดโมนี้ช่องทางติดต่อเป็นข้อมูลตัวอย่าง ควรเปลี่ยนเป็นอีเมล เบอร์โทร และ LINE OA จริงก่อนเปิดใช้งาน
          </div>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card>
          <div className="flex items-center gap-3">
            <HelpCircle className="text-leaf" />
            <h2 className="text-xl font-black">คำถามที่พบบ่อย</h2>
          </div>
          <div className="mt-4 divide-y divide-stone-100">
            {faqItems.map(([question, answer]) => (
              <div key={question} className="py-4 first:pt-0 last:pb-0">
                <h3 className="font-black text-ink">{question}</h3>
                <p className="mt-1 text-sm leading-6 text-stone-600">{answer}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="text-xl font-black">ส่งคำขอช่วยเหลือ</h2>
          <form className="mt-4 grid gap-3" onSubmit={handleSubmit}>
            <label className="grid gap-1">
              <span className="text-sm font-bold text-stone-700">หัวข้อ</span>
              <input className="field" placeholder="เช่น ยอดสต็อกสินค้าไม่ตรง" required />
            </label>
            <label className="grid gap-1">
              <span className="text-sm font-bold text-stone-700">อีเมลติดต่อกลับ</span>
              <input className="field" type="email" placeholder="name@example.com" required />
            </label>
            <label className="grid gap-1">
              <span className="text-sm font-bold text-stone-700">ประเภทปัญหา</span>
              <Dropdown
                name="issueType"
                defaultValue="stock"
                options={[
                  { value: "stock", label: "สต็อก / คลัง" },
                  { value: "sales", label: "ขายหน้าร้าน / บิล" },
                  { value: "product", label: "สินค้า / บาร์โค้ด" },
                  { value: "access", label: "ผู้ใช้ / สิทธิ์" },
                  { value: "billing", label: "แพ็กเกจ / ชำระเงิน" }
                ]}
              />
            </label>
            <label className="grid gap-1">
              <span className="text-sm font-bold text-stone-700">รายละเอียด</span>
              <textarea className="field" placeholder="เล่าว่าทำอะไรอยู่ เจอข้อความอะไร และมีเลขบิล/ชื่อสินค้า/สาขาไหนเกี่ยวข้อง" rows={5} required />
            </label>
            {requestStatus === "sent" ? (
              <div className="rounded-md border border-teal-200 bg-teal-50 p-3 text-sm font-semibold text-teal-900">
                รับเรื่องตัวอย่างแล้ว: เมื่อเชื่อมต่อ API แล้วคำขอนี้จะถูกสร้างเป็น ticket ให้ทีม support
              </div>
            ) : null}
            <Button type="submit" icon={<Send size={16} />}>ส่งคำขอช่วยเหลือ</Button>
          </form>
        </Card>
      </div>

      <Card>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-black">สถานะคำขอล่าสุด</h2>
            <p className="mt-1 text-sm text-stone-600">พื้นที่นี้ควรแสดง ticket ที่ร้านเคยส่งไว้ เมื่อมี API สำหรับ support ฝั่งร้านแล้ว</p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-md bg-stone-100 px-3 py-2 text-sm font-black text-stone-700">
            <Clock3 size={16} />
            ยังไม่มี ticket ที่เชื่อมต่อจริง
          </span>
        </div>
      </Card>
    </div>
  );
}
