import { ArrowLeft, Building2, CreditCard, Flag, LayoutDashboard, LifeBuoy, Mail, Megaphone, Menu, ServerCog, Shield, Users, X } from "lucide-react";
import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { Button } from "./Button";

const adminNav = [
  { to: "/admin", label: "Admin Dashboard", icon: LayoutDashboard },
  { to: "/admin/customers", label: "ร้านค้าทั้งหมด", icon: Building2 },
  { to: "/admin/users", label: "ผู้ใช้ทั้งหมด", icon: Users },
  { to: "/admin/plans", label: "แพ็กเกจ", icon: CreditCard },
  { to: "/admin/payments", label: "การชำระเงิน", icon: CreditCard },
  { to: "/admin/support-tickets", label: "Support Tickets", icon: LifeBuoy },
  { to: "/admin/announcements", label: "ประกาศ", icon: Megaphone },
  { to: "/admin/system-logs", label: "System Logs", icon: ServerCog },
  { to: "/admin/feature-flags", label: "Feature Flags", icon: Flag },
  { to: "/admin/backups", label: "Backups", icon: Shield },
  { to: "/admin/audit-log", label: "Audit Log", icon: Shield },
  { to: "/admin/error-monitoring", label: "Error Monitoring", icon: ServerCog },
  { to: "/admin/email-templates", label: "Email Templates", icon: Mail }
];

export function AdminShell() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const sidebar = <AdminSidebarContent onNavigate={() => setIsSidebarOpen(false)} />;

  return (
    <div className="min-h-screen bg-[#f4f1ea] text-ink">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-72 overflow-y-auto border-r border-stone-300 bg-[#111814] p-4 text-white lg:block">
        {sidebar}
      </aside>

      <div
        className={`fixed inset-0 z-40 bg-black/50 transition lg:hidden ${isSidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
        aria-hidden="true"
        onClick={() => setIsSidebarOpen(false)}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[min(20rem,86vw)] overflow-y-auto border-r border-stone-700 bg-[#111814] p-4 text-white shadow-2xl transition-transform duration-200 lg:hidden ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="เมนู admin"
      >
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-md border border-white/15 text-stone-100"
            aria-label="ปิดเมนู"
            onClick={() => setIsSidebarOpen(false)}
          >
            <X size={20} />
          </button>
        </div>
        {sidebar}
      </aside>

      <main className="lg:pl-72">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-stone-300 bg-[#f4f1ea]/95 px-4 backdrop-blur lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-stone-300 bg-white text-ink shadow-sm lg:hidden"
              aria-label="เปิดเมนู admin"
              aria-expanded={isSidebarOpen}
              onClick={() => setIsSidebarOpen(true)}
            >
              <Menu size={20} />
            </button>
            <div className="min-w-0">
              <p className="truncate text-xs font-black uppercase tracking-[0.18em] text-stone-500">SaaS Operations</p>
              <p className="truncate font-black">Zentory Admin</p>
            </div>
          </div>
          <Link to="/app/dashboard">
            <Button variant="secondary" icon={<ArrowLeft size={16} />}>
              กลับหน้าร้าน
            </Button>
          </Link>
        </header>
        <div className="p-4 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function AdminSidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      <div className="mb-7 px-2">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-300">Zentory HQ</p>
        <h1 className="mt-2 text-2xl font-black">Control Room</h1>
        <p className="mt-1 text-sm text-stone-300">ศูนย์ดูแลร้านค้า แพ็กเกจ และระบบกลาง</p>
      </div>
      <nav className="space-y-1">
        {adminNav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/admin"}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold transition ${
                isActive ? "bg-amber-300 text-ink" : "text-stone-200 hover:bg-white/10"
              }`
            }
          >
            <item.icon size={18} className="shrink-0" />
            <span className="truncate">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </>
  );
}
