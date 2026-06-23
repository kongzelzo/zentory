import { CheckCircle2, DatabaseBackup, KeyRound, Printer, RotateCcw, ShieldCheck, Tag, Wallet } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { api, downloadApi, post } from "../lib/api";
import { baht, number, thaiDate } from "../lib/format";

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
    subtitle: "บันทึกค่าใช้จ่ายร้านสำหรับต่อยอดเป็นรายงานกำไรขาดทุนเต็มรูปแบบ",
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
  const query = useQuery({
    queryKey: ["profit-loss-report"],
    queryFn: () => api<{
      range: { start: string; end: string; days: number };
      summary: { subtotal: number; discount: number; netSales: number; cogs: number; grossProfit: number; grossMarginPercent: number; expenses: number; netProfit: number; receiptCount: number };
      topProducts: Array<{ productId: string; name: string; sku: string; quantity: number; revenue: number; cogs: number; grossProfit: number }>;
      recentSales: Array<{ id: string; receiptNo: string; createdAt: string; total: number; cogs: number; branch?: { name: string } | null; warehouse?: { name: string } | null }>;
    }>("/reports/profit-loss")
  });
  const report = query.data;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-black">รายงานกำไรขั้นต้น</h1>
        <p className="text-stone-600">ดูยอดขายสุทธิ ต้นทุนขาย และกำไรขั้นต้น 30 วันล่าสุดจากใบขายจริง</p>
      </div>
      {query.isLoading ? <Card>กำลังโหลดรายงาน...</Card> : null}
      {query.error ? <Card className="text-red-700">โหลดรายงานไม่สำเร็จ: {query.error.message}</Card> : null}
      <div className="grid gap-4 md:grid-cols-4">
        <Card><p className="text-sm text-stone-500">ยอดขายสุทธิ</p><p className="text-3xl font-black">{baht(report?.summary.netSales ?? 0)}</p></Card>
        <Card><p className="text-sm text-stone-500">ต้นทุนขาย</p><p className="text-3xl font-black">{baht(report?.summary.cogs ?? 0)}</p></Card>
        <Card><p className="text-sm text-stone-500">กำไรขั้นต้น</p><p className="text-3xl font-black text-leaf">{baht(report?.summary.grossProfit ?? 0)}</p></Card>
        <Card><p className="text-sm text-stone-500">Gross Margin</p><p className="text-3xl font-black">{number(report?.summary.grossMarginPercent ?? 0)}%</p></Card>
      </div>
      {report ? (
        <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <Card className="space-y-3">
            <h2 className="text-xl font-black">สินค้ากำไรขั้นต้นสูง</h2>
            {report.topProducts.map((product) => (
              <div key={product.productId} className="grid grid-cols-[1fr_auto] gap-3 rounded-md border border-stone-100 p-3">
                <div className="min-w-0">
                  <p className="truncate font-black">{product.name}</p>
                  <p className="text-xs font-semibold text-stone-500">{product.sku} • {number(product.quantity)} ชิ้น</p>
                </div>
                <div className="text-right">
                  <p className="font-black text-leaf">{baht(product.grossProfit)}</p>
                  <p className="text-xs text-stone-500">ยอดขาย {baht(product.revenue)}</p>
                </div>
              </div>
            ))}
          </Card>
          <Card className="space-y-3">
            <h2 className="text-xl font-black">ใบขายล่าสุดในรายงาน</h2>
            {report.recentSales.map((sale) => (
              <div key={sale.id} className="grid grid-cols-[1fr_auto] gap-3 rounded-md border border-stone-100 p-3 text-sm">
                <div>
                  <p className="font-black">{sale.receiptNo}</p>
                  <p className="text-stone-500">{thaiDate(sale.createdAt)} • {sale.branch?.name ?? "-"} / {sale.warehouse?.name ?? "-"}</p>
                </div>
                <div className="text-right">
                  <p className="font-black">{baht(sale.total)}</p>
                  <p className="text-stone-500">ต้นทุน {baht(sale.cogs)}</p>
                </div>
              </div>
            ))}
          </Card>
        </div>
      ) : null}
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
  const queryClient = useQueryClient();
  const backups = useQuery({
    queryKey: ["backups"],
    queryFn: () => api<Array<{ id: string; status: string; scope: string; fileName?: string | null; sizeBytes?: number | null; startedAt: string; completedAt?: string | null; expiresAt?: string | null; errorMessage?: string | null }>>("/backups")
  });
  const create = useMutation({
    mutationFn: () => post("/backups", {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["backups"] })
  });

  async function downloadBackup(id: string, fileName?: string | null) {
    const blob = await downloadApi(`/backups/${id}/download`);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName || "zentory-backup.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black">สำรองข้อมูล</h1>
          <p className="text-stone-600">สร้าง backup ร้าน เก็บประวัติ และดาวน์โหลดไฟล์สำรองอย่างจำกัดสิทธิ์</p>
        </div>
        <Button icon={<DatabaseBackup size={16} />} disabled={create.isPending} onClick={() => create.mutate()}>{create.isPending ? "กำลังสร้าง..." : "สร้าง Backup"}</Button>
      </div>
      {backups.isLoading ? <Card>กำลังโหลดประวัติ backup...</Card> : null}
      {backups.error ? <Card className="text-red-700">โหลด backup ไม่สำเร็จ: {backups.error.message}</Card> : null}
      <Card className="space-y-3">
        {(backups.data ?? []).length === 0 && !backups.isLoading ? <p className="rounded-md border border-dashed border-stone-300 p-5 text-center font-semibold text-stone-500">ยังไม่มี backup</p> : null}
        {(backups.data ?? []).map((backup) => (
          <div key={backup.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-stone-200 p-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-black">{backup.fileName ?? backup.id}</span>
                <span className={`rounded px-2 py-0.5 text-xs font-black ${backup.status === "SUCCESS" ? "bg-teal-50 text-leaf" : backup.status === "FAILED" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>{backup.status}</span>
              </div>
              <p className="mt-1 text-sm text-stone-500">{thaiDate(backup.startedAt)} • {backup.sizeBytes ? `${number(Math.round(backup.sizeBytes / 1024))} KB` : "ยังไม่มีขนาดไฟล์"}</p>
              {backup.errorMessage ? <p className="mt-1 text-sm font-semibold text-red-700">{backup.errorMessage}</p> : null}
            </div>
            <Button variant="secondary" disabled={backup.status !== "SUCCESS"} onClick={() => downloadBackup(backup.id, backup.fileName)}>ดาวน์โหลด</Button>
          </div>
        ))}
      </Card>
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
