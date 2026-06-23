import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowUpRight, Building2, CreditCard, LifeBuoy, Store, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { api, patch } from "../lib/api";
import { thaiDate } from "../lib/format";

type Business = {
  id: string;
  name: string;
  createdAt?: string;
  subscription?: { plan: { name: string } };
  members: unknown[];
};

const fallbackBusinesses: Business[] = [
  { id: "demo-market", name: "ร้าน Demo Market", createdAt: new Date().toISOString(), subscription: { plan: { name: "Starter" } }, members: [{}, {}] },
  { id: "coffee-lab", name: "Coffee Lab", createdAt: new Date().toISOString(), subscription: { plan: { name: "Professional" } }, members: [{}, {}, {}] },
  { id: "mini-mart", name: "Mini Mart สาขา 1", createdAt: new Date().toISOString(), subscription: { plan: { name: "Starter" } }, members: [{}] }
];

export function AdminPage() {
  const queryClient = useQueryClient();
  const businesses = useQuery({
    queryKey: ["admin-businesses"],
    queryFn: () => api<Business[]>("/admin/businesses"),
    retry: false
  });
  const rows = businesses.data?.length ? businesses.data : fallbackBusinesses;
  const mutation = useMutation({
    mutationFn: ({ id, planCode }: { id: string; planCode: string }) => patch(`/admin/businesses/${id}/subscription`, { planCode }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-businesses"] })
  });

  const activeStores = rows.length;
  const totalUsers = rows.reduce((sum, business) => sum + business.members.length, 0);
  const professionalStores = rows.filter((business) => business.subscription?.plan.name === "Professional").length;

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-lg bg-[#111814] p-6 text-white shadow-soft">
          <p className="text-sm font-black uppercase tracking-[0.2em] text-amber-300">Admin Dashboard</p>
          <h1 className="mt-3 text-4xl font-black">ศูนย์ควบคุม Zentory</h1>
          <p className="mt-3 max-w-2xl text-stone-300">
            ดูสถานะร้านค้า แพ็กเกจ การชำระเงิน และงาน support สำคัญในหน้าจอเดียว
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/admin/support-tickets"><Button>ดู Ticket</Button></Link>
            <Link to="/admin/announcements/new"><Button variant="secondary">สร้างประกาศ</Button></Link>
          </div>
        </div>
        <Card className="bg-white">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-amber-700" />
            <div>
              <h2 className="text-xl font-black">งานที่ควรดูวันนี้</h2>
              <p className="mt-2 text-sm text-stone-600">ร้านใกล้หมดอายุ, ticket ค้างตอบ, และ payment manual ที่รอตรวจ</p>
            </div>
          </div>
          <div className="mt-5 space-y-2 text-sm">
            {[
              ["ตรวจสลิปแพ็กเกจ Professional", "/admin/payments/payment-001"],
              ["ตอบ ticket ลูกค้าใหม่", "/admin/support-tickets/ticket-001"],
              ["ประกาศ maintenance รอบถัดไป", "/admin/announcements/new"]
            ].map(([label, to]) => (
              <Link key={label} to={to} className="flex items-center justify-between rounded-md border border-stone-200 p-3 font-semibold hover:border-leaf">
                {label}
                <ArrowUpRight size={16} />
              </Link>
            ))}
          </div>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <Metric icon={Store} label="ร้านทั้งหมด" value={String(activeStores)} />
        <Metric icon={Users} label="ผู้ใช้ทั้งหมด" value={String(totalUsers)} />
        <Metric icon={CreditCard} label="ร้าน Professional" value={String(professionalStores)} />
        <Metric icon={LifeBuoy} label="Ticket เปิด" value="3" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-black">ร้านค้าทั้งหมด</h2>
              <p className="text-sm text-stone-600">จัดการแพ็กเกจและสถานะร้านค้าแบบ manual</p>
            </div>
            <Link to="/admin/customers" className="hidden text-sm font-black text-leaf md:inline-flex">ดูทั้งหมด</Link>
          </div>
          <div className="table-shell border-0">
            <table className="w-full min-w-[840px] text-left text-sm">
              <thead className="bg-stone-50 text-stone-500">
                <tr><th className="p-3">ร้าน</th><th className="p-3">สมาชิก</th><th className="p-3">แพ็กเกจ</th><th className="p-3">สมัครเมื่อ</th><th className="p-3">จัดการ</th></tr>
              </thead>
              <tbody>
                {rows.map((business) => (
                  <tr key={business.id} className="border-t border-stone-100">
                    <td className="p-3 font-bold"><Link className="text-leaf" to={`/admin/customers/${business.id}`}>{business.name}</Link></td>
                    <td className="p-3">{business.members.length}</td>
                    <td className="p-3"><span className="rounded bg-stone-100 px-2 py-1 text-xs font-black">{business.subscription?.plan.name ?? "-"}</span></td>
                    <td className="p-3">{business.createdAt ? thaiDate(business.createdAt) : "-"}</td>
                    <td className="p-3">
	                      <div className="flex gap-2">
	                        <Button variant="secondary" onClick={() => mutation.mutate({ id: business.id, planCode: "STARTER" })}>Starter</Button>
	                        <Button onClick={() => mutation.mutate({ id: business.id, planCode: "PROFESSIONAL" })}>Professional</Button>
	                        <Button variant="secondary" onClick={() => mutation.mutate({ id: business.id, planCode: "MULTI_BRANCH" })}>Multi-Branch</Button>
	                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card>
          <h2 className="text-xl font-black">ทางลัดแอดมิน</h2>
          <div className="mt-4 space-y-2">
            {[
              ["/admin/plans/professional/edit", "แก้แพ็กเกจ Professional"],
              ["/admin/payments/payment-001", "ตรวจการชำระเงิน"],
              ["/admin/impersonation", "เข้าใช้งานแทนร้าน"],
              ["/admin/system-logs", "ดู system logs"]
            ].map(([to, label]) => (
              <Link key={to} to={to} className="flex items-center justify-between rounded-md border border-stone-200 p-3 text-sm font-black hover:border-leaf">
                {label}
                <ArrowUpRight size={16} />
              </Link>
            ))}
          </div>
        </Card>
      </section>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Building2; label: string; value: string }) {
  return (
    <Card>
      <Icon className="text-leaf" />
      <p className="mt-4 text-sm font-semibold text-stone-500">{label}</p>
      <p className="text-3xl font-black">{value}</p>
    </Card>
  );
}
