import { useQuery } from "@tanstack/react-query";
import { Box, ChevronDown, CreditCard, HelpCircle, LayoutDashboard, LogOut, Menu, Shield, UserCircle, X } from "lucide-react";
import type { ComponentProps } from "react";
import { useEffect, useRef, useState } from "react";
import { Link as RouterLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
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

type CurrentBusiness = {
  subscription?: {
    plan?: {
      name: string;
    };
  };
};

export function PublicLayout() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const session = useAuth((state) => state.session);
  const clear = useAuth((state) => state.clear);
  const navigate = useNavigate();
  const location = useLocation();
  const userName = session?.user.name ?? "ผู้ใช้";
  const userEmail = session?.user.email ?? "";
  const storeName = session?.business?.name ?? "ยังไม่มีร้าน";
  const showAdminLink = Boolean(session?.user.isSystemAdmin);
  const isCheckoutPage = location.pathname.startsWith("/checkout");
  const business = useQuery({
    queryKey: ["business"],
    queryFn: () => api<CurrentBusiness>("/businesses/current"),
    enabled: Boolean(session?.business)
  });
  const planName = business.data?.subscription?.plan?.name ?? (business.isLoading && session?.business ? "แพ็กเกจ..." : "-");

  useEffect(() => {
    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (!userMenuRef.current?.contains(event.target as Node)) setIsUserMenuOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, []);

  function closeMenus() {
    setIsMenuOpen(false);
    setIsUserMenuOpen(false);
  }

  function signOut() {
    closeMenus();
    clear();
    navigate("/login");
  }

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

          {!isCheckoutPage ? (
            <nav className="hidden items-center gap-1 lg:flex" aria-label="เมนูหน้าแรก">
              {links.map(([href, label]) => (
                <a key={href} href={href} className="rounded-md px-3 py-2 text-sm font-semibold text-stone-600 hover:bg-stone-100 hover:text-ink">
                  {label}
                </a>
              ))}
            </nav>
          ) : <div className="hidden lg:block" />}

          {session ? (
            <div className="hidden items-center gap-3 lg:flex">
              <Link to="/app/dashboard">
                <Button icon={<LayoutDashboard size={16} />}>ไป Dashboard</Button>
              </Link>
              <div className="relative" ref={userMenuRef}>
                <button
                  type="button"
                  className="flex h-10 items-center gap-2 rounded-md border border-stone-200 bg-white px-3 text-ink hover:bg-stone-50"
                  aria-label="เมนูผู้ใช้"
                  aria-expanded={isUserMenuOpen}
                  aria-haspopup="menu"
                  onClick={() => setIsUserMenuOpen((open) => !open)}
                >
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-teal-50 text-sm font-black text-leaf">{userName.slice(0, 1).toUpperCase()}</span>
                  <span className="max-w-28 truncate text-sm font-semibold">{userName}</span>
                  <span className="shrink-0 rounded bg-teal-50 px-2 py-0.5 text-xs font-bold text-leaf">{planName}</span>
                  <ChevronDown size={16} className={`text-stone-500 transition ${isUserMenuOpen ? "rotate-180" : ""}`} />
                </button>

                <div
                  className={`absolute right-0 mt-2 w-64 overflow-hidden rounded-lg border border-stone-200 bg-white shadow-soft transition ${
                    isUserMenuOpen ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-1 opacity-0"
                  }`}
                  role="menu"
                >
                  <div className="border-b border-stone-100 p-3">
                    <p className="truncate text-sm font-black text-ink">{userName}</p>
                    <p className="truncate text-xs text-stone-500">{userEmail}</p>
                    <p className="mt-2 truncate rounded bg-stone-50 px-2 py-1 text-xs font-semibold text-stone-600">{storeName}</p>
                  </div>
                  <Link to="/app/profile" className="flex items-center gap-2 px-3 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50" role="menuitem" onClick={() => setIsUserMenuOpen(false)}>
                    <UserCircle size={17} className="text-stone-500" />
                    โปรไฟล์
                  </Link>
                  <Link to="/app/profile/billing" className="flex items-center gap-2 px-3 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50" role="menuitem" onClick={() => setIsUserMenuOpen(false)}>
                    <CreditCard size={17} className="text-stone-500" />
                    แพ็กเกจบัญชี
                  </Link>
                  <Link to="/app/support" className="flex items-center gap-2 px-3 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50" role="menuitem" onClick={() => setIsUserMenuOpen(false)}>
                    <HelpCircle size={17} className="text-stone-500" />
                    ช่วยเหลือ
                  </Link>
                  {showAdminLink ? (
                    <Link to="/admin" className="flex items-center gap-2 px-3 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50" role="menuitem" onClick={() => setIsUserMenuOpen(false)}>
                      <Shield size={17} className="text-stone-500" />
                      ระบบ Admin
                    </Link>
                  ) : null}
                  <button type="button" className="flex w-full items-center gap-2 border-t border-stone-100 px-3 py-2.5 text-left text-sm font-semibold text-red-700 hover:bg-red-50" role="menuitem" onClick={signOut}>
                    <LogOut size={17} />
                    ออกจากระบบ
                  </button>
                </div>
              </div>
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
            {!isCheckoutPage ? links.map(([href, label]) => (
              <a
                key={href}
                href={href}
                className="rounded-md px-3 py-3 text-sm font-semibold text-stone-700 hover:bg-stone-100"
                onClick={() => setIsMenuOpen(false)}
              >
                {label}
              </a>
            )) : null}
            {session ? (
              <>
                <div className="mt-2 rounded-md border border-stone-200 bg-stone-50 p-3">
                  <p className="text-xs font-semibold text-stone-500">กำลังใช้งาน</p>
                  <p className="truncate text-sm font-black text-ink">{userName}</p>
                  <p className="mt-1 inline-flex rounded bg-teal-50 px-2 py-0.5 text-xs font-bold text-leaf">{planName}</p>
                  <p className="truncate text-xs text-stone-500">{userEmail}</p>
                </div>
                <Link to="/app/dashboard" className="mt-2" onClick={closeMenus}>
                  <Button className="w-full" icon={<LayoutDashboard size={16} />}>
                    ไป Dashboard
                  </Button>
                </Link>
                <Link to="/app/profile" className="flex items-center gap-2 rounded-md px-3 py-3 text-sm font-semibold text-stone-700 hover:bg-stone-100" onClick={closeMenus}>
                  <UserCircle size={17} className="text-stone-500" />
                  โปรไฟล์
                </Link>
                <Link to="/app/profile/billing" className="flex items-center gap-2 rounded-md px-3 py-3 text-sm font-semibold text-stone-700 hover:bg-stone-100" onClick={closeMenus}>
                  <CreditCard size={17} className="text-stone-500" />
                  แพ็กเกจบัญชี
                </Link>
                <Link to="/app/support" className="flex items-center gap-2 rounded-md px-3 py-3 text-sm font-semibold text-stone-700 hover:bg-stone-100" onClick={closeMenus}>
                  <HelpCircle size={17} className="text-stone-500" />
                  ช่วยเหลือ
                </Link>
                {showAdminLink ? (
                  <Link to="/admin" className="flex items-center gap-2 rounded-md px-3 py-3 text-sm font-semibold text-stone-700 hover:bg-stone-100" onClick={closeMenus}>
                    <Shield size={17} className="text-stone-500" />
                    ระบบ Admin
                  </Link>
                ) : null}
                <button type="button" className="flex items-center gap-2 rounded-md px-3 py-3 text-left text-sm font-semibold text-red-700 hover:bg-red-50" onClick={signOut}>
                  <LogOut size={17} />
                  ออกจากระบบ
                </button>
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
