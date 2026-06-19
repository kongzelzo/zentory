import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Eye, EyeOff, LockKeyhole, Mail, User } from "lucide-react";
import type { AuthSession } from "@zentory/shared";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { post } from "../lib/api";
import { getPostAuthPath } from "../lib/onboarding";
import { useAuth } from "../state/auth";

type LoginErrors = {
  email?: string;
  password?: string;
};

type GoogleCredentialResponse = {
  credential?: string;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: { client_id: string; callback: (response: GoogleCredentialResponse) => void }) => void;
          renderButton: (element: HTMLElement, options: { theme: "outline"; size: "large"; shape: "rectangular"; text: "signin_with"; width: number }) => void;
        };
      };
    };
  }
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginPage() {
  const navigate = useNavigate();
  const session = useAuth((state) => state.session);
  const setSession = useAuth((state) => state.setSession);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<LoginErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

  useEffect(() => {
    if (!googleClientId || !googleButtonRef.current) return;
    const clientId = googleClientId;

    let isMounted = true;
    function renderGoogleButton() {
      if (!isMounted || !window.google || !googleButtonRef.current) return;
      googleButtonRef.current.innerHTML = "";
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleGoogleCredential
      });
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: "outline",
        size: "large",
        shape: "rectangular",
        text: "signin_with",
        width: googleButtonRef.current.offsetWidth || 352
      });
    }

    const existingScript = document.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]');
    if (existingScript) {
      if (window.google) renderGoogleButton();
      else existingScript.addEventListener("load", renderGoogleButton, { once: true });
    } else {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.addEventListener("load", renderGoogleButton, { once: true });
      document.head.appendChild(script);
    }

    return () => {
      isMounted = false;
    };
  }, [googleClientId]);

  if (session) return <Navigate to={getPostAuthPath(session)} replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const nextErrors: LoginErrors = {};

    if (!email) nextErrors.email = "กรุณากรอกอีเมล";
    if (!password) nextErrors.password = "กรุณากรอกรหัสผ่าน";

    setFieldErrors(nextErrors);
    setError("");
    if (Object.keys(nextErrors).length > 0) return;

    setIsSubmitting(true);
    try {
      const session = await post<AuthSession>("/auth/login", { email, password });
      setSession(session);
      navigate(getPostAuthPath(session));
    } catch (err) {
      setError(err instanceof Error ? err.message : "เข้าสู่ระบบไม่สำเร็จ");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGoogleCredential(response: GoogleCredentialResponse) {
    if (!response.credential) {
      setError("เข้าสู่ระบบด้วย Google ไม่สำเร็จ");
      return;
    }

    setError("");
    setFieldErrors({});
    setIsGoogleSubmitting(true);
    try {
      const session = await post<AuthSession>("/auth/google", { credential: response.credential });
      setSession(session);
      navigate(getPostAuthPath(session));
    } catch (err) {
      setError(err instanceof Error ? err.message : "เข้าสู่ระบบด้วย Google ไม่สำเร็จ");
    } finally {
      setIsGoogleSubmitting(false);
    }
  }

  return (
    <main className="mx-auto grid min-h-[70vh] max-w-md place-items-center px-5 py-10">
      <Card className="w-full p-6 shadow-soft">
        <div className="mb-6">
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-moss transition hover:text-leaf">
            <ArrowLeft size={16} />
            กลับหน้าแรก
          </Link>
        </div>

        <div className="mb-7 text-center">
          <div className="mx-auto mb-3 grid size-12 place-items-center rounded-lg bg-leaf text-lg font-black text-white shadow-sm">Z</div>
          <p className="text-lg font-black text-ink">Zentory</p>
          <p className="mt-1 text-sm font-semibold text-moss">ระบบจัดการสต็อกสินค้า</p>
          <h1 className="mt-5 text-3xl font-black text-ink">เข้าสู่ระบบ</h1>
          <p className="mt-2 text-sm leading-6 text-stone-600">เข้าสู่ระบบเพื่อจัดการสินค้า สต็อก และยอดขายของร้านคุณ</p>
        </div>

        <form onSubmit={submit} noValidate className="space-y-4">
          <label className="block">
            <span className="text-sm font-semibold text-ink">อีเมล</span>
            <div className="relative mt-1">
              <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
              <input
                className="field field-with-left-icon"
                name="email"
                type="email"
                autoComplete="email"
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? "login-email-error" : undefined}
              />
            </div>
            {fieldErrors.email ? <span id="login-email-error" className="mt-1 block text-sm font-semibold text-red-700">{fieldErrors.email}</span> : null}
          </label>

          <label className="block">
            <span className="flex items-center justify-between gap-3 text-sm font-semibold text-ink">
              รหัสผ่าน
              <Link className="text-sm font-semibold text-leaf hover:text-teal-800" to="/forgot-password">
                ลืมรหัสผ่าน?
              </Link>
            </span>
            <div className="relative mt-1">
              <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
              <input
                className="field field-with-both-icons"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                aria-invalid={Boolean(fieldErrors.password)}
                aria-describedby={fieldErrors.password ? "login-password-error" : undefined}
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 grid size-6 -translate-y-1/2 place-items-center text-stone-500 transition hover:text-leaf"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {fieldErrors.password ? <span id="login-password-error" className="mt-1 block text-sm font-semibold text-red-700">{fieldErrors.password}</span> : null}
          </label>

          <label className="flex items-center gap-2 text-sm font-semibold text-stone-700">
            <input className="size-4 rounded border-stone-300 accent-leaf" name="remember" type="checkbox" />
            จำฉันไว้
          </label>

          {error ? <p className="rounded-md bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p> : null}

          <div className="space-y-3">
            <div className="flex items-center gap-3 text-xs font-semibold text-stone-400">
              <span className="h-px flex-1 bg-stone-200" />
              <span>หรือเข้าสู่ระบบด้วย</span>
              <span className="h-px flex-1 bg-stone-200" />
            </div>
            {googleClientId ? (
              <div ref={googleButtonRef} className={isGoogleSubmitting ? "pointer-events-none opacity-60" : undefined} />
            ) : (
              <button
                type="button"
                className="flex h-11 w-full cursor-not-allowed items-center justify-center gap-3 rounded-md border border-stone-300 bg-white px-4 text-sm font-bold text-stone-500 opacity-75"
                disabled
              >
                <span className="grid size-5 place-items-center rounded-full border border-stone-300 bg-white text-xs font-black text-blue-600">G</span>
                เข้าสู่ระบบด้วย Google
              </button>
            )}
          </div>

          <Button className="h-11 w-full" disabled={isSubmitting}>
            {isSubmitting ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-stone-600">
          ยังไม่มีบัญชี?{" "}
          <Link to="/register" className="font-bold text-leaf hover:text-teal-800">
            สมัครใช้งานฟรี
          </Link>
        </p>
      </Card>
    </main>
  );
}

export function ForgotPasswordPage() {
  const session = useAuth((state) => state.session);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSent, setIsSent] = useState(false);

  if (session) return <Navigate to={getPostAuthPath(session)} replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setFieldError("กรุณากรอกอีเมล");
      setIsSent(false);
      return;
    }
    if (!emailPattern.test(trimmedEmail)) {
      setFieldError("รูปแบบอีเมลไม่ถูกต้อง");
      setIsSent(false);
      return;
    }

    setFieldError("");
    setError("");
    setIsSubmitting(true);
    try {
      await post<{ ok: boolean }>("/auth/forgot-password", { email: trimmedEmail });
      setIsSent(true);
    } catch {
      setError("ส่งลิงก์ไม่สำเร็จ กรุณาลองอีกครั้ง");
      setIsSent(false);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="mx-auto grid min-h-[70vh] max-w-md place-items-center px-5 py-10">
      <Card className="w-full p-6 shadow-soft">
        <div className="mb-6">
          <Link to="/login" className="inline-flex items-center gap-2 text-sm font-semibold text-moss transition hover:text-leaf">
            <ArrowLeft size={16} />
            กลับเข้าสู่ระบบ
          </Link>
        </div>

        <div className="mb-7 text-center">
          <div className="mx-auto mb-3 grid size-12 place-items-center rounded-lg bg-leaf text-lg font-black text-white shadow-sm">Z</div>
          <p className="text-lg font-black text-ink">Zentory</p>
          <p className="mt-1 text-sm font-semibold text-moss">ระบบจัดการสต็อกสินค้า</p>
          <h1 className="mt-5 text-3xl font-black text-ink">ลืมรหัสผ่าน</h1>
          <p className="mt-2 text-sm leading-6 text-stone-600">กรอกอีเมลที่สมัครไว้ แล้วเราจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ให้คุณ</p>
        </div>

        <form onSubmit={submit} noValidate className="space-y-4">
          <label className="block">
            <span className="text-sm font-semibold text-ink">อีเมล</span>
            <div className="relative mt-1">
              <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
              <input
                className="field field-with-left-icon"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-invalid={Boolean(fieldError)}
                aria-describedby={fieldError ? "forgot-email-error" : undefined}
              />
            </div>
            {fieldError ? <span id="forgot-email-error" className="mt-1 block text-sm font-semibold text-red-700">{fieldError}</span> : null}
          </label>

          {isSent ? (
            <p className="rounded-md bg-emerald-50 p-3 text-sm font-semibold leading-6 text-emerald-800">
              หากอีเมลนี้มีอยู่ในระบบ เราได้ส่งลิงก์สำหรับรีเซ็ตรหัสผ่านแล้ว กรุณาตรวจสอบกล่องจดหมายของคุณ
            </p>
          ) : null}
          {error ? <p className="rounded-md bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p> : null}

          <Button className="h-11 w-full" disabled={isSubmitting}>
            {isSubmitting ? "กำลังส่งลิงก์..." : "ส่งลิงก์รีเซ็ตรหัสผ่าน"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-stone-600">
          จำรหัสผ่านได้แล้ว?{" "}
          <Link to="/login" className="font-bold text-leaf hover:text-teal-800">
            เข้าสู่ระบบ
          </Link>
        </p>
      </Card>
    </main>
  );
}

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const session = useAuth((state) => state.session);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  if (session) return <Navigate to={getPostAuthPath(session)} replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmPassword = String(form.get("confirmPassword") ?? "");
    const nextErrors: Record<string, string> = {};

    if (!token) nextErrors.token = "ลิงก์รีเซ็ตรหัสผ่านไม่ถูกต้อง";
    if (!password) nextErrors.password = "กรุณากรอกรหัสผ่านใหม่";
    else if (password.length < 8) nextErrors.password = "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร";
    if (!confirmPassword) nextErrors.confirmPassword = "กรุณายืนยันรหัสผ่านใหม่";
    else if (password !== confirmPassword) nextErrors.confirmPassword = "รหัสผ่านและยืนยันรหัสผ่านต้องตรงกัน";

    setFieldErrors(nextErrors);
    setError("");
    if (Object.keys(nextErrors).length > 0) return;

    setIsSubmitting(true);
    try {
      await post<{ ok: boolean }>("/auth/reset-password", { token, password });
      setIsComplete(true);
    } catch {
      setError("ลิงก์รีเซ็ตรหัสผ่านไม่ถูกต้องหรือหมดอายุแล้ว กรุณาขอลิงก์ใหม่อีกครั้ง");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="mx-auto grid min-h-[70vh] max-w-md place-items-center px-5 py-10">
      <Card className="w-full p-6 shadow-soft">
        <div className="mb-6">
          <Link to="/login" className="inline-flex items-center gap-2 text-sm font-semibold text-moss transition hover:text-leaf">
            <ArrowLeft size={16} />
            กลับเข้าสู่ระบบ
          </Link>
        </div>

        <div className="mb-7 text-center">
          <div className="mx-auto mb-3 grid size-12 place-items-center rounded-lg bg-leaf text-lg font-black text-white shadow-sm">Z</div>
          <p className="text-lg font-black text-ink">Zentory</p>
          <p className="mt-1 text-sm font-semibold text-moss">ระบบจัดการสต็อกสินค้า</p>
          <h1 className="mt-5 text-3xl font-black text-ink">ตั้งรหัสผ่านใหม่</h1>
          <p className="mt-2 text-sm leading-6 text-stone-600">ตั้งรหัสผ่านใหม่อย่างน้อย 8 ตัวอักษร เพื่อกลับเข้าใช้งานบัญชีของคุณ</p>
        </div>

        {isComplete ? (
          <div className="space-y-4">
            <p className="rounded-md bg-emerald-50 p-3 text-sm font-semibold leading-6 text-emerald-800">
              ตั้งรหัสผ่านใหม่เรียบร้อยแล้ว คุณสามารถเข้าสู่ระบบด้วยรหัสผ่านใหม่ได้ทันที
            </p>
            <Link to="/login" className="block">
              <Button className="h-11 w-full">เข้าสู่ระบบ</Button>
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="space-y-4">
            {fieldErrors.token ? <p className="rounded-md bg-red-50 p-3 text-sm font-semibold text-red-700">{fieldErrors.token}</p> : null}

            <label className="block">
              <span className="text-sm font-semibold text-ink">รหัสผ่านใหม่</span>
              <div className="relative mt-1">
                <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
                <input
                  className="field field-with-both-icons"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby={fieldErrors.password ? "reset-password-error" : undefined}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 grid size-6 -translate-y-1/2 place-items-center text-stone-500 transition hover:text-leaf"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {fieldErrors.password ? <span id="reset-password-error" className="mt-1 block text-sm font-semibold text-red-700">{fieldErrors.password}</span> : null}
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-ink">ยืนยันรหัสผ่านใหม่</span>
              <input
                className="field mt-1"
                name="confirmPassword"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                aria-invalid={Boolean(fieldErrors.confirmPassword)}
                aria-describedby={fieldErrors.confirmPassword ? "reset-confirm-password-error" : undefined}
              />
              {fieldErrors.confirmPassword ? <span id="reset-confirm-password-error" className="mt-1 block text-sm font-semibold text-red-700">{fieldErrors.confirmPassword}</span> : null}
            </label>

            {error ? <p className="rounded-md bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p> : null}

            <Button className="h-11 w-full" disabled={isSubmitting}>
              {isSubmitting ? "กำลังตั้งรหัสผ่าน..." : "ตั้งรหัสผ่านใหม่"}
            </Button>
          </form>
        )}
      </Card>
    </main>
  );
}

export function RegisterPage() {
  const navigate = useNavigate();
  const session = useAuth((state) => state.session);
  const setSession = useAuth((state) => state.setSession);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  if (session) return <Navigate to={getPostAuthPath(session)} replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const confirmPassword = String(form.get("confirmPassword") ?? "");
    const terms = form.get("terms") === "on";
    const nextErrors: Record<string, string> = {};

    if (!name) nextErrors.name = "กรุณากรอกชื่อผู้ใช้";
    if (!email) nextErrors.email = "กรุณากรอกอีเมล";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) nextErrors.email = "รูปแบบอีเมลไม่ถูกต้อง";
    if (!password) nextErrors.password = "กรุณากรอกรหัสผ่าน";
    else if (password.length < 8) nextErrors.password = "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร";
    if (!confirmPassword) nextErrors.confirmPassword = "กรุณากรอกยืนยันรหัสผ่าน";
    else if (password !== confirmPassword) nextErrors.confirmPassword = "รหัสผ่านและยืนยันรหัสผ่านต้องตรงกัน";
    if (!terms) nextErrors.terms = "กรุณายอมรับเงื่อนไขก่อนสมัคร";

    setFieldErrors(nextErrors);
    setError("");
    if (Object.keys(nextErrors).length > 0) return;

    setIsSubmitting(true);
    try {
      const session = await post<AuthSession>("/auth/register", { name, email, password });
      setSession(session);
      navigate(getPostAuthPath(session));
    } catch (err) {
      setError(err instanceof Error ? err.message : "สมัครไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      setIsSubmitting(false);
    }
  }
  return (
    <main className="mx-auto grid min-h-[70vh] max-w-md place-items-center px-5 py-10">
      <Card className="w-full p-6 shadow-soft">
        <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-moss transition hover:text-leaf">
          <ArrowLeft size={16} />
          กลับหน้าแรก
        </Link>
        <div className="mb-7 mt-6 text-center">
          <div className="mx-auto mb-3 grid size-12 place-items-center rounded-lg bg-leaf text-lg font-black text-white shadow-sm">Z</div>
          <h1 className="text-3xl font-black text-ink">เริ่มใช้ Zentory</h1>
          <p className="mt-2 text-sm leading-6 text-stone-600">สร้างบัญชีฟรีเพื่อเริ่มจัดการสินค้า สต็อก และยอดขายของร้านคุณ</p>
        </div>

        <form onSubmit={submit} noValidate className="space-y-4">
          <label className="block">
            <span className="text-sm font-semibold text-ink">ชื่อผู้ใช้</span>
            <div className="relative mt-1">
              <User className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
              <input className="field field-with-left-icon" name="name" autoComplete="name" aria-invalid={Boolean(fieldErrors.name)} />
            </div>
            {fieldErrors.name ? <span className="mt-1 block text-sm font-semibold text-red-700">{fieldErrors.name}</span> : null}
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-ink">อีเมล</span>
            <div className="relative mt-1">
              <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
              <input className="field field-with-left-icon" name="email" type="email" autoComplete="email" aria-invalid={Boolean(fieldErrors.email)} />
            </div>
            {fieldErrors.email ? <span className="mt-1 block text-sm font-semibold text-red-700">{fieldErrors.email}</span> : null}
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-ink">รหัสผ่าน</span>
            <div className="relative mt-1">
              <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
              <input className="field field-with-both-icons" name="password" type={showPassword ? "text" : "password"} autoComplete="new-password" aria-invalid={Boolean(fieldErrors.password)} />
              <button type="button" className="absolute right-3 top-1/2 grid size-6 -translate-y-1/2 place-items-center text-stone-500 transition hover:text-leaf" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}>
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {fieldErrors.password ? <span className="mt-1 block text-sm font-semibold text-red-700">{fieldErrors.password}</span> : null}
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-ink">ยืนยันรหัสผ่าน</span>
            <input className="field mt-1" name="confirmPassword" type="password" autoComplete="new-password" aria-invalid={Boolean(fieldErrors.confirmPassword)} />
            {fieldErrors.confirmPassword ? <span className="mt-1 block text-sm font-semibold text-red-700">{fieldErrors.confirmPassword}</span> : null}
          </label>

          <label className="flex items-start gap-2 text-sm font-semibold text-stone-700">
            <input className="mt-1 size-4 rounded border-stone-300 accent-leaf" name="terms" type="checkbox" />
            <span>ยอมรับเงื่อนไขการใช้งานและนโยบายความเป็นส่วนตัว</span>
          </label>
          {fieldErrors.terms ? <p className="text-sm font-semibold text-red-700">{fieldErrors.terms}</p> : null}

          {error ? <p className="rounded-md bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p> : null}
          <Button className="h-11 w-full" disabled={isSubmitting}>{isSubmitting ? "กำลังสร้างบัญชี..." : "สร้างบัญชี"}</Button>
        </form>

        <p className="mt-6 text-center text-sm text-stone-600">
          มีบัญชีอยู่แล้ว?{" "}
          <Link to="/login" className="font-bold text-leaf hover:text-teal-800">
            เข้าสู่ระบบ
          </Link>
        </p>
      </Card>
    </main>
  );
}
