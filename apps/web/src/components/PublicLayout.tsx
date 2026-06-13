import { Box, LayoutDashboard, Menu, UserCircle, X } from "lucide-react";
import type { ComponentProps } from "react";
import { useState } from "react";
import { Link as RouterLink, Outlet } from "react-router-dom";
import { useAuth } from "../state/auth";
import { Button } from "./Button";

const links = [
  ["#features", "ฟีเจอร์"],
  ["#stores", "เหมาะกับใคร"],
  ["#pricing", "ราคา"],
  ["#faq", "FAQ"]
];

function Link({ to, ...props }: ComponentProps<typeof RouterLink>) {
  const session = useAuth((state) => state.session);
  const target = session && (to === "/login" || to === "/register") ? "/app/dashboard" : to;
  return <RouterLink to={target} {...props} />;
}

export function PublicLayout() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const session = useAuth((state) => state.session);

  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-white/95 shadow-[0_1px_0_rgba(17,24,39,0.02)] backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 lg:h-[72px] lg:px-6">
          <Link to="/" className="flex items-center gap-2 text-xl font-black text-ink" onClick={() => setIsMenuOpen(false)}>
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-leaf text-white">
              <Box size={19} />
            </span>
            Zentory
          </Link>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="เมนูหน้าแรก">
            {links.map(([href, label]) => (
              <a key={href} href={href} className="rounded-md px-3 py-2 text-sm font-semibold text-stone-600 hover:bg-stone-100 hover:text-ink">
                {label}
              </a>
            ))}
          </nav>

          {session ? (
            <div className="hidden items-center gap-3 lg:flex">
              <div className="flex min-w-0 items-center gap-2 rounded-md border border-stone-200 bg-stone-50 px-3 py-2">
                <UserCircle size={18} className="shrink-0 text-leaf" />
                <div className="min-w-0 text-left">
                  <p className="truncate text-xs font-semibold leading-tight text-stone-500">กำลังใช้งาน</p>
                  <p className="max-w-36 truncate text-sm font-black leading-tight text-ink">{session.user.name}</p>
                </div>
              </div>
              <Link to="/app/dashboard">
                <Button icon={<LayoutDashboard size={16} />}>ไป Dashboard</Button>
              </Link>
            </div>
          ) : (
            <div className="hidden items-center gap-2 lg:flex">
              <Link to="/login">
                <Button variant="secondary">เข้าสู่ระบบ</Button>
              </Link>
              <Link to="/register">
                <Button>เริ่มใช้งานฟรี</Button>
              </Link>
            </div>
          )}

          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-md border border-stone-200 bg-white text-ink shadow-sm lg:hidden"
            aria-label={isMenuOpen ? "ปิดเมนู" : "เปิดเมนู"}
            aria-expanded={isMenuOpen}
            onClick={() => setIsMenuOpen((open) => !open)}
          >
            {isMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <div className={`border-t border-stone-200 bg-white px-5 py-4 lg:hidden ${isMenuOpen ? "block" : "hidden"}`}>
          <nav className="mx-auto flex max-w-6xl flex-col gap-1" aria-label="เมนูหน้าแรกบนมือถือ">
            {links.map(([href, label]) => (
              <a
                key={href}
                href={href}
                className="rounded-md px-3 py-3 text-sm font-semibold text-stone-700 hover:bg-stone-100"
                onClick={() => setIsMenuOpen(false)}
              >
                {label}
              </a>
            ))}
            {session ? (
              <>
                <div className="mt-2 rounded-md border border-stone-200 bg-stone-50 p-3">
                  <p className="text-xs font-semibold text-stone-500">กำลังใช้งาน</p>
                  <p className="truncate text-sm font-black text-ink">{session.user.name}</p>
                  <p className="truncate text-xs text-stone-500">{session.business?.name}</p>
                </div>
                <Link to="/app/dashboard" className="mt-2" onClick={() => setIsMenuOpen(false)}>
                  <Button className="w-full" icon={<LayoutDashboard size={16} />}>
                    ไป Dashboard
                  </Button>
                </Link>
              </>
            ) : (
              <>
                <Link to="/login" className="rounded-md px-3 py-3 text-sm font-semibold text-stone-700 hover:bg-stone-100" onClick={() => setIsMenuOpen(false)}>
                  เข้าสู่ระบบ
                </Link>
                <Link to="/register" className="mt-2" onClick={() => setIsMenuOpen(false)}>
                  <Button className="w-full">เริ่มใช้งานฟรี</Button>
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
