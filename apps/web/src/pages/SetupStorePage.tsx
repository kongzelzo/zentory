import { type FocusEvent, type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Building2, Check, ChevronsUpDown, ClipboardList, Search } from "lucide-react";
import type { AuthSession } from "@zentory/shared";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Dropdown } from "../components/Dropdown";
import { OnboardingTopbar } from "../components/OnboardingTopbar";
import { post } from "../lib/api";
import { useAuth } from "../state/auth";

const provinces = [
  "กรุงเทพมหานคร",
  "กระบี่",
  "กาญจนบุรี",
  "กาฬสินธุ์",
  "กำแพงเพชร",
  "ขอนแก่น",
  "จันทบุรี",
  "ฉะเชิงเทรา",
  "ชลบุรี",
  "ชัยนาท",
  "ชัยภูมิ",
  "ชุมพร",
  "เชียงราย",
  "เชียงใหม่",
  "ตรัง",
  "ตราด",
  "ตาก",
  "นครนายก",
  "นครปฐม",
  "นครพนม",
  "นครราชสีมา",
  "นครศรีธรรมราช",
  "นครสวรรค์",
  "นนทบุรี",
  "นราธิวาส",
  "น่าน",
  "บึงกาฬ",
  "บุรีรัมย์",
  "ปทุมธานี",
  "ประจวบคีรีขันธ์",
  "ปราจีนบุรี",
  "ปัตตานี",
  "พระนครศรีอยุธยา",
  "พะเยา",
  "พังงา",
  "พัทลุง",
  "พิจิตร",
  "พิษณุโลก",
  "เพชรบุรี",
  "เพชรบูรณ์",
  "แพร่",
  "ภูเก็ต",
  "มหาสารคาม",
  "มุกดาหาร",
  "แม่ฮ่องสอน",
  "ยโสธร",
  "ยะลา",
  "ร้อยเอ็ด",
  "ระนอง",
  "ระยอง",
  "ราชบุรี",
  "ลพบุรี",
  "ลำปาง",
  "ลำพูน",
  "เลย",
  "ศรีสะเกษ",
  "สกลนคร",
  "สงขลา",
  "สตูล",
  "สมุทรปราการ",
  "สมุทรสงคราม",
  "สมุทรสาคร",
  "สระแก้ว",
  "สระบุรี",
  "สิงห์บุรี",
  "สุโขทัย",
  "สุพรรณบุรี",
  "สุราษฎร์ธานี",
  "สุรินทร์",
  "หนองคาย",
  "หนองบัวลำภู",
  "อ่างทอง",
  "อำนาจเจริญ",
  "อุดรธานี",
  "อุตรดิตถ์",
  "อุทัยธานี",
  "อุบลราชธานี",
  "อื่น ๆ"
];
const businessTypes = ["ร้านขายของชำ", "ร้านเครื่องสำอาง", "ร้านเสื้อผ้า", "ร้านอุปกรณ์มือถือ", "ร้านเครื่องเขียน", "ร้านอะไหล่", "ร้านขายส่ง", "ร้านค้าออนไลน์", "อื่น ๆ"];
const branchCounts = [
  { value: "1", label: "1 สาขา" },
  { value: "2-3", label: "2-3 สาขา" },
  { value: "4+", label: "4 สาขาขึ้นไป" }
];

