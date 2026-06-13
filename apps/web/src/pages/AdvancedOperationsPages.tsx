import { CheckCircle2, DatabaseBackup, KeyRound, Printer, RotateCcw, ShieldCheck, Tag, Wallet } from "lucide-react";
import { Button } from "../components/Button";
import { Card } from "../components/Card";

const operations = {
  returns: {
    title: "คืนสินค้า / คืนเงิน",
    subtitle: "ค้นหาใบขาย เลือกรายการคืน และกำหนดว่าสินค้ากลับเข้าสต็อกหรือไม่",
    fields: ["เลขใบขาย", "สินค้า", "จำนวนคืน", "เหตุผล"],
    rows: [["SALE-2026-00001", "น้ำดื่ม 600ml", "1", "ลูกค้าเปลี่ยนใจ"]],
    icon: RotateCcw
  },
  "stock-counts": {
    title: "นับสต็อก",
    subtitle: "สร้างรอบนับ เปรียบเทียบยอดระบบกับยอดจริง และเตรียมปรับสต็อก",
    fields: ["รอบนับ", "คลัง", "ผู้รับผิดชอบ", "สถานะ"],
    rows: [["COUNT-2026-00001", "หน้าร้านหลัก", "Demo User", "กำลังนับ"]],
    icon: CheckCircle2
  },
  expenses: {
    title: "ค่าใช้จ่ายร้าน",
    subtitle: "บันทึกค่าใช้จ่ายเพื่อใช้กับรายงานกำไรขาดทุน",
    fields: ["วันที่", "หมวดค่าใช้จ่าย", "จำนวนเงิน", "หมายเหตุ"],
    rows: [["10 มิ.ย. 2026", "ค่าเช่า", "฿12,000", "รายเดือน"]],
    icon: Wallet
  },
  receipts: {
    title: "ใบเสร็จ / พิมพ์ซ้ำ",
    subtitle: "ค้นหาใบเสร็จ ดูรายละเอียด และพิมพ์ซ้ำให้ลูกค้า",
    fields: ["เลขใบเสร็จ", "วันที่", "ยอดรวม", "สถานะ"],
    rows: [["LOCAL-1", "วันนี้", "฿0", "ชำระแล้ว"]],
    icon: Printer
  },
  discounts: {
    title: "ส่วนลด / โปรโมชัน",
    subtitle: "กำหนดส่วนลดสูงสุด คูปอง และโปรโมชันพื้นฐาน",
    fields: ["ชื่อโปรโมชัน", "ประเภท", "มูลค่า", "สถานะ"],
    rows: [["เปิดร้านใหม่", "ส่วนลดท้ายบิล", "10%", "ร่าง"]],
    icon: Tag
  },
  "activity-approvals": {
    title: "อนุมัติรายการ",
    subtitle: "รายการเสี่ยง เช่น ปรับสต็อก คืนเงิน หรือส่วนลดเกินกำหนด",
    fields: ["เวลา", "ประเภท", "ผู้ขอ", "สถานะ"],
    rows: [["ตอนนี้", "ปรับสต็อก", "Demo User", "รออนุมัติ"]],
    icon: ShieldCheck
  }
} as const;

