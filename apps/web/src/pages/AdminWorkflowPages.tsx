import { ArrowLeft, CheckCircle2, Eye, FileText, LockKeyhole, Megaphone, ShieldAlert, UserRoundCog } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Dropdown } from "../components/Dropdown";

export function AdminCustomerDetailPage() {
  const { id } = useParams();
  return (
    <div className="space-y-5">
      <Back to="/admin/customers" label="กลับร้านค้าทั้งหมด" />
      <Header title="รายละเอียดร้านค้า" subtitle={`Tenant ID: ${id}`} icon={Eye} />
      <div className="grid gap-4 md:grid-cols-4">
        <Card><p className="text-sm text-stone-500">แพ็กเกจ</p><p className="text-2xl font-black">Pro</p></Card>
        <Card><p className="text-sm text-stone-500">ผู้ใช้</p><p className="text-2xl font-black">5 / 5</p></Card>
        <Card><p className="text-sm text-stone-500">สินค้า</p><p className="text-2xl font-black">842 / 1,000</p></Card>
        <Card><p className="text-sm text-stone-500">สถานะ</p><p className="text-2xl font-black text-leaf">Active</p></Card>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <Card>
          <h2 className="text-xl font-black">ข้อมูลร้าน</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <input className="field" defaultValue="Coffee Lab" />
            <input className="field" defaultValue="coffee@example.com" />
            <input className="field" defaultValue="กรุงเทพมหานคร" />
            <input className="field" defaultValue="ค้าปลีก / คาเฟ่" />
          </div>
          <Button className="mt-4">บันทึกข้อมูลร้าน</Button>
        </Card>
        <Card>
          <h2 className="text-xl font-black">Admin Actions</h2>
          <div className="mt-4 space-y-2">
            <Button className="w-full" variant="secondary">ต่ออายุ 30 วัน</Button>
            <Button className="w-full" variant="secondary">เปลี่ยนเป็น Pro</Button>
            <Link to="/admin/impersonation"><Button className="w-full">เข้าใช้งานแทนร้าน</Button></Link>
            <Button className="w-full" variant="danger">ระงับร้าน</Button>
          </div>
        </Card>
      </div>
      <Card>
        <h2 className="text-xl font-black">Usage Timeline</h2>
        <Timeline items={["สมัครใช้งาน", "อัปเกรดเป็น Pro", "เพิ่มผู้ใช้คนที่ 5", "รอชำระรอบถัดไป"]} />
      </Card>
    </div>
  );
}

export function AdminUserDetailPage() {
  const { id } = useParams();
  return (
    <div className="space-y-5">
      <Back to="/admin/users" label="กลับผู้ใช้ทั้งหมด" />
      <Header title="รายละเอียดผู้ใช้" subtitle={`User ID: ${id}`} icon={UserRoundCog} />
      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <Card>
          <h2 className="text-xl font-black">Account</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <input className="field" defaultValue="Demo Owner" />
            <input className="field" defaultValue="owner@demo.test" />
            <input className="field" defaultValue="OWNER" />
            <input className="field" defaultValue="ร้าน Demo Market" />
          </div>
          <Button className="mt-4">บันทึกผู้ใช้</Button>
        </Card>
        <Card>
          <h2 className="text-xl font-black">Security Actions</h2>
          <div className="mt-4 space-y-2">
            <Button className="w-full" variant="secondary">ส่ง reset password</Button>
            <Button className="w-full" variant="secondary">บังคับ logout</Button>
            <Button className="w-full" variant="danger">ปิดบัญชี</Button>
          </div>
        </Card>
      </div>
      <Card>
        <h2 className="text-xl font-black">Login History</h2>
        <Timeline items={["เข้าสู่ระบบจาก Chrome", "เปลี่ยนรหัสผ่าน", "เชิญพนักงาน", "ออกจากระบบ"]} />
      </Card>
    </div>
  );
}