export function SetupStorePage() {
  const navigate = useNavigate();
  const session = useAuth((state) => state.session);
  const setSession = useAuth((state) => state.setSession);
  const initialProvince = session?.business?.province === "กรุงเทพฯ" ? "กรุงเทพมหานคร" : session?.business?.province ?? "";
  const [provinceQuery, setProvinceQuery] = useState(initialProvince);
  const [selectedProvince, setSelectedProvince] = useState(provinces.includes(initialProvince) ? initialProvince : "");
  const [isProvinceOpen, setIsProvinceOpen] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const provinceComboboxRef = useRef<HTMLDivElement>(null);

  const filteredProvinces = useMemo(() => {
    const query = provinceQuery.trim().toLowerCase();
    if (!query) return provinces;
    return provinces.filter((province) => province.toLowerCase().includes(query));
  }, [provinceQuery]);

  useEffect(() => {
    if (!isProvinceOpen) return undefined;

    function closeOnOutsidePress(event: MouseEvent | TouchEvent) {
      if (!provinceComboboxRef.current?.contains(event.target as Node)) setIsProvinceOpen(false);
    }

    document.addEventListener("mousedown", closeOnOutsidePress);
    document.addEventListener("touchstart", closeOnOutsidePress);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsidePress);
      document.removeEventListener("touchstart", closeOnOutsidePress);
    };
  }, [isProvinceOpen]);

  if (!session) return <Navigate to="/login" replace />;
  if (session.business?.onboardingCompleted) return <Navigate to="/app/dashboard" replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const province = String(form.get("province") ?? "");
    const businessType = String(form.get("businessType") ?? "");
    const branchCount = String(form.get("branchCount") ?? "1");
    const setupMode = String(form.get("setupMode") ?? "empty");
    const nextErrors: Record<string, string> = {};

    if (!name) nextErrors.name = "กรุณากรอกชื่อร้าน";
    if (!province) nextErrors.province = "กรุณาเลือกจังหวัด";
    if (!businessType) nextErrors.businessType = "กรุณาเลือกประเภทธุรกิจ";

    setFieldErrors(nextErrors);
    setError("");
    if (Object.keys(nextErrors).length > 0) return;

    setIsSubmitting(true);
    try {
      const nextSession = await post<AuthSession>("/businesses", { name, province, businessType, branchCount, setupMode });
      setSession(nextSession);
      navigate("/app/onboarding");
    } catch (err) {
      setError(err instanceof Error ? err.message : "ตั้งค่าร้านไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      setIsSubmitting(false);
    }
  }

  function chooseProvince(province: string) {
    setProvinceQuery(province);
    setSelectedProvince(province);
    setIsProvinceOpen(false);
    setFieldErrors((current) => {
      const { province: _province, ...rest } = current;
      return rest;
    });
  }

  function updateProvinceQuery(value: string) {
    setProvinceQuery(value);
    setSelectedProvince(provinces.includes(value) ? value : "");
    setIsProvinceOpen(true);
  }

  function closeProvinceOptions(event: FocusEvent<HTMLDivElement>) {
    if (!provinceComboboxRef.current?.contains(event.relatedTarget as Node | null)) {
      setIsProvinceOpen(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <OnboardingTopbar backTo="/join-or-create" backLabel="เลือกวิธีเริ่มต้น" />
      <div className="mx-auto max-w-2xl px-5 py-8">
        <Card className="p-6 shadow-soft">
          <div className="mb-7 flex items-start gap-4">
            <div className="grid size-12 shrink-0 place-items-center rounded-lg bg-teal-50 text-leaf">
              <Building2 size={24} />
            </div>
            <div>
              <h1 className="text-3xl font-black text-ink">ตั้งค่าร้านของคุณ</h1>
              <p className="mt-2 text-sm leading-6 text-stone-600">กรอกข้อมูลพื้นฐานของร้าน เพื่อเริ่มใช้งาน Zentory ได้อย่างถูกต้อง</p>
            </div>
          </div>

          <form onSubmit={submit} noValidate className="space-y-5">
            <label className="block">
              <span className="text-sm font-semibold text-ink">ชื่อร้าน</span>
              <input className="field mt-1" name="name" placeholder="เช่น ร้านก้องมาร์ท" defaultValue={session.business?.name ?? ""} aria-invalid={Boolean(fieldErrors.name)} />
              {fieldErrors.name ? <span className="mt-1 block text-sm font-semibold text-red-700">{fieldErrors.name}</span> : null}
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="relative" ref={provinceComboboxRef} onBlur={closeProvinceOptions}>
                <span className="text-sm font-semibold text-ink">จังหวัด</span>
                <input type="hidden" name="province" value={selectedProvince} />
                <div className="relative mt-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
                  <input
                    className="field field-with-left-icon pr-10"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-controls="province-options"
                    aria-expanded={isProvinceOpen}
                    aria-invalid={Boolean(fieldErrors.province)}
                    value={provinceQuery}
                    onChange={(event) => updateProvinceQuery(event.target.value)}
                    onFocus={() => setIsProvinceOpen(true)}
                    placeholder="พิมพ์เพื่อค้นหาจังหวัด"
                    autoComplete="off"
                  />
                  <button
                    className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-stone-500 transition hover:bg-stone-100 hover:text-ink"
                    type="button"
                    onClick={() => setIsProvinceOpen((current) => !current)}
                    aria-label="เปิดรายการจังหวัด"
                  >
                    <ChevronsUpDown size={17} />
                  </button>
                </div>
                {isProvinceOpen ? (
                  <div
                    id="province-options"
                    role="listbox"
                    className="absolute z-20 mt-2 max-h-64 w-full overflow-y-auto rounded-lg border border-stone-200 bg-white p-1 shadow-soft"
                  >
                    {filteredProvinces.length > 0 ? filteredProvinces.map((province) => (
                      <button
                        key={province}
                        type="button"
                        role="option"
                        aria-selected={selectedProvince === province}
                        className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm font-semibold text-ink transition hover:bg-teal-50 focus:bg-teal-50 focus:outline-none"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => chooseProvince(province)}
                      >
                        <span>{province}</span>
                        {selectedProvince === province ? <Check className="shrink-0 text-leaf" size={17} /> : null}
                      </button>
                    )) : (
                      <div className="px-3 py-3 text-sm font-semibold text-stone-500">ไม่พบจังหวัดที่ค้นหา</div>
                    )}
                  </div>
                ) : null}
                {fieldErrors.province ? <span className="mt-1 block text-sm font-semibold text-red-700">{fieldErrors.province}</span> : null}
              </div>

              <label className="block">
                <span className="text-sm font-semibold text-ink">ประเภทธุรกิจ</span>
                <Dropdown
                  name="businessType"
                  defaultValue={session.business?.businessType ?? ""}
                  aria-invalid={Boolean(fieldErrors.businessType)}
                  buttonClassName="mt-1"
                  placeholder="เลือกประเภทธุรกิจ"
                  options={[
                    { value: "", label: "เลือกประเภทธุรกิจ" },
                    ...businessTypes.map((type) => ({ value: type, label: type }))
                  ]}
                />
                {fieldErrors.businessType ? <span className="mt-1 block text-sm font-semibold text-red-700">{fieldErrors.businessType}</span> : null}
              </label>
            </div>

            <label className="block">
              <span className="text-sm font-semibold text-ink">จำนวนสาขา</span>
              <Dropdown
                name="branchCount"
                defaultValue={session.business?.branchCount ?? "1"}
                buttonClassName="mt-1"
                options={branchCounts.map((item) => ({ value: item.value, label: item.label }))}
              />
            </label>

            <fieldset>
              <legend className="text-sm font-semibold text-ink">ตัวเลือกการเริ่มต้นข้อมูล</legend>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <label className="rounded-md border border-stone-200 p-4 transition has-[:checked]:border-leaf has-[:checked]:bg-teal-50/60">
                  <input className="sr-only" type="radio" name="setupMode" value="empty" defaultChecked />
                  <span className="flex items-center gap-2 font-black text-ink"><ClipboardList size={18} className="text-leaf" /> เริ่มจากข้อมูลเปล่า</span>
                  <span className="mt-1 block text-sm text-stone-600">เหมาะสำหรับเริ่มใส่สินค้าจริงด้วยตัวเอง</span>
                </label>
                <label className="rounded-md border border-stone-200 p-4 transition has-[:checked]:border-leaf has-[:checked]:bg-teal-50/60">
                  <input className="sr-only" type="radio" name="setupMode" value="sample" />
                  <span className="flex items-center gap-2 font-black text-ink"><ClipboardList size={18} className="text-leaf" /> ใช้ข้อมูลตัวอย่าง</span>
                  <span className="mt-1 block text-sm text-stone-600">สร้างตัวอย่างภายหลังได้จากหน้าเริ่มต้นใช้งาน</span>
                </label>
              </div>
            </fieldset>

            {error ? <p className="rounded-md bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p> : null}

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button type="button" variant="ghost" onClick={() => navigate("/app/onboarding")}>ทำภายหลัง</Button>
              <Button disabled={isSubmitting}>{isSubmitting ? "กำลังบันทึก..." : "เริ่มใช้งาน"}</Button>
            </div>
          </form>
        </Card>
      </div>
    </main>
  );
}
