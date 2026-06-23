import { CreditCard, Flag, Mail, Megaphone, ServerCog, Shield, Ticket, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";

const adminPages = {
  customers: {
    title: "ร้านค้าทั้งหมด",
    subtitle: "ตรวจสถานะร้าน แพ็กเกจ ผู้ใช้งาน และการต่ออายุ",
    icon: Users,
    fields: ["ร้าน", "เจ้าของ", "แพ็กเกจ", "สถานะ"],
    rows: [["ร้าน Demo Market", "owner@demo.test", "Starter", "active", "/admin/customers/demo-market"], ["Coffee Lab", "coffee@example.com", "Professional", "active", "/admin/customers/coffee-lab"]]
  },
  users: {
    title: "ผู้ใช้ทั้งหมด",
    subtitle: "ค้นหาผู้ใช้ข้ามร้านและตรวจสิทธิ์สมาชิก",
    icon: Users,
    fields: ["ชื่อ", "อีเมล", "ร้าน", "สิทธิ์"],
    rows: [["Demo Owner", "owner@demo.test", "ร้าน Demo Market", "OWNER", "/admin/users/user-001"]]
  },
  plans: {
    title: "แพ็กเกจ",
    subtitle: "กำหนดราคา limit และสถานะ Starter / Professional / Multi-Branch",
    icon: CreditCard,
    fields: ["แพ็กเกจ", "สินค้า", "ผู้ใช้", "ราคา"],
    rows: [["Starter", "200", "2", "฿399", "/admin/plans/starter/edit"], ["Professional", "1,500", "6", "฿899", "/admin/plans/professional/edit"], ["Multi-Branch", "3,000", "12", "฿1,790", "/admin/plans/multi-branch/edit"]]
  },
  payments: {
    title: "การชำระเงิน",
    subtitle: "ตรวจสลิป ต่ออายุ และประวัติ invoice",
    icon: CreditCard,
    fields: ["Invoice", "ร้าน", "ยอด", "สถานะ"],
    rows: [["INV-2026-00001", "Coffee Lab", "฿899", "รอตรวจ", "/admin/payments/payment-001"]]
  },
  "support-tickets": {
    title: "Support Tickets",
    subtitle: "คำขอช่วยเหลือจากร้านค้า",
    icon: Ticket,
    fields: ["เลข Ticket", "ร้าน", "หัวข้อ", "สถานะ"],
    rows: [["TCK-2026-00001", "ร้าน Demo", "เข้าใช้งานไม่ได้", "เปิด", "/admin/support-tickets/ticket-001"]]
  },
  announcements: {
    title: "ประกาศระบบ",
    subtitle: "แจ้งอัปเดต ปิดปรับปรุง หรือโปรโมชันใน dashboard ลูกค้า",
    icon: Megaphone,
    fields: ["หัวข้อ", "ประเภท", "วันที่เผยแพร่", "สถานะ"],
    rows: [["อัปเดตระบบ", "ข่าวสาร", "10 มิ.ย. 2026", "ร่าง", "/admin/announcements/new"]]
  },
  "system-logs": {
    title: "System Logs",
    subtitle: "เหตุการณ์ระบบกลางและ error logs",
    icon: ServerCog,
    fields: ["เวลา", "ระดับ", "บริการ", "ข้อความ"],
    rows: [["ตอนนี้", "info", "web", "admin page opened", "/admin/system-logs"]]
  },
  "feature-flags": {
    title: "Feature Flags",
    subtitle: "เปิดปิดความสามารถรายร้านหรือทั้งระบบ",
    icon: Flag,
    fields: ["Flag", "ขอบเขต", "สถานะ", "หมายเหตุ"],
    rows: [["new-pos", "ร้าน Professional", "on", "ทดลอง POS ใหม่", "/admin/feature-flags"]]
  },
  backups: {
    title: "Backups",
    subtitle: "ติดตาม backup และ restore ระดับระบบกลาง",
    icon: Shield,
    fields: ["เวลา", "ชนิด", "สถานะ", "ขนาด"],
    rows: [["02:00", "daily", "success", "128MB", "/admin/backups"]]
  },
  "audit-log": {
    title: "Admin Audit Log",
    subtitle: "ประวัติการกระทำของทีมแอดมิน Zentory",
    icon: Shield,
    fields: ["เวลา", "แอดมิน", "การกระทำ", "เป้าหมาย"],
    rows: [["ตอนนี้", "admin@zentory.test", "view", "dashboard", "/admin/audit-log"]]
  },
  "error-monitoring": {
    title: "Error Monitoring",
    subtitle: "ภาพรวม error จาก web, api และ worker",
    icon: ServerCog,
    fields: ["เวลา", "บริการ", "error", "จำนวน"],
    rows: [["วันนี้", "api", "Database unavailable", "0", "/admin/error-monitoring"]]
  },
  "email-templates": {
    title: "Email Templates",
    subtitle: "เทมเพลตอีเมลยืนยัน สมัครสมาชิก ต่ออายุ และแจ้งเตือน",
    icon: Mail,
    fields: ["Template", "ภาษา", "สถานะ", "แก้ไขล่าสุด"],
    rows: [["welcome", "th", "active", "10 มิ.ย. 2026", "/admin/email-templates"]]
  }
} as const;

export function AdminCenterPage({ kind }: { kind: keyof typeof adminPages }) {
  const page = adminPages[kind];
  const Icon = page.icon;
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-lg bg-white text-leaf shadow-sm"><Icon /></div>
          <div>
            <h1 className="text-3xl font-black">{page.title}</h1>
            <p className="text-stone-600">{page.subtitle}</p>
          </div>
        </div>
        {kind === "announcements" ? <Link to="/admin/announcements/new"><Button>สร้างประกาศ</Button></Link> : null}
      </div>
      <Card>
        <div className="grid gap-3 md:grid-cols-4">
          {page.fields.map((field) => <input key={field} className="field" placeholder={field} />)}
        </div>
        <Button className="mt-4">เพิ่มรายการ</Button>
      </Card>
      <div className="table-shell">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-stone-50 text-stone-500"><tr>{page.fields.map((field) => <th key={field} className="p-3">{field}</th>)}<th className="p-3">ดู</th></tr></thead>
          <tbody>
            {page.rows.map((row) => {
              const href = row[row.length - 1];
              const cells = row.slice(0, -1);
              return (
                <tr key={row.join("|")} className="border-t border-stone-100">
                  {cells.map((cell) => <td key={cell} className="p-3">{cell}</td>)}
                  <td className="p-3"><Link className="font-black text-leaf" to={href}>เปิด</Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
