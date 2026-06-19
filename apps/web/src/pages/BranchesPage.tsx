import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Boxes, Building2, CheckCircle2, ClipboardList, Pencil, Plus, Repeat, Save, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Dropdown } from "../components/Dropdown";
import { api, del, patch, post } from "../lib/api";
import {
  branchTypeLabel,
  buildBranchSummaries,
  buildBranchTotals,
  filterBranchSummaries,
  stockStatusOf,
  type BranchBalanceRecord,
  type BranchRecord,
  type BranchStatus,
  type BranchType,
  type BranchStatusFilter
} from "../lib/branches";
import { getSessionDashboardPath } from "../lib/dashboard";
import { baht, number, thaiDate } from "../lib/format";
import { useAuth } from "../state/auth";
import { useWorkingBranch } from "../state/working-branch";

type Branch = BranchRecord & {
  createdAt?: string;
  branch?: StoreBranch;
  balances?: Balance[];
  movements?: Movement[];
};

type StoreBranch = {
  id: string;
  name: string;
  code: string;
  status: BranchStatus;
  address?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  note?: string | null;
  isDefault?: boolean;
  warehouses?: Branch[];
};

type Balance = BranchBalanceRecord & {
  id?: string;
  productId: string;
  product: BranchBalanceRecord["product"] & { barcode?: string | null };
};

type Movement = {
  id: string;
  warehouseId: string;
  type: string;
  quantity: number;
  balanceBefore?: number | null;
  balanceAfter?: number;
  reason?: string | null;
  adjustmentMode?: "SET_ACTUAL" | "INCREASE" | "DECREASE";
  targetQuantity?: number | null;
  reference?: string | null;
  createdAt: string;
  product: { id: string; name: string };
  user?: { name: string } | null;
};

type BranchForm = {
  name: string;
  code: string;
  branchId: string;
  type: BranchType;
  status: BranchStatus;
  address: string;
  contactName: string;
  contactPhone: string;
  note: string;
};

const emptyBranchForm: BranchForm = {
  name: "",
  code: "",
  branchId: "",
  type: "BRANCH_WAREHOUSE",
  status: "ACTIVE",
  address: "",
  contactName: "",
  contactPhone: "",
  note: ""
};

const branchTypeLabels: Record<BranchType, string> = {
  MAIN_WAREHOUSE: "คลังหลัก",
  STORE_FRONT: "หน้าร้าน",
  BRANCH_WAREHOUSE: "คลังประจำสาขา",
  SECONDARY_WAREHOUSE: "คลังสำรอง"
};

const movementLabels: Record<string, string> = {
  RECEIVE_IN: "รับเข้า",
  ADJUSTMENT_IN: "ปรับเพิ่ม",
  ADJUSTMENT_OUT: "ปรับลด",
  SALE_OUT: "ขายออก",
  TRANSFER_OUT: "ส่งโอนออก",
  TRANSFER_IN: "รับโอนเข้า",
  TRANSFER_CANCEL: "คืนจากยกเลิกโอน"
};

const adjustmentModeLabels: Record<NonNullable<Movement["adjustmentMode"]>, string> = {
  SET_ACTUAL: "ตั้งยอดจริง",
  INCREASE: "ปรับเพิ่ม",
  DECREASE: "ปรับลด"
};

function movementLabel(movement: Movement) {
  return movement.adjustmentMode ? adjustmentModeLabels[movement.adjustmentMode] : movementLabels[movement.type] ?? movement.type;
}

function movementQuantityText(movement: Movement) {
  if (movement.adjustmentMode === "SET_ACTUAL") return `ตั้งเป็น ${number(movement.targetQuantity ?? movement.balanceAfter ?? 0)}`;
  return number(movement.quantity);
}

function statusClass(label: string) {
  if (label === "หมดสต็อก") return "bg-red-50 text-red-700";
  if (label === "ใกล้หมด") return "bg-amber-50 text-amber-800";
  if (label === "ปกติ" || label === "เปิดใช้งาน") return "bg-teal-50 text-teal-700";
  return "bg-stone-100 text-stone-600";
}

function movementBadgeClass(type: string) {
  if (type === "RECEIVE_IN") return "bg-teal-50 text-teal-700";
  if (type === "SALE_OUT") return "bg-red-50 text-red-700";
  if (type === "ADJUSTMENT_IN") return "bg-emerald-50 text-emerald-700";
  if (type === "ADJUSTMENT_OUT") return "bg-amber-50 text-amber-800";
  if (type === "TRANSFER_IN" || type === "TRANSFER_CANCEL") return "bg-teal-50 text-teal-700";
  if (type === "TRANSFER_OUT") return "bg-amber-50 text-amber-800";
  return "bg-stone-100 text-stone-600";
}

function StatCard({ label, value, tone = "text-ink" }: { label: string; value: string; tone?: string }) {
  return (
    <Card className="min-h-28">
      <p className="text-sm font-semibold text-stone-500">{label}</p>
      <p className={`mt-3 text-2xl font-black ${tone}`}>{value}</p>
    </Card>
  );
}

function readinessItems(branch: StoreBranchSummary) {
  return [
    { label: "ข้อมูลติดต่อ", ready: Boolean(branch.contactName?.trim() && branch.contactPhone?.trim()) },
    { label: "พื้นที่ขาย", ready: Boolean(branch.address?.trim()) },
    { label: "มีคลังแล้ว", ready: branch.warehouseCount > 0 }
  ];
}

function ReadinessBadges({ branch, compact = false }: { branch: StoreBranchSummary; compact?: boolean }) {
  return (
    <div className={`flex flex-wrap gap-1.5 ${compact ? "" : "mt-2"}`}>
      {readinessItems(branch).map((item) => (
        <span key={item.label} className={`rounded px-2 py-1 text-xs font-bold ${item.ready ? "bg-teal-50 text-teal-700" : "bg-stone-100 text-stone-500"}`}>
          {item.ready ? "พร้อม" : "ยังขาด"}: {item.label}
        </span>
      ))}
    </div>
  );
}

function branchFormErrorMessage(message: string) {
  if (message.includes("Branch limit reached")) return "แพ็กเกจปัจจุบันเพิ่มสาขาได้ถึงจำนวนสูงสุดแล้ว กรุณาอัปเกรดแพ็กเกจเพื่อเพิ่มสาขา";
  return message;
}

function toStoreBranchForm(branch: StoreBranch): StoreBranchForm {
  return {
    name: branch.name,
    code: branch.code,
    status: branch.status,
    address: branch.address ?? "",
    contactName: branch.contactName ?? "",
    contactPhone: branch.contactPhone ?? "",
    note: branch.note ?? ""
  };
}

function trimStoreBranchForm(form: StoreBranchForm): StoreBranchForm {
  return {
    ...form,
    name: form.name.trim(),
    code: form.code.trim(),
    address: form.address.trim(),
    contactName: form.contactName.trim(),
    contactPhone: form.contactPhone.trim(),
    note: form.note.trim()
  };
}