export function AdvancedOperationPage({ kind }: { kind: keyof typeof operations }) {
  const page = operations[kind];
  const Icon = page.icon;
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-lg bg-white text-leaf shadow-sm"><Icon size={22} /></div>
        <div>
          <h1 className="text-3xl font-black">{page.title}</h1>
          <p className="text-stone-600">{page.subtitle}</p>
        </div>
      </div>
      <Card>
        <div className="grid gap-3 md:grid-cols-4">
          {page.fields.map((field) => <input key={field} className="field" placeholder={field} />)}
        </div>
        <Button className="mt-4">เพิ่มรายการ</Button>
      </Card>
      <div className="table-shell">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-stone-50 text-stone-500">
            <tr>{page.fields.map((field) => <th key={field} className="p-3">{field}</th>)}</tr>
          </thead>
          <tbody>
            {page.rows.map((row) => (
              <tr key={row.join("|")} className="border-t border-stone-100">
                {row.map((cell) => <td key={cell} className="p-3">{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ProfitLossPage() {
  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-black">กำไรขาดทุน</h1>
      <div className="grid gap-4 md:grid-cols-4">
        <Card><p className="text-sm text-stone-500">ยอดขาย</p><p className="text-3xl font-black">฿0</p></Card>
        <Card><p className="text-sm text-stone-500">ต้นทุนขาย</p><p className="text-3xl font-black">฿0</p></Card>
        <Card><p className="text-sm text-stone-500">ค่าใช้จ่าย</p><p className="text-3xl font-black">฿0</p></Card>
        <Card><p className="text-sm text-stone-500">กำไรสุทธิ</p><p className="text-3xl font-black text-leaf">฿0</p></Card>
      </div>
      <Card>
        <h2 className="text-xl font-black">โครงรายงาน</h2>
        <div className="mt-4 space-y-3 text-sm">
          {["ยอดขายสุทธิ", "หักต้นทุนสินค้า", "หักค่าใช้จ่ายร้าน", "กำไรขั้นต้น / กำไรสุทธิ"].map((item) => (
            <div key={item} className="rounded-md border border-stone-200 p-3">{item}</div>
          ))}
        </div>
      </Card>
    </div>
  );
}

export function PaymentMethodsPage() {
  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-black">ตั้งค่าวิธีชำระเงิน</h1>
      <div className="grid gap-4 md:grid-cols-3">
        {["เงินสด", "โอนเงิน", "PromptPay QR"].map((method) => (
          <Card key={method}>
            <h2 className="text-xl font-black">{method}</h2>
            <p className="mt-2 text-sm text-stone-600">เปิดใช้งานใน POS และใบเสร็จ</p>
            <label className="mt-4 flex items-center gap-2 text-sm font-semibold"><input type="checkbox" defaultChecked /> เปิดใช้งาน</label>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function NotificationSettingsPage() {
  return (
    <Card className="max-w-3xl">
      <h1 className="text-3xl font-black">ตั้งค่าแจ้งเตือน</h1>
      <div className="mt-6 space-y-4">
        {["สินค้าใกล้หมด", "สินค้าหมดสต็อก", "ยอดขายลดลงผิดปกติ", "รายการรออนุมัติ"].map((label) => (
          <label key={label} className="flex items-center justify-between rounded-md border border-stone-200 p-3">
            <span className="font-semibold">{label}</span>
            <input type="checkbox" defaultChecked />
          </label>
        ))}
      </div>
    </Card>
  );
}

export function TaxInvoicesPage() {
  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-black">ใบกำกับภาษี</h1>
      <Card>
        <div className="grid gap-3 md:grid-cols-4">
          {["เลขใบกำกับ", "ชื่อลูกค้า", "เลขผู้เสียภาษี", "ยอดรวม"].map((field) => <input key={field} className="field" placeholder={field} />)}
        </div>
        <Button className="mt-4">ออกใบกำกับภาษี</Button>
      </Card>
    </div>
  );
}

export function DataBackupPage() {
  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-black">สำรอง / กู้คืนข้อมูล</h1>
      <div className="grid gap-4 md:grid-cols-2">
        <Card><DatabaseBackup className="text-leaf" /><h2 className="mt-4 text-xl font-black">Backup</h2><p className="mt-2 text-stone-600">ดาวน์โหลดข้อมูลร้านเป็นไฟล์สำรอง</p><Button className="mt-4">สร้าง Backup</Button></Card>
        <Card><DatabaseBackup className="text-ember" /><h2 className="mt-4 text-xl font-black">Restore</h2><p className="mt-2 text-stone-600">อัปโหลดไฟล์สำรองเพื่อกู้คืนข้อมูล</p><input className="field mt-4" type="file" /></Card>
      </div>
    </div>
  );
}

export function ApiKeysPage() {
  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-black">API Keys / Webhooks</h1>
      <Card>
        <KeyRound className="text-leaf" />
        <h2 className="mt-4 text-xl font-black">Developer Access</h2>
        <p className="mt-2 text-stone-600">เตรียมเชื่อม API รายการสินค้า ยอดขาย และ stock movement ในอนาคต</p>
        <div className="mt-4 flex gap-3">
          <Button>สร้าง API Key</Button>
          <Button variant="secondary">เพิ่ม Webhook</Button>
        </div>
      </Card>
    </div>
  );
}
