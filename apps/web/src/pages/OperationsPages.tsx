import { Download, FileSpreadsheet, Printer, QrCode, Upload } from "lucide-react";
import { Button } from "../components/Button";
import { Card } from "../components/Card";

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

export function BarcodePage() {
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
      <Card>
        <h1 className="text-3xl font-black">Barcode</h1>
        <p className="mt-2 text-stone-600">สแกนด้วย input จากเครื่องยิง barcode หรือเตรียมพิมพ์ label</p>
        <input className="field mt-6" placeholder="ยิง barcode ที่นี่" autoFocus />
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
  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-black">ชำระเงินแพ็กเกจ</h1>
      <div className="grid gap-4 md:grid-cols-2">
        <Card><h2 className="text-xl font-black">Free</h2><p className="mt-2 text-stone-600">สินค้า 30 รายการ ผู้ใช้ 1 คน</p><Button className="mt-4" variant="secondary">ใช้อยู่</Button></Card>
        <Card className="border-leaf"><h2 className="text-xl font-black">Pro</h2><p className="mt-2 text-stone-600">สินค้า 1,000 รายการ ผู้ใช้ 5 คน</p><Button className="mt-4">อัปเกรด / แนบสลิป</Button></Card>
      </div>
    </div>
  );
}

export function SupportPage() {
  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-black">ช่วยเหลือ / Support</h1>
      <div className="grid gap-4 md:grid-cols-2">
        {["วิธีเพิ่มสินค้า", "วิธีขายสินค้า", "วิธีรับสินค้าเข้า", "วิธีดูรายงาน"].map((title) => <Card key={title}><h2 className="font-black">{title}</h2><p className="mt-2 text-sm text-stone-600">คู่มือฉบับย่อสำหรับผู้ใช้ใหม่</p></Card>)}
      </div>
      <Card>
        <h2 className="text-xl font-black">ติดต่อทีมงาน</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <input className="field" placeholder="หัวข้อ" />
          <input className="field" placeholder="อีเมลติดต่อกลับ" />
          <textarea className="field md:col-span-2" placeholder="รายละเอียดปัญหา" rows={4} />
          <Button className="md:col-span-2">ส่งคำขอช่วยเหลือ</Button>
        </div>
      </Card>
    </div>
  );
}