function storeBranchReadinessItems(form: StoreBranchForm) {
  return [
    { label: "ชื่อสาขา", ready: Boolean(form.name.trim()) },
    { label: "รหัสสาขา", ready: Boolean(form.code.trim()) },
    { label: "พื้นที่ขาย", ready: Boolean(form.address.trim()) },
    { label: "ข้อมูลติดต่อ", ready: Boolean(form.contactName.trim() && form.contactPhone.trim()) }
  ];
}

type StoreBranchSummary = StoreBranch & {
  statusLabel: "เปิดใช้งาน" | "ปิดใช้งาน";
  warehouseCount: number;
};

type StoreBranchForm = {
  name: string;
  code: string;
  status: BranchStatus;
  address: string;
  contactName: string;
  contactPhone: string;
  note: string;
};

const emptyStoreBranchForm: StoreBranchForm = {
  name: "",
  code: "",
  status: "ACTIVE",
  address: "",
  contactName: "",
  contactPhone: "",
  note: ""
};

export function BranchesPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const session = useAuth((state) => state.session);
  const setWorkingBranchId = useWorkingBranch((state) => state.setWorkingBranchId);
  const branches = useQuery({ queryKey: ["branches"], queryFn: () => api<StoreBranch[]>("/branches") });
  const [form, setForm] = useState<StoreBranchForm>(emptyStoreBranchForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const summaries = useMemo<StoreBranchSummary[]>(() => (branches.data ?? []).map((branch) => ({
    ...branch,
    statusLabel: branch.status === "ACTIVE" ? "เปิดใช้งาน" : "ปิดใช้งาน",
    warehouseCount: branch.warehouses?.length ?? 0
  })), [branches.data]);
  const filteredSummaries = useMemo(() => {
    const query = search.trim().toLowerCase();
    return summaries.filter((branch) => {
      const matchesSearch = !query || [branch.name, branch.code, branch.contactName ?? "", branch.address ?? ""].some((value) => value.toLowerCase().includes(query));
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && branch.status === "ACTIVE") ||
        (statusFilter === "inactive" && branch.status === "INACTIVE");
      return matchesSearch && matchesStatus;
    });
  }, [search, statusFilter, summaries]);
  const totals = {
    totalBranches: summaries.length,
    activeBranches: summaries.filter((branch) => branch.status === "ACTIVE").length,
    inactiveBranches: summaries.filter((branch) => branch.status === "INACTIVE").length,
    warehouses: summaries.reduce((sum, branch) => sum + branch.warehouseCount, 0)
  };
  const hasFilters = Boolean(search.trim()) || statusFilter !== "all";
  const saveBranch = useMutation({
    mutationFn: (body: StoreBranchForm) => editingId ? patch(`/branches/${editingId}`, body) : post("/branches", body),
    onSuccess: () => {
      setForm(emptyStoreBranchForm);
      setEditingId(null);
      setIsFormOpen(false);
      queryClient.invalidateQueries({ queryKey: ["branches"] });
    }
  });
  const saveBranchError = saveBranch.error ? branchFormErrorMessage(saveBranch.error.message) : "";
  const isBranchLimitError = saveBranchError.includes("เพิ่มสาขาได้สูงสุด") || saveBranchError.includes("เพิ่มสาขาได้ถึงจำนวนสูงสุด");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.name.trim() || !form.code.trim()) return;
    saveBranch.mutate(form);
  }

  function startEdit(branch: StoreBranch) {
    setEditingId(branch.id);
    setForm(toStoreBranchForm(branch));
    setIsFormOpen(true);
  }

  function updateForm<K extends keyof StoreBranchForm>(key: K, value: StoreBranchForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function startCreate(initial?: Partial<StoreBranchForm>) {
    setEditingId(null);
    setForm({ ...emptyStoreBranchForm, ...initial });
    setIsFormOpen(true);
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyStoreBranchForm);
    setIsFormOpen(false);
  }

  function clearFilters() {
    setSearch("");
    setStatusFilter("all");
  }

  function goToBranchDashboard(branchId: string) {
    setWorkingBranchId(branchId);
    navigate(`${getSessionDashboardPath(session)}?branchId=${encodeURIComponent(branchId)}`);
  }

  const summaryGridClass = isFormOpen ? "grid gap-4 sm:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-4" : "grid gap-4 sm:grid-cols-2 xl:grid-cols-4";
  const filterGridClass = isFormOpen ? "grid gap-3 lg:grid-cols-1" : "grid gap-3 lg:grid-cols-[1fr_240px_auto]";
  const tableClass = isFormOpen ? "w-full min-w-[620px] text-left text-sm" : "w-full min-w-[1180px] text-left text-sm";
  const hiddenWhenEditingClass = isFormOpen ? "hidden" : "";

  return (
    <div className={`space-y-5 transition-[padding] duration-200 ${isFormOpen ? "xl:pr-[38rem]" : ""}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-black text-ink">จัดการสาขา</h1>
          <p className="text-stone-600">ทะเบียนจุดขายและหน่วยปฏิบัติงานของร้าน ใช้ดูข้อมูลติดต่อ พื้นที่ขาย และทางลัดไปคลังของแต่ละสาขา</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" icon={<ArrowLeft size={16} />} onClick={() => navigate(-1)}>กลับไปหน้าก่อนหน้า</Button>
          <Button type="button" onClick={() => startCreate()} icon={<Plus size={16} />}>เพิ่มสาขา</Button>
        </div>
      </div>

      <div className={summaryGridClass}>
        <StatCard label="สาขาทั้งหมด" value={number(totals.totalBranches)} />
        <StatCard label="เปิดใช้งาน" value={number(totals.activeBranches)} tone="text-teal-700" />
        <StatCard label="ปิดใช้งาน" value={number(totals.inactiveBranches)} tone="text-stone-600" />
        <StatCard label="คลังในสาขา" value={`${number(totals.warehouses)} คลัง`} />
      </div>

      {isFormOpen ? (
        <div className="fixed inset-0 z-50 flex justify-end xl:pointer-events-none">
          <button className="absolute inset-0 bg-ink/45 xl:hidden" type="button" aria-label="ปิดฟอร์มสาขา" onClick={resetForm} />
          <aside className="relative flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl xl:pointer-events-auto xl:w-[36rem] xl:border-l xl:border-stone-200">
            <div className="flex items-start justify-between gap-4 border-b border-stone-200 p-5">
              <div>
                <h2 className="text-xl font-black text-ink">{editingId ? "แก้ไขสาขา" : "เพิ่มสาขาใหม่"}</h2>
                <p className="mt-1 text-sm text-stone-600">ระบุข้อมูลจุดขาย ผู้ดูแล และพื้นที่ปฏิบัติงาน เพื่อให้ทีมรู้ว่าสาขานี้ติดต่อและดูแลโดยใคร</p>
              </div>
              <Button type="button" variant="ghost" className="h-10 w-10 px-0" onClick={resetForm} aria-label="ปิดฟอร์มสาขา" icon={<X size={18} />} />
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <form onSubmit={submit} className="grid gap-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label>
                    <span className="text-sm font-semibold text-ink">ชื่อสาขา</span>
                    <input className="field mt-1" value={form.name} onChange={(event) => updateForm("name", event.target.value)} placeholder="เช่น สาขาสยาม" required />
                  </label>
                  <label>
                    <span className="text-sm font-semibold text-ink">รหัสสาขา</span>
                    <input className="field mt-1 uppercase" value={form.code} onChange={(event) => updateForm("code", event.target.value)} placeholder="เช่น MAIN, BKK-01" required />
                  </label>
                  <label>
                    <span className="text-sm font-semibold text-ink">สถานะ</span>
                    <Dropdown
                      buttonClassName="mt-1"
                      value={form.status}
                      onValueChange={(nextValue) => updateForm("status", nextValue as BranchStatus)}
                      options={[
                        { value: "ACTIVE", label: "เปิดใช้งาน" },
                        { value: "INACTIVE", label: "ปิดใช้งาน" }
                      ]}
                    />
                  </label>
                </div>
                <label>
                  <span className="text-sm font-semibold text-ink">ที่อยู่ / พื้นที่ขาย</span>
                  <input className="field mt-1" value={form.address} onChange={(event) => updateForm("address", event.target.value)} placeholder="เช่น ชั้น 1 โซน A หรือที่อยู่สาขา" />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label>
                    <span className="text-sm font-semibold text-ink">ผู้ดูแล</span>
                    <input className="field mt-1" value={form.contactName} onChange={(event) => updateForm("contactName", event.target.value)} placeholder="ชื่อผู้รับผิดชอบ" />
                  </label>
                  <label>
                    <span className="text-sm font-semibold text-ink">เบอร์ติดต่อ</span>
                    <input className="field mt-1" value={form.contactPhone} onChange={(event) => updateForm("contactPhone", event.target.value)} placeholder="เช่น 080-000-0000" />
                  </label>
                </div>
                <label>
                  <span className="text-sm font-semibold text-ink">หมายเหตุ</span>
                  <textarea className="field mt-1 min-h-28" value={form.note} onChange={(event) => updateForm("note", event.target.value)} placeholder="เช่น เวลาทำการ ข้อจำกัดพื้นที่ หรือหมายเหตุภายใน" />
                </label>
                {saveBranchError ? (
                  <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
                    <p className="font-semibold">{saveBranchError}</p>
                    {isBranchLimitError ? (
                      <Link to="/app/profile/billing"><Button className="mt-3" type="button" variant="secondary">ดูแพ็กเกจ</Button></Link>
                    ) : null}
                  </div>
                ) : null}
                <div className="sticky bottom-0 -mx-5 mt-2 flex flex-wrap justify-end gap-2 border-t border-stone-200 bg-white p-5">
                  <Button type="button" variant="secondary" onClick={resetForm}>ยกเลิก</Button>
                  <Button type="submit" disabled={saveBranch.isPending || !form.name.trim() || !form.code.trim()} icon={<Plus size={16} />}>{editingId ? "บันทึกสาขา" : "เพิ่มสาขา"}</Button>
                </div>
              </form>
            </div>
          </aside>
        </div>
      ) : null}

      <Card>
        <div className={filterGridClass}>
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={16} />
            <input className="field field-with-left-icon" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหาชื่อสาขา รหัสสาขา ผู้ดูแล หรือที่อยู่" />
          </label>
          <label className="relative">
            <SlidersHorizontal className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={16} />
            <Dropdown
              value={statusFilter}
              onValueChange={(nextValue) => setStatusFilter(nextValue as "all" | "active" | "inactive")}
              buttonClassName="field-with-select-icons"
              options={[
                { value: "all", label: "ทุกสถานะ" },
                { value: "active", label: "เปิดใช้งาน" },
                { value: "inactive", label: "ปิดใช้งาน" }
              ]}
            />
          </label>
          {hasFilters ? <Button type="button" variant="ghost" onClick={clearFilters} icon={<X size={16} />}>ล้างตัวกรอง</Button> : null}
        </div>
      </Card>

      <div className="grid gap-3 xl:hidden">
        {filteredSummaries.map((branch) => (
          <Card key={branch.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-black text-ink">{branch.name}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="rounded bg-stone-100 px-2 py-1 text-xs font-bold text-stone-700">{branch.code}</span>
                  <span className={`rounded px-2 py-1 text-xs font-bold ${statusClass(branch.statusLabel)}`}>{branch.statusLabel}</span>
                  {branch.isDefault ? <span className="rounded bg-teal-50 px-2 py-1 text-xs font-bold text-teal-700">สาขาหลัก</span> : null}
                </div>
              </div>
              <Link to={`/app/branches/${branch.id}/edit`}>
                <Button type="button" variant="ghost" className="h-10 w-10 shrink-0 px-0" aria-label={`แก้ไข ${branch.name}`} icon={<Pencil size={16} />} />
              </Link>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-md bg-stone-50 p-3">
                <p className="text-xs font-bold text-stone-500">คลังในสาขา</p>
                <p className="mt-1 font-black text-ink">{number(branch.warehouseCount)}</p>
              </div>
              <div className="rounded-md bg-stone-50 p-3">
                <p className="text-xs font-bold text-stone-500">ผู้ดูแล</p>
                <p className="mt-1 truncate font-black text-ink">{branch.contactName ?? "-"}</p>
              </div>
            </div>
            <div className="mt-4 space-y-1 text-sm text-stone-600">
              <p className="truncate">{branch.address ?? "ยังไม่มีที่อยู่"}</p>
              <p>{branch.contactPhone ?? "ยังไม่มีเบอร์ติดต่อ"}</p>
              {branch.note ? <p className="line-clamp-2 text-stone-500">{branch.note}</p> : null}
            </div>
            <ReadinessBadges branch={branch} />
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" variant="secondary" icon={<Building2 size={15} />} onClick={() => goToBranchDashboard(branch.id)}>ไปดูสาขา</Button>
              <Link to={`/app/branches/${branch.id}/edit`}><Button type="button" variant="ghost" icon={<Pencil size={15} />}>แก้ไข</Button></Link>
            </div>
          </Card>
        ))}
      </div>

      <div className="table-shell hidden xl:block">
        <table className={tableClass}>
          <thead className="bg-stone-50 text-stone-500">
            <tr>
              <th className="p-3">สาขา</th>
              <th className="p-3">รหัส</th>
              <th className="p-3">คลังในสาขา</th>
              <th className={`p-3 ${hiddenWhenEditingClass}`}>ที่อยู่ / พื้นที่ขาย</th>
              <th className={`p-3 ${hiddenWhenEditingClass}`}>ผู้ดูแล</th>
              <th className={`p-3 ${hiddenWhenEditingClass}`}>ความพร้อม</th>
              <th className={`p-3 ${hiddenWhenEditingClass}`}>หมายเหตุ</th>
              <th className="p-3">สถานะ</th>
              <th className="p-3">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {filteredSummaries.map((branch) => (
              <tr key={branch.id} className="border-t border-stone-100 hover:bg-stone-50">
                <td className="p-3 font-bold text-ink">
                  {branch.name}
                  {branch.isDefault ? <p className="text-xs text-stone-500">สาขาหลัก</p> : null}
                </td>
                <td className="p-3 font-semibold text-stone-700">{branch.code}</td>
                <td className="p-3">{number(branch.warehouses?.length ?? 0)} คลัง</td>
                <td className={`p-3 ${hiddenWhenEditingClass}`}>{branch.address ?? "-"}</td>
                <td className={`p-3 ${hiddenWhenEditingClass}`}>{branch.contactName ?? "-"}<p className="text-xs text-stone-500">{branch.contactPhone ?? ""}</p></td>
                <td className={`p-3 ${hiddenWhenEditingClass}`}><ReadinessBadges branch={branch} compact /></td>
                <td className={`max-w-56 p-3 text-sm text-stone-600 ${hiddenWhenEditingClass}`}>{branch.note ? <span className="line-clamp-2">{branch.note}</span> : "-"}</td>
                <td className="p-3"><span className={`rounded px-2 py-1 text-xs font-bold ${statusClass(branch.statusLabel)}`}>{branch.statusLabel}</span></td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-2">
                    <Link to={`/app/branches/${branch.id}/edit`}><Button type="button" variant="ghost" icon={<Pencil size={15} />}>แก้ไข</Button></Link>
                    <Button type="button" variant="secondary" icon={<Building2 size={15} />} onClick={() => goToBranchDashboard(branch.id)}>ไปดูสาขา</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!branches.isLoading && summaries.length === 0 ? (
        <Card className="text-center">
          <Building2 className="mx-auto text-stone-400" size={32} />
          <p className="mt-3 text-lg font-black text-ink">ยังไม่มีสาขา</p>
          <p className="mt-1 text-sm text-stone-600">เริ่มต้นด้วยการเพิ่มสาขาหลักของร้าน</p>
          <Button className="mt-4" type="button" onClick={() => startCreate({ name: "สาขาหลัก", code: "MAIN" })} icon={<Plus size={16} />}>เพิ่มสาขา</Button>
        </Card>
      ) : null}

      {!branches.isLoading && summaries.length > 0 && filteredSummaries.length === 0 ? (
        <Card className="text-center">
          <p className="text-lg font-black text-ink">ไม่พบข้อมูลที่ตรงกับเงื่อนไข</p>
          <p className="mt-1 text-sm text-stone-600">ลองเปลี่ยนคำค้นหาหรือตัวกรองสถานะ</p>
          <Button className="mt-4" type="button" variant="secondary" onClick={clearFilters} icon={<X size={16} />}>ล้างตัวกรอง</Button>
        </Card>
      ) : null}
    </div>
  );
}

export function BranchEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const session = useAuth((state) => state.session);
  const setWorkingBranchId = useWorkingBranch((state) => state.setWorkingBranchId);
  const branch = useQuery({ queryKey: ["branch", id], queryFn: () => api<StoreBranch>(`/branches/${id}`), enabled: Boolean(id) });
  const [form, setForm] = useState<StoreBranchForm>(emptyStoreBranchForm);
  const [message, setMessage] = useState("");
  const readiness = storeBranchReadinessItems(form);
  const readyCount = readiness.filter((item) => item.ready).length;

  useEffect(() => {
    if (!branch.data) return;
    setForm(toStoreBranchForm(branch.data));
    setMessage("");
  }, [branch.data]);

  const saveBranch = useMutation({
    mutationFn: (body: StoreBranchForm) => patch(`/branches/${id}`, body),
    onSuccess: () => {
      setMessage("บันทึกการแก้ไขสาขาแล้ว");
      queryClient.invalidateQueries({ queryKey: ["branch", id] });
      queryClient.invalidateQueries({ queryKey: ["branches"] });
      queryClient.invalidateQueries({ queryKey: ["business"] });
    },
    onError: (error) => setMessage(branchFormErrorMessage(error.message))
  });

  function updateForm<K extends keyof StoreBranchForm>(key: K, value: StoreBranchForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = trimStoreBranchForm(form);
    if (!id || !body.name || !body.code) return;
    setMessage("");
    saveBranch.mutate(body);
  }

  function goToBranchDashboard(branchId: string) {
    setWorkingBranchId(branchId);
    navigate(`${getSessionDashboardPath(session)}?branchId=${encodeURIComponent(branchId)}`);
  }

  if (branch.isLoading) return <Card>กำลังโหลดข้อมูลสาขา...</Card>;
  if (branch.error) return <Card className="text-red-700">โหลดข้อมูลสาขาไม่สำเร็จ: {branch.error.message}</Card>;
  if (!branch.data) return <Card>ไม่พบสาขานี้</Card>;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link to="/app/branches" className="inline-flex items-center gap-2 text-sm font-semibold text-stone-500 hover:text-ink">
            <ArrowLeft size={16} /> กลับไปหน้าจัดการสาขา
          </Link>
          <h1 className="mt-2 text-3xl font-black text-ink">แก้ไขสาขา</h1>
          <p className="mt-1 text-sm font-semibold text-stone-500">แก้ข้อมูลจุดขาย ผู้ดูแล และพื้นที่ปฏิบัติงานของ {branch.data.name}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => navigate(-1)} icon={<ArrowLeft size={16} />}>กลับไปหน้าก่อนหน้า</Button>
          <Button type="button" variant="secondary" onClick={() => goToBranchDashboard(branch.data.id)} icon={<Building2 size={16} />}>ไปดูสาขา</Button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <Card>
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-teal-50 text-leaf"><Building2 size={22} /></span>
            <div>
              <h2 className="text-xl font-black text-ink">ข้อมูลสาขา</h2>
              <p className="mt-1 text-sm font-semibold text-stone-500">ข้อมูลนี้จะแสดงในหน้าคลัง รายงาน และการจัดการทีม</p>
            </div>
          </div>

          <form onSubmit={submit} className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="text-sm font-black text-stone-700">ชื่อสาขา</span>
              <input className="field" value={form.name} onChange={(event) => updateForm("name", event.target.value)} required />
            </label>
            <label className="grid gap-1.5">
              <span className="text-sm font-black text-stone-700">รหัสสาขา</span>
              <input className="field uppercase" value={form.code} onChange={(event) => updateForm("code", event.target.value)} required />
            </label>
            <label className="grid gap-1.5">
              <span className="text-sm font-black text-stone-700">สถานะ</span>
              <Dropdown
                value={form.status}
                onValueChange={(nextValue) => updateForm("status", nextValue as BranchStatus)}
                options={[
                  { value: "ACTIVE", label: "เปิดใช้งาน" },
                  { value: "INACTIVE", label: "ปิดใช้งาน" }
                ]}
              />
            </label>
            <label className="grid gap-1.5 md:col-span-2">
              <span className="text-sm font-black text-stone-700">ที่อยู่ / พื้นที่ขาย</span>
              <input className="field" value={form.address} onChange={(event) => updateForm("address", event.target.value)} placeholder="เช่น ชั้น 1 โซน A หรือที่อยู่สาขา" />
            </label>
            <label className="grid gap-1.5">
              <span className="text-sm font-black text-stone-700">ผู้ดูแล</span>
              <input className="field" value={form.contactName} onChange={(event) => updateForm("contactName", event.target.value)} placeholder="ชื่อผู้รับผิดชอบ" />
            </label>
            <label className="grid gap-1.5">
              <span className="text-sm font-black text-stone-700">เบอร์ติดต่อ</span>
              <input className="field" value={form.contactPhone} onChange={(event) => updateForm("contactPhone", event.target.value)} placeholder="เช่น 080-000-0000" />
            </label>
            <label className="grid gap-1.5 md:col-span-2">
              <span className="text-sm font-black text-stone-700">หมายเหตุ</span>
              <textarea className="field min-h-28" value={form.note} onChange={(event) => updateForm("note", event.target.value)} placeholder="เช่น เวลาทำการ ข้อจำกัดพื้นที่ หรือหมายเหตุภายใน" />
            </label>
            {message ? <p className="rounded-md bg-stone-100 p-3 text-sm font-bold text-stone-700 md:col-span-2">{message}</p> : null}
            <div className="flex flex-wrap justify-end gap-2 md:col-span-2">
              <Link to="/app/branches"><Button type="button" variant="secondary">ยกเลิก</Button></Link>
              <Button disabled={saveBranch.isPending || !form.name.trim() || !form.code.trim()} icon={<Save size={16} />}>{saveBranch.isPending ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}</Button>
            </div>
          </form>
        </Card>

        <Card>
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-stone-100 text-stone-700"><CheckCircle2 size={22} /></span>
            <div>
              <h2 className="text-xl font-black text-ink">ความพร้อมสาขา</h2>
              <p className="mt-1 text-sm font-semibold text-stone-500">พร้อมแล้ว {readyCount}/{readiness.length} รายการ</p>
            </div>
          </div>
          <div className="mt-5 grid gap-2">
            {readiness.map((item) => (
              <div key={item.label} className="flex items-center justify-between rounded-md border border-stone-200 px-3 py-2">
                <span className="text-sm font-bold text-stone-700">{item.label}</span>
                <span className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-black ${item.ready ? "bg-teal-50 text-teal-700" : "bg-stone-100 text-stone-500"}`}>
                  {item.ready ? <CheckCircle2 size={13} /> : null}
                  {item.ready ? "พร้อม" : "ยังขาด"}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-md bg-stone-50 p-3 text-sm text-stone-600">
            <p><span className="font-bold text-ink">รหัสปัจจุบัน:</span> {branch.data.code}</p>
            <p className="mt-1"><span className="font-bold text-ink">สถานะ:</span> {branch.data.status === "ACTIVE" ? "เปิดใช้งาน" : "ปิดใช้งาน"}</p>
            {branch.data.isDefault ? <p className="mt-1 font-bold text-teal-700">สาขาหลักของร้าน</p> : null}
          </div>
        </Card>
      </div>
    </div>
  );
}

