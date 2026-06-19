import { ArrowLeft, LogOut } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../state/auth";

type Props = {
  backTo?: string;
  backLabel?: string;
};

export function OnboardingTopbar({ backTo, backLabel = "ย้อนกลับ" }: Props) {
  const navigate = useNavigate();
  const session = useAuth((state) => state.session);
  const clear = useAuth((state) => state.clear);

  function signOut() {
    clear();
    navigate("/login");
  }

  return (
    <header className="border-b border-stone-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-5">
        <div className="flex min-w-0 items-center gap-4">
          {backTo ? (
            <Link to={backTo} className="inline-flex items-center gap-2 rounded-md px-2.5 py-2 text-sm font-bold text-moss transition hover:bg-stone-100 hover:text-leaf">
              <ArrowLeft size={16} />
              <span className="hidden sm:inline">{backLabel}</span>
            </Link>
          ) : null}
          <Link to="/" className="flex min-w-0 items-center gap-2 text-lg font-black text-ink">
            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-leaf text-sm text-white">Z</span>
            <span className="truncate">Zentory</span>
          </Link>
        </div>

        <div className="flex min-w-0 items-center gap-3">
          <div className="hidden min-w-0 text-right sm:block">
            <p className="truncate text-sm font-black text-ink">{session?.user.name ?? "ผู้ใช้"}</p>
            <p className="truncate text-xs text-stone-500">{session?.user.email ?? ""}</p>
          </div>
          <button
            type="button"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-stone-300 bg-white px-3 text-sm font-bold text-stone-700 transition hover:bg-stone-50 hover:text-red-700"
            onClick={signOut}
          >
            <LogOut size={16} />
            <span className="hidden sm:inline">ออกจากระบบ</span>
          </button>
        </div>
      </div>
    </header>
  );
}