export function AdminTicketDetailPage() {
  const { id } = useParams();
  return (
    <div className="space-y-5">
      <Back to="/admin/support-tickets" label="กลับ Support Tickets" />
      <Header title="รายละเอียด Ticket" subtitle={`Ticket ID: ${id}`} icon={ShieldAlert} />
      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <Card>
          <h2 className="text-xl font-black">เข้าใช้งานไม่ได้</h2>
          <p className="mt-2 text-stone-600">ลูกค้าแจ้งว่า login แล้วกลับมาหน้าเดิม ต้องการให้ทีมตรวจสอบ token/session</p>
          <textarea className="field mt-5" rows={5} placeholder="ตอบลูกค้า..." />
          <div className="mt-4 flex gap-3">
            <Button>ส่งคำตอบ</Button>
            <Button variant="secondary">บันทึก internal note</Button>
          </div>
        </Card>
        <Card>
          <h2 className="text-xl font-black">Ticket Control</h2>
          <div className="mt-4 space-y-3">
            <Dropdown
              defaultValue="open"
              options={[
                { value: "open", label: "เปิด" },
                { value: "pending", label: "รอลูกค้า" },
                { value: "closed", label: "ปิด" }
              ]}
            />
            <Dropdown
              defaultValue="high"
              options={[
                { value: "high", label: "High" },
                { value: "normal", label: "Normal" }
              ]}
            />
            <input className="field" defaultValue="Support Team" />
            <Button className="w-full">อัปเดต Ticket</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

export function AdminPaymentApprovalPage() {
  const { id } = useParams();
  return (
    <div className="space-y-5">
      <Back to="/admin/payments" label="กลับการชำระเงิน" />
      <Header title="ตรวจการชำระเงิน" subtitle={`Payment ID: ${id}`} icon={FileText} />
      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <Card>
          <h2 className="text-xl font-black">Invoice INV-2026-00001</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <p><b>ร้าน:</b> Coffee Lab</p>
            <p><b>แพ็กเกจ:</b> Pro</p>
            <p><b>ยอด:</b> ฿590</p>
            <p><b>สถานะ:</b> รอตรวจ</p>
          </div>
          <div className="mt-5 rounded-lg border border-dashed border-stone-300 p-8 text-center">
            <p className="text-2xl font-black">Slip Preview</p>
            <p className="text-sm text-stone-500">พื้นที่แสดงรูปสลิปเมื่อ backend storage พร้อม</p>
          </div>
        </Card>
        <Card>
          <h2 className="text-xl font-black">Approval</h2>
          <textarea className="field mt-4" rows={4} placeholder="หมายเหตุสำหรับ audit log" />
          <div className="mt-4 space-y-2">
            <Button className="w-full" icon={<CheckCircle2 size={16} />}>อนุมัติและต่ออายุ</Button>
            <Button className="w-full" variant="secondary">ขอหลักฐานเพิ่ม</Button>
            <Button className="w-full" variant="danger">ปฏิเสธ</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

export function AdminAnnouncementComposerPage() {
  return (
    <div className="space-y-5">
      <Back to="/admin/announcements" label="กลับประกาศระบบ" />
      <Header title="สร้างประกาศระบบ" subtitle="ส่งข่าวสารไปยัง dashboard ลูกค้า" icon={Megaphone} />
      <Card>
        <div className="grid gap-4 md:grid-cols-2">
          <input className="field" placeholder="หัวข้อประกาศ" />
          <Dropdown
            defaultValue="maintenance"
            options={[
              { value: "maintenance", label: "Maintenance" },
              { value: "feature", label: "Feature Update" },
              { value: "promo", label: "Promotion" }
            ]}
          />
          <Dropdown
            defaultValue="all"
            options={[
              { value: "all", label: "ทุกร้าน" },
              { value: "pro", label: "เฉพาะ Pro" },
              { value: "free", label: "เฉพาะ Free" }
            ]}
          />
          <input className="field" type="datetime-local" />
          <textarea className="field md:col-span-2" rows={8} placeholder="เนื้อหาประกาศ" />
        </div>
        <div className="mt-4 flex gap-3">
          <Button>Publish</Button>
          <Button variant="secondary">Save Draft</Button>
        </div>
      </Card>
    </div>
  );
}

export function AdminPlanEditorPage() {
  const { id } = useParams();
  return (
    <div className="space-y-5">
      <Back to="/admin/plans" label="กลับแพ็กเกจ" />
      <Header title="แก้ไขแพ็กเกจ" subtitle={`Plan: ${id}`} icon={FileText} />
      <Card>
        <div className="grid gap-4 md:grid-cols-2">
          <input className="field" defaultValue={id === "pro" ? "Pro" : "Free"} />
          <input className="field" type="number" defaultValue={id === "pro" ? 590 : 0} />
          <input className="field" type="number" defaultValue={id === "pro" ? 1000 : 30} />
          <input className="field" type="number" defaultValue={id === "pro" ? 5 : 1} />
          <textarea className="field md:col-span-2" rows={5} defaultValue="POS, รายงานพื้นฐาน, แจ้งเตือนสินค้าใกล้หมด" />
        </div>
        <Button className="mt-4">บันทึกแพ็กเกจ</Button>
      </Card>
    </div>
  );
}

export function AdminImpersonationPage() {
  return (
    <div className="space-y-5">
      <Header title="เข้าใช้งานแทนร้าน" subtitle="ทุกครั้งต้องมีเหตุผลและบันทึก audit log" icon={LockKeyhole} />
      <Card className="max-w-3xl">
        <div className="grid gap-4 md:grid-cols-2">
          <input className="field" placeholder="เลือกร้าน / tenant id" defaultValue="coffee-lab" />
          <input className="field" placeholder="ระยะเวลา session" defaultValue="15 นาที" />
          <textarea className="field md:col-span-2" rows={4} placeholder="เหตุผล เช่น ช่วยลูกค้าตรวจปัญหา POS" />
        </div>
        <div className="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          การ impersonate ต้องแสดง banner ในหน้าร้าน และบันทึก admin, เวลา, tenant, เหตุผล, IP ลง audit log
        </div>
        <Button className="mt-4">เริ่ม session แบบมี audit</Button>
      </Card>
    </div>
  );
}

function Header({ title, subtitle, icon: Icon }: { title: string; subtitle: string; icon: typeof Eye }) {
  return (
    <div className="flex items-start gap-3">
      <div className="grid h-11 w-11 place-items-center rounded-lg bg-white text-leaf shadow-sm"><Icon /></div>
      <div>
        <h1 className="text-3xl font-black">{title}</h1>
        <p className="text-stone-600">{subtitle}</p>
      </div>
    </div>
  );
}

function Back({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="inline-flex items-center gap-2 text-sm font-black text-stone-500">
      <ArrowLeft size={16} />
      {label}
    </Link>
  );
}

function Timeline({ items }: { items: string[] }) {
  return (
    <div className="mt-4 space-y-2">
      {items.map((item) => (
        <div key={item} className="rounded-md border border-stone-200 p-3 text-sm font-semibold">{item}</div>
      ))}
    </div>
  );
}