export function WarehousesPage() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const workingBranchId = useWorkingBranch((state) => state.workingBranchId);
  const requestedBranchId = searchParams.get("branchId") ?? "";
  const [form, setForm] = useState<BranchForm>(emptyBranchForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<BranchStatusFilter>("all");
  const storeBranches = useQuery({ queryKey: ["branches"], queryFn: () => api<StoreBranch[]>("/branches") });
  const selectedBranchId = requestedBranchId || workingBranchId || storeBranches.data?.[0]?.id || "";
  const branchScopeQuery = selectedBranchId ? `?branchId=${encodeURIComponent(selectedBranchId)}` : "";
  const warehouses = useQuery({ queryKey: ["warehouses", selectedBranchId], queryFn: () => api<Branch[]>(`/warehouses${branchScopeQuery}`), enabled: Boolean(selectedBranchId) });
  const balances = useQuery({ queryKey: ["inventory-balances", selectedBranchId], queryFn: () => api<Balance[]>(`/inventory/balances${branchScopeQuery}`), enabled: Boolean(selectedBranchId) });

  const summaries = useMemo(() => buildBranchSummaries(warehouses.data ?? [], balances.data ?? []), [warehouses.data, balances.data]);
  const filteredSummaries = useMemo(() => filterBranchSummaries(summaries, { search, status: statusFilter }), [summaries, search, statusFilter]);
  const totals = buildBranchTotals(summaries);
  const hasFilters = Boolean(search.trim()) || statusFilter !== "all";

  const saveBranch = useMutation({
    mutationFn: (body: BranchForm) => editingId ? patch(`/warehouses/${editingId}`, body) : post("/warehouses", body),
    onSuccess: () => {
      setForm(emptyBranchForm);
      setEditingId(null);
      setIsFormOpen(false);
      queryClient.invalidateQueries({ queryKey: ["branches"] });
      queryClient.invalidateQueries({ queryKey: ["warehouses"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-balances"] });
    }
  });
  const deleteWarehouse = useMutation({
    mutationFn: (id: string) => del(`/warehouses/${id}`),
    onSuccess: () => {
      setForm(emptyBranchForm);
      setEditingId(null);
      setIsFormOpen(false);
      queryClient.invalidateQueries({ queryKey: ["branches"] });
      queryClient.invalidateQueries({ queryKey: ["warehouses"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-balances"] });
    }
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const branchId = form.branchId.trim() || selectedBranchId;
    if (!form.name.trim() || !form.code.trim() || !branchId) return;
    saveBranch.mutate({ ...form, branchId });
  }

  function startEdit(branch: Branch) {
    setEditingId(branch.id);
    setForm({
      name: branch.name,
      code: branch.code,
      branchId: branch.branchId ?? branch.branch?.id ?? storeBranches.data?.[0]?.id ?? "",
      type: branch.type,
      status: branch.status,
      address: branch.address ?? "",
      contactName: branch.contactName ?? "",
      contactPhone: branch.contactPhone ?? "",
      note: branch.note ?? ""
    });
    setIsFormOpen(true);
  }

  function startCreate(initial?: Partial<BranchForm>) {
    setEditingId(null);
    setForm({ ...emptyBranchForm, branchId: selectedBranchId, ...initial });
    setIsFormOpen(true);
  }

  function updateForm<K extends keyof BranchForm>(key: K, value: BranchForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyBranchForm);
    setIsFormOpen(false);
  }

  function confirmDeleteWarehouse() {
    if (!editingId) return;
    const confirmed = window.confirm("ลบคลังนี้ถาวร? ระบบจะลบได้เฉพาะคลังที่ยังไม่มีสต็อกหรือประวัติรายการ");
    if (confirmed) deleteWarehouse.mutate(editingId);
  }

  function clearFilters() {
    setSearch("");
    setStatusFilter("all");
  }

  const summaryGridClass = isFormOpen ? "grid gap-4 sm:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3" : "grid gap-4 sm:grid-cols-2 xl:grid-cols-5";
  const filterGridClass = isFormOpen ? "grid gap-3 lg:grid-cols-1" : "grid gap-3 lg:grid-cols-[1fr_240px_auto]";

  return (
    <div className={`space-y-5 transition-[padding] duration-200 ${isFormOpen ? "xl:pr-[38rem]" : ""}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-black text-ink">จัดการคลัง</h1>
          <p className="text-stone-600">ทุกสาขามีคลังหลักอยู่แล้ว เพิ่มคลังเมื่อมีพื้นที่เก็บหรือ workflow แยกจริง</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => startCreate()} icon={<Plus size={16} />}>เพิ่มคลัง</Button>
          <Link to="/app/inventory/receipts"><Button variant="secondary" icon={<Boxes size={16} />}>รับสินค้าเข้า</Button></Link>
          <Link to="/app/inventory/adjustments"><Button variant="secondary" icon={<ClipboardList size={16} />}>ปรับสต็อก</Button></Link>
          <Link to="/app/transfers"><Button variant="secondary" icon={<Repeat size={16} />}>โอนสินค้า</Button></Link>
        </div>
      </div>

      <div className={summaryGridClass}>
        <StatCard label="คลังในสาขานี้" value={number(totals.totalBranches)} />
        <StatCard label="เปิดใช้งาน" value={number(totals.activeBranches)} tone="text-teal-700" />
        <StatCard label="สินค้าใกล้หมด/ควรเติม" value={number(totals.lowStockProducts)} tone="text-amber-700" />
        <StatCard label="สินค้าหมดสต็อก" value={number(totals.outOfStockProducts)} tone="text-red-700" />
        <StatCard label="มูลค่าสต็อกรวม" value={baht(totals.stockValue)} />
      </div>

      {isFormOpen ? (
        <div className="fixed inset-0 z-50 flex justify-end xl:pointer-events-none">
          <button className="absolute inset-0 bg-ink/45 xl:hidden" type="button" aria-label="ปิดฟอร์มคลัง" onClick={resetForm} />
          <aside className="relative flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl xl:pointer-events-auto xl:w-[36rem] xl:border-l xl:border-stone-200">
            <div className="flex items-start justify-between gap-4 border-b border-stone-200 p-5">
              <div>
                <h2 className="text-xl font-black text-ink">{editingId ? "แก้ไขคลัง" : "เพิ่มคลังแยก"}</h2>
                <p className="mt-1 text-sm text-stone-600">ใช้เมื่อสาขานี้มีพื้นที่เก็บหรือขั้นตอนทำงานที่ต้องแยกจากคลังหลัก</p>
              </div>
              <Button type="button" variant="ghost" className="h-10 w-10 px-0" onClick={resetForm} aria-label="ปิดฟอร์มคลัง" icon={<X size={18} />} />
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <form onSubmit={submit} className="grid gap-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label>
                    <span className="text-sm font-semibold text-ink">ชื่อคลัง</span>
                    <input className="field mt-1" value={form.name} onChange={(event) => updateForm("name", event.target.value)} placeholder="เช่น หน้าร้านหลัก" required />
                  </label>
                  <label>
                    <span className="text-sm font-semibold text-ink">รหัสคลัง</span>
                    <input className="field mt-1 uppercase" value={form.code} onChange={(event) => updateForm("code", event.target.value)} placeholder="เช่น MAIN, STORE-01" required />
                  </label>
                  <label>
                    <span className="text-sm font-semibold text-ink">ประเภท</span>
                    <Dropdown
                      buttonClassName="mt-1"
                      value={form.type}
                      onValueChange={(nextValue) => updateForm("type", nextValue as BranchType)}
                      options={Object.entries(branchTypeLabels).map(([value, label]) => ({ value, label }))}
                    />
                  </label>
                  <label>
                    <span className="text-sm font-semibold text-ink">สถานะ</span>
                    <Dropdown
                      buttonClassName="mt-1"
                      value={form.status}
                      onValueChange={(nextValue) => updateForm("status", nextValue as BranchStatus)}
                      options={[
                        { value: "ACTIVE", label: "เปิดใช้งาน" },
                        { value: "INACTIVE", label: "ปิดใช้งาน" }
                      ]}
                    />
                  </label>
                </div>
                <label>
                  <span className="text-sm font-semibold text-ink">ที่อยู่ / ตำแหน่งจัดเก็บ</span>
                  <input className="field mt-1" value={form.address} onChange={(event) => updateForm("address", event.target.value)} placeholder="เช่น หลังร้าน ชั้น 2 หรือโซน A" />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label>
                    <span className="text-sm font-semibold text-ink">ผู้ดูแล</span>
                    <input className="field mt-1" value={form.contactName} onChange={(event) => updateForm("contactName", event.target.value)} placeholder="ชื่อผู้รับผิดชอบ" />
                  </label>
                  <label>
                    <span className="text-sm font-semibold text-ink">เบอร์ติดต่อ</span>
                    <input className="field mt-1" value={form.contactPhone} onChange={(event) => updateForm("contactPhone", event.target.value)} placeholder="เช่น 080-000-0000" />
                  </label>
                </div>
                <label>
                  <span className="text-sm font-semibold text-ink">หมายเหตุ</span>
                  <textarea className="field mt-1 min-h-28" value={form.note} onChange={(event) => updateForm("note", event.target.value)} placeholder="เช่น เวลารับของ เงื่อนไขการเก็บ หรือหมายเหตุภายใน" />
                </label>
                <div className="sticky bottom-0 -mx-5 mt-2 grid gap-3 border-t border-stone-200 bg-white p-5 shadow-[0_-8px_18px_rgba(15,23,42,0.06)]">
                  {saveBranch.error || deleteWarehouse.error ? (
                    <div className="rounded-md bg-red-50 p-3 text-sm font-semibold text-red-700">
                      {saveBranch.error?.message ?? deleteWarehouse.error?.message}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap justify-between gap-2">
                    <div>
                      {editingId ? (
                        <Button type="button" variant="danger" onClick={confirmDeleteWarehouse} disabled={deleteWarehouse.isPending} icon={<Trash2 size={16} />}>ลบคลัง</Button>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button type="button" variant="secondary" onClick={resetForm}>ยกเลิก</Button>
                      <Button type="submit" disabled={saveBranch.isPending || deleteWarehouse.isPending || !form.name.trim() || !form.code.trim() || !selectedBranchId} icon={<Plus size={16} />}>{editingId ? "บันทึกคลัง" : "เพิ่มคลัง"}</Button>
                    </div>
                  </div>
                </div>
              </form>
            </div>
          </aside>
        </div>
      ) : null}

      <Card>
        <div className={filterGridClass}>
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={16} />
            <input className="field field-with-left-icon" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหาชื่อคลัง รหัสคลัง หรือประเภท" />
          </label>
          <label className="relative">
            <SlidersHorizontal className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={16} />
            <Dropdown
              value={statusFilter}
              onValueChange={(nextValue) => setStatusFilter(nextValue as BranchStatusFilter)}
              buttonClassName="field-with-select-icons"
              options={[
                { value: "all", label: "ทุกสถานะ" },
                { value: "active", label: "เปิดใช้งาน" },
                { value: "inactive", label: "ปิดใช้งาน" },
                { value: "hasLowStock", label: "มีสินค้าใกล้หมด/ควรเติม" },
                { value: "hasOutOfStock", label: "มีสินค้าหมดสต็อก" }
              ]}
            />
          </label>
          {hasFilters ? <Button type="button" variant="ghost" onClick={clearFilters} icon={<X size={16} />}>ล้างตัวกรอง</Button> : null}
        </div>
      </Card>

      {filteredSummaries.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filteredSummaries.map((warehouse) => (
            <article key={warehouse.id} className="flex min-h-[17rem] flex-col rounded-lg border border-stone-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-leaf/50 hover:shadow-md">
              <div className="min-w-0">
                <Link to={`/app/warehouses/${warehouse.id}`} className="block truncate text-lg font-black text-ink hover:text-leaf">{warehouse.name}</Link>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="rounded bg-stone-100 px-2 py-1 text-xs font-bold text-stone-700">{warehouse.code}</span>
                  <span className={`rounded px-2 py-1 text-xs font-bold ${statusClass(warehouse.statusLabel)}`}>{warehouse.statusLabel}</span>
                </div>
              </div>
              {warehouse.isDefault ? <p className="mt-2 text-xs text-stone-500">คลังหลักของร้าน</p> : null}
              <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-md bg-stone-50 p-3">
                  <p className="text-xs font-bold text-stone-500">สินค้าที่มีรายการ</p>
                  <p className="mt-1 font-black text-ink">{number(warehouse.productCount)}</p>
                </div>
                <div className="rounded-md bg-stone-50 p-3">
                  <p className="text-xs font-bold text-stone-500">มูลค่า</p>
                  <p className="mt-1 truncate font-black text-ink">{baht(warehouse.stockValue)}</p>
                </div>
                {warehouse.lowStockCount > 0 ? (
                  <div className="rounded-md bg-amber-50 p-3">
                    <p className="text-xs font-bold text-amber-800">ใกล้หมด/ควรเติม</p>
                    <p className="mt-1 font-black text-amber-700">{number(warehouse.lowStockCount)}</p>
                  </div>
                ) : null}
                {warehouse.outOfStockCount > 0 ? (
                  <div className="rounded-md bg-red-50 p-3">
                    <p className="text-xs font-bold text-red-800">หมดสต็อก</p>
                    <p className="mt-1 font-black text-red-700">{number(warehouse.outOfStockCount)}</p>
                  </div>
                ) : null}
              </div>
              <div className="mt-auto flex flex-wrap gap-2 pt-4">
                <Link to={`/app/warehouses/${warehouse.id}`}><Button variant="secondary" icon={<ClipboardList size={15} />}>ดูข้อมูล</Button></Link>
                <Button type="button" variant="secondary" onClick={() => startEdit(warehouse)} icon={<Pencil size={15} />}>แก้ไข</Button>
                <Link to={`/app/inventory/receipts?branchId=${warehouse.branchId ?? selectedBranchId}&warehouseId=${warehouse.id}`}><Button variant="ghost" icon={<Boxes size={15} />}>รับเข้า</Button></Link>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {!warehouses.isLoading && summaries.length === 0 && selectedBranchId ? (
        <Card className="text-center">
          <p className="font-black text-ink">ยังไม่มีคลังในสาขานี้</p>
          <Button className="mt-4" type="button" onClick={() => startCreate({ branchId: selectedBranchId })} icon={<Plus size={16} />}>เพิ่มคลัง</Button>
        </Card>
      ) : null}

      {!storeBranches.isLoading && !warehouses.isLoading && summaries.length === 0 && !selectedBranchId ? (
        <Card className="text-center">
          <p className="text-lg font-black text-ink">ยังไม่มีคลังหรือสาขา</p>
          <p className="mt-1 text-sm text-stone-600">เริ่มต้นด้วยการเพิ่มคลังหน้าร้าน</p>
          <Button className="mt-4" type="button" onClick={() => startCreate({ name: "หน้าร้าน", code: "WH-MAIN", type: "STORE_FRONT" })} icon={<Plus size={16} />}>เพิ่มคลัง</Button>
        </Card>
      ) : null}

      {!warehouses.isLoading && summaries.length > 0 && filteredSummaries.length === 0 ? (
        <Card className="text-center">
          <p className="text-lg font-black text-ink">ไม่พบข้อมูลที่ตรงกับเงื่อนไข</p>
          <p className="mt-1 text-sm text-stone-600">ลองเปลี่ยนคำค้นหาหรือตัวกรองสถานะ</p>
          <Button className="mt-4" type="button" variant="secondary" onClick={clearFilters} icon={<X size={16} />}>ล้างตัวกรอง</Button>
        </Card>
      ) : null}
    </div>
  );
}

export function WarehouseDetailPage() {
  const { id } = useParams();
  const branch = useQuery({ queryKey: ["warehouses", id], queryFn: () => api<Branch>(`/warehouses/${id}`), enabled: Boolean(id) });
  const data = branch.data;
  const balances = data?.balances ?? [];
  const movements = data?.movements ?? [];
  const summary = data ? buildBranchSummaries([data], balances)[0] : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link to="/app/warehouses" className="text-sm font-semibold text-leaf">กลับไปคลังทั้งหมด</Link>
          <h1 className="mt-1 text-3xl font-black text-ink">{data?.name ?? "รายละเอียดคลัง"}</h1>
          <p className="text-stone-600">{data ? `${branchTypeLabel(data)} • ${data.code}` : "กำลังโหลดข้อมูลคลัง"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/app/inventory/receipts?branchId=${data?.branchId ?? ""}&warehouseId=${id ?? ""}`}><Button icon={<Boxes size={16} />}>รับเข้า</Button></Link>
          <Link to={`/app/inventory/adjustments?branchId=${data?.branchId ?? ""}&warehouseId=${id ?? ""}`}><Button variant="secondary" icon={<ClipboardList size={16} />}>ปรับสต็อก</Button></Link>
          <Link to={`/app/transfers?sourceWarehouseId=${id ?? ""}`}><Button variant="secondary" icon={<Repeat size={16} />}>โอนสินค้า</Button></Link>
          <Link to={`/app/reports/stock?branchId=${data?.branchId ?? ""}&warehouseId=${id ?? ""}`}><Button variant="secondary" icon={<Boxes size={16} />}>สินค้าต้องเติม</Button></Link>
        </div>
      </div>

      {branch.error ? <Card><p className="text-sm text-red-700">{branch.error.message}</p></Card> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="จำนวนสินค้าในคลัง" value={number(summary?.productCount ?? 0)} />
        <StatCard label="มูลค่าสต็อก" value={baht(summary?.stockValue ?? 0)} />
        <StatCard label="สินค้าใกล้หมด/ควรเติม" value={number(summary?.lowStockCount ?? 0)} tone="text-amber-700" />
        <StatCard label="สินค้าหมดสต็อก" value={number(summary?.outOfStockCount ?? 0)} tone="text-red-700" />
        <StatCard label="สถานะ" value={summary?.statusLabel ?? "เปิดใช้งาน"} tone="text-teal-700" />
      </div>

      <Card>
        <h2 className="text-xl font-black text-ink">ข้อมูลคลัง</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-md bg-stone-50 p-3">
            <p className="text-xs font-bold uppercase text-stone-500">รหัสคลัง</p>
            <p className="mt-1 font-semibold text-ink">{data?.code ?? "-"}</p>
          </div>
          <div className="rounded-md bg-stone-50 p-3">
            <p className="text-xs font-bold uppercase text-stone-500">ประเภท</p>
            <p className="mt-1 font-semibold text-ink">{data ? branchTypeLabels[data.type] : "-"}</p>
          </div>
          <div className="rounded-md bg-stone-50 p-3">
            <p className="text-xs font-bold uppercase text-stone-500">ที่อยู่ / ตำแหน่งจัดเก็บ</p>
            <p className="mt-1 font-semibold text-ink">{data?.address ?? "-"}</p>
          </div>
          <div className="rounded-md bg-stone-50 p-3">
            <p className="text-xs font-bold uppercase text-stone-500">ผู้ดูแล</p>
            <p className="mt-1 font-semibold text-ink">{data?.contactName ?? "-"}</p>
          </div>
          <div className="rounded-md bg-stone-50 p-3">
            <p className="text-xs font-bold uppercase text-stone-500">เบอร์ติดต่อ</p>
            <p className="mt-1 font-semibold text-ink">{data?.contactPhone ?? "-"}</p>
          </div>
          <div className="rounded-md bg-stone-50 p-3 md:col-span-2 xl:col-span-3">
            <p className="text-xs font-bold uppercase text-stone-500">หมายเหตุ</p>
            <p className="mt-1 font-semibold text-ink">{data?.note ?? "-"}</p>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="text-xl font-black text-ink">สินค้าในคลัง</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="bg-stone-50 text-stone-500">
              <tr>
                <th className="p-3">สินค้า</th>
                <th className="p-3">SKU / Barcode</th>
                <th className="p-3">คงเหลือในคลังนี้</th>
                <th className="p-3">จุดแจ้งเตือน</th>
                <th className="p-3">สถานะสต็อก</th>
                <th className="p-3">ราคาทุน</th>
                <th className="p-3">มูลค่าสต็อก</th>
                <th className="p-3">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {balances.map((balance) => {
                const stockStatus = stockStatusOf(balance);
                return (
                  <tr key={balance.productId} className="border-t border-stone-100">
                    <td className="p-3 font-semibold">{balance.product.name}</td>
                    <td className="p-3">{balance.product.sku}<p className="text-xs text-stone-500">{balance.product.barcode ?? "ไม่มี barcode"}</p></td>
                    <td className="p-3">{number(balance.quantity)}</td>
                    <td className="p-3">{number(balance.product.minStock)}</td>
                    <td className="p-3"><span className={`rounded px-2 py-1 text-xs font-bold ${statusClass(stockStatus)}`}>{stockStatus}</span></td>
                    <td className="p-3">{baht(balance.product.costPrice)}</td>
                    <td className="p-3 font-semibold">{baht(balance.quantity * Number(balance.product.costPrice ?? 0))}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-2">
                        <Link to={`/app/products/${balance.product.id}`}><Button variant="secondary">ดูสินค้า</Button></Link>
                        <Link to={`/app/inventory/receipts?branchId=${data?.branchId ?? ""}&warehouseId=${id ?? ""}&productId=${balance.product.id}`}><Button variant="ghost">รับเข้า</Button></Link>
                        <Link to={`/app/inventory/adjustments?branchId=${data?.branchId ?? ""}&warehouseId=${id ?? ""}&productId=${balance.product.id}`}><Button variant="ghost">ปรับสต็อก</Button></Link>
                        <Link to={`/app/transfers?sourceWarehouseId=${id ?? ""}&productId=${balance.product.id}`}><Button variant="ghost">โอนสินค้า</Button></Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!branch.isLoading && balances.length === 0 ? (
          <div className="mt-4 rounded-md border border-dashed border-stone-300 p-6 text-center">
            <p className="font-black text-ink">ยังไม่มีสินค้าในคลังนี้</p>
            <Link to={`/app/inventory/receipts?branchId=${data?.branchId ?? ""}&warehouseId=${id ?? ""}`}><Button className="mt-4" icon={<Boxes size={16} />}>รับสินค้าเข้า</Button></Link>
          </div>
        ) : null}
      </Card>

      <Card>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-black text-ink">ประวัติความเคลื่อนไหวล่าสุด</h2>
          <Link to={`/app/inventory/movements?warehouseId=${id ?? ""}`}><Button variant="secondary">ดูประวัติทั้งหมด</Button></Link>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-stone-50 text-stone-500">
              <tr><th className="p-3">วันที่</th><th className="p-3">ประเภท</th><th className="p-3">สินค้า</th><th className="p-3">จำนวน</th><th className="p-3">จาก/ไปคลัง</th><th className="p-3">ผู้ทำรายการ</th><th className="p-3">หมายเหตุ</th></tr>
            </thead>
            <tbody>
              {movements.map((movement) => (
                <tr key={movement.id} className="border-t border-stone-100">
                  <td className="p-3">{thaiDate(movement.createdAt)}</td>
                  <td className="p-3"><span className={`rounded px-2 py-1 text-xs font-bold ${movementBadgeClass(movement.type)}`}>{movementLabel(movement)}</span></td>
                  <td className="p-3 font-semibold">{movement.product.name}</td>
                  <td className="p-3">{movementQuantityText(movement)}</td>
                  <td className="p-3">{data?.name ?? "-"}</td>
                  <td className="p-3">{movement.user?.name ?? "ไม่ระบุ"}</td>
                  <td className="p-3">{movement.reason ?? movement.reference ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!branch.isLoading && movements.length === 0 ? <p className="mt-4 text-sm text-stone-500">ยังไม่มีประวัติความเคลื่อนไหวของคลังนี้</p> : null}
      </Card>
    </div>
  );
}
