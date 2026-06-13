import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, ClipboardList, Eye, Pencil, Plus, Repeat, Search, SlidersHorizontal, X } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { api, patch, post } from "../lib/api";
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
import { baht, number, thaiDate } from "../lib/format";

type Branch = BranchRecord & {
  createdAt?: string;
  balances?: Balance[];
  movements?: Movement[];
};

type Balance = BranchBalanceRecord & {
  id?: string;
  productId: string;
  product: BranchBalanceRecord["product"] & { barcode?: string | null };
};

type Movement = {
  id: string;
  branchId: string;
  type: string;
  quantity: number;
  balanceBefore?: number | null;
  balanceAfter?: number;
  reason?: string | null;
  reference?: string | null;
  createdAt: string;
  product: { id: string; name: string };
  user?: { name: string } | null;
};

type BranchForm = {
  name: string;
  code: string;
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
  type: "BRANCH",
  status: "ACTIVE",
  address: "",
  contactName: "",
  contactPhone: "",
  note: ""
};

const branchTypeLabels: Record<BranchType, string> = {
  MAIN_WAREHOUSE: "คลังหลัก",
  STORE_FRONT: "หน้าร้าน",
  BRANCH: "สาขา",
  SECONDARY_WAREHOUSE: "คลังสำรอง"
};

const movementLabels: Record<string, string> = {
  RECEIVE_IN: "รับเข้า",
  ADJUSTMENT_IN: "ปรับเพิ่ม",
  ADJUSTMENT_OUT: "ปรับลด",
  SALE_OUT: "ขายออก"
};

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

function TypeBadge({ children }: { children: string }) {
  return <span className="rounded bg-stone-100 px-2 py-1 text-xs font-bold text-stone-700">{children}</span>;
}

export function BranchesPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<BranchForm>(emptyBranchForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<BranchStatusFilter>("all");
  const branches = useQuery({ queryKey: ["branches"], queryFn: () => api<Branch[]>("/branches") });
  const balances = useQuery({ queryKey: ["inventory-balances"], queryFn: () => api<Balance[]>("/inventory/balances") });

  const summaries = useMemo(() => buildBranchSummaries(branches.data ?? [], balances.data ?? []), [branches.data, balances.data]);
  const filteredSummaries = useMemo(() => filterBranchSummaries(summaries, { search, status: statusFilter }), [summaries, search, statusFilter]);
  const totals = buildBranchTotals(summaries);
  const hasFilters = Boolean(search.trim()) || statusFilter !== "all";

  const saveBranch = useMutation({
    mutationFn: (body: BranchForm) => editingId ? patch(`/branches/${editingId}`, body) : post("/branches", body),
    onSuccess: () => {
      setForm(emptyBranchForm);
      setEditingId(null);
      setIsFormOpen(false);
      queryClient.invalidateQueries({ queryKey: ["branches"] });
    }
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.name.trim() || !form.code.trim()) return;
    saveBranch.mutate(form);
  }

  function startEdit(branch: Branch) {
    setEditingId(branch.id);
    setForm({
      name: branch.name,
      code: branch.code,
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
    setForm({ ...emptyBranchForm, ...initial });
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

  function clearFilters() {
    setSearch("");
    setStatusFilter("all");
  }

  return (
    <div className={`space-y-5 transition-[padding] duration-200 ${isFormOpen ? "xl:pr-[38rem]" : ""}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-black text-ink">สาขา / คลัง</h1>
          <p className="text-stone-600">จัดการสถานที่เก็บสินค้า ดูยอดคงเหลือ และภาพรวมสต็อกแยกตามสาขา/คลัง</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => startCreate()} icon={<Plus size={16} />}>เพิ่มคลัง</Button>
          <Link to="/app/inventory/receipts"><Button variant="secondary" icon={<Boxes size={16} />}>รับสินค้าเข้า</Button></Link>
          <Link to="/app/inventory/adjustments"><Button variant="secondary" icon={<ClipboardList size={16} />}>ปรับสต็อก</Button></Link>
          <Link to="/app/transfers"><Button variant="secondary" icon={<Repeat size={16} />}>โอนสินค้า</Button></Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="คลังทั้งหมด" value={number(totals.totalBranches)} />
        <StatCard label="เปิดใช้งาน" value={number(totals.activeBranches)} tone="text-teal-700" />
        <StatCard label="สินค้าใกล้หมด" value={number(totals.lowStockProducts)} tone="text-amber-700" />
        <StatCard label="สินค้าหมดสต็อก" value={number(totals.outOfStockProducts)} tone="text-red-700" />
        <StatCard label="มูลค่าสต็อกรวม" value={baht(totals.stockValue)} />
      </div>

      {isFormOpen ? (
        <div className="fixed inset-0 z-50 flex justify-end xl:pointer-events-none">
          <button className="absolute inset-0 bg-ink/45 xl:hidden" type="button" aria-label="ปิดฟอร์มคลัง" onClick={resetForm} />
          <aside className="relative flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl xl:pointer-events-auto xl:w-[36rem] xl:border-l xl:border-stone-200">
            <div className="flex items-start justify-between gap-4 border-b border-stone-200 p-5">
              <div>
                <h2 className="text-xl font-black text-ink">{editingId ? "แก้ไขคลัง" : "เพิ่มคลังใหม่"}</h2>
                <p className="mt-1 text-sm text-stone-600">ระบุข้อมูลคลังที่ใช้แยกสถานที่เก็บสินค้าและค้นหาย้อนหลังได้จริง</p>
              </div>
              <Button type="button" variant="ghost" className="h-10 w-10 px-0" onClick={resetForm} aria-label="ปิดฟอร์มคลัง" icon={<X size={18} />} />
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <form onSubmit={submit} className="grid gap-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label>
                    <span className="text-sm font-semibold text-ink">ชื่อคลัง / สาขา</span>
                    <input className="field mt-1" value={form.name} onChange={(event) => updateForm("name", event.target.value)} placeholder="เช่น หน้าร้านหลัก" required />
                  </label>
                  <label>
                    <span className="text-sm font-semibold text-ink">รหัสคลัง</span>
                    <input className="field mt-1 uppercase" value={form.code} onChange={(event) => updateForm("code", event.target.value)} placeholder="เช่น MAIN, STORE-01" required />
                  </label>
                  <label>
                    <span className="text-sm font-semibold text-ink">ประเภท</span>
                    <select className="field mt-1" value={form.type} onChange={(event) => updateForm("type", event.target.value as BranchType)}>
                      {Object.entries(branchTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  <label>
                    <span className="text-sm font-semibold text-ink">สถานะ</span>
                    <select className="field mt-1" value={form.status} onChange={(event) => updateForm("status", event.target.value as BranchStatus)}>
                      <option value="ACTIVE">เปิดใช้งาน</option>
                      <option value="INACTIVE">ปิดใช้งาน</option>
                    </select>
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
                {saveBranch.error ? <p className="text-sm text-red-700">{saveBranch.error.message}</p> : null}
                <div className="sticky bottom-0 -mx-5 mt-2 flex flex-wrap justify-end gap-2 border-t border-stone-200 bg-white p-5">
                  <Button type="button" variant="secondary" onClick={resetForm}>ยกเลิก</Button>
                  <Button type="submit" disabled={saveBranch.isPending || !form.name.trim() || !form.code.trim()} icon={<Plus size={16} />}>{editingId ? "บันทึกคลัง" : "เพิ่มคลัง"}</Button>
                </div>
              </form>
            </div>
          </aside>
        </div>
      ) : null}

      <Card>
        <div className="grid gap-3 lg:grid-cols-[1fr_240px_auto]">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={16} />
            <input className="field pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหาชื่อคลัง รหัสคลัง หรือประเภท" />
          </label>
          <label className="relative">
            <SlidersHorizontal className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={16} />
            <select className="field pl-9" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as BranchStatusFilter)}>
              <option value="all">ทุกสถานะ</option>
              <option value="active">เปิดใช้งาน</option>
              <option value="inactive">ปิดใช้งาน</option>
              <option value="hasLowStock">มีสินค้าใกล้หมด</option>
              <option value="hasOutOfStock">มีสินค้าหมดสต็อก</option>
            </select>
          </label>
          {hasFilters ? <Button type="button" variant="ghost" onClick={clearFilters} icon={<X size={16} />}>ล้างตัวกรอง</Button> : null}
        </div>
      </Card>

      <div className="table-shell">
        <table className="w-full min-w-[1080px] text-left text-sm">
          <thead className="bg-stone-50 text-stone-500">
            <tr>
              <th className="p-3">ชื่อคลัง/สาขา</th>
              <th className="p-3">รหัสคลัง</th>
              <th className="p-3">ประเภท</th>
              <th className="p-3">สินค้าในคลัง</th>
              <th className="p-3">มูลค่าสต็อก</th>
              <th className="p-3">ใกล้หมด</th>
              <th className="p-3">หมดสต็อก</th>
              <th className="p-3">สถานะ</th>
              <th className="p-3">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {filteredSummaries.map((branch) => (
              <tr key={branch.id} className="border-t border-stone-100 hover:bg-stone-50">
                <td className="p-3">
                  <Link to={`/app/branches/${branch.id}`} className="font-bold text-ink hover:text-leaf">{branch.name}</Link>
                  {branch.isDefault ? <p className="text-xs text-stone-500">คลังหลักของร้าน</p> : null}
                </td>
                <td className="p-3 font-semibold text-stone-700">{branch.code}</td>
                <td className="p-3"><TypeBadge>{branch.typeLabel}</TypeBadge></td>
                <td className="p-3">{number(branch.productCount)} รายการ</td>
                <td className="p-3 font-semibold">{baht(branch.stockValue)}</td>
                <td className="p-3"><span className="font-black text-amber-700">{number(branch.lowStockCount)}</span></td>
                <td className="p-3"><span className="font-black text-red-700">{number(branch.outOfStockCount)}</span></td>
                <td className="p-3"><span className={`rounded px-2 py-1 text-xs font-bold ${statusClass(branch.statusLabel)}`}>{branch.statusLabel}</span></td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-2">
                    <Link to={`/app/branches/${branch.id}`}><Button variant="secondary" icon={<Eye size={15} />}>ดูรายละเอียด</Button></Link>
                    <Button type="button" variant="ghost" onClick={() => startEdit(branch)} icon={<Pencil size={15} />}>แก้ไข</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!branches.isLoading && summaries.length === 0 ? (
        <Card className="text-center">
          <p className="text-lg font-black text-ink">ยังไม่มีคลังหรือสาขา</p>
          <p className="mt-1 text-sm text-stone-600">เริ่มต้นด้วยการเพิ่มคลังหลักของร้าน</p>
          <Button className="mt-4" type="button" onClick={() => startCreate({ name: "คลังหลัก", code: "MAIN", type: "MAIN_WAREHOUSE" })} icon={<Plus size={16} />}>เพิ่มคลัง</Button>
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

export function BranchDetailPage() {
  const { id } = useParams();
  const branch = useQuery({ queryKey: ["branches", id], queryFn: () => api<Branch>(`/branches/${id}`), enabled: Boolean(id) });
  const data = branch.data;
  const balances = data?.balances ?? [];
  const movements = data?.movements ?? [];
  const summary = data ? buildBranchSummaries([data], balances)[0] : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link to="/app/branches" className="text-sm font-semibold text-leaf">กลับไปคลังทั้งหมด</Link>
          <h1 className="mt-1 text-3xl font-black text-ink">{data?.name ?? "รายละเอียดคลัง"}</h1>
          <p className="text-stone-600">{data ? `${branchTypeLabel(data)} • ${data.code}` : "กำลังโหลดข้อมูลคลัง"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/app/inventory/receipts?branchId=${id ?? ""}`}><Button icon={<Boxes size={16} />}>รับเข้า</Button></Link>
          <Link to={`/app/inventory/adjustments?branchId=${id ?? ""}`}><Button variant="secondary" icon={<ClipboardList size={16} />}>ปรับสต็อก</Button></Link>
          <Link to={`/app/transfers?sourceBranchId=${id ?? ""}`}><Button variant="secondary" icon={<Repeat size={16} />}>โอนสินค้า</Button></Link>
        </div>
      </div>

      {branch.error ? <Card><p className="text-sm text-red-700">{branch.error.message}</p></Card> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="จำนวนสินค้าในคลัง" value={number(summary?.productCount ?? 0)} />
        <StatCard label="มูลค่าสต็อก" value={baht(summary?.stockValue ?? 0)} />
        <StatCard label="สินค้าใกล้หมด" value={number(summary?.lowStockCount ?? 0)} tone="text-amber-700" />
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
                        <Link to={`/app/inventory/receipts?branchId=${id ?? ""}&productId=${balance.product.id}`}><Button variant="ghost">รับเข้า</Button></Link>
                        <Link to={`/app/inventory/adjustments?branchId=${id ?? ""}&productId=${balance.product.id}`}><Button variant="ghost">ปรับสต็อก</Button></Link>
                        <Link to={`/app/transfers?sourceBranchId=${id ?? ""}&productId=${balance.product.id}`}><Button variant="ghost">โอนสินค้า</Button></Link>
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
            <Link to={`/app/inventory/receipts?branchId=${id ?? ""}`}><Button className="mt-4" icon={<Boxes size={16} />}>รับสินค้าเข้า</Button></Link>
          </div>
        ) : null}
      </Card>

      <Card>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-black text-ink">ประวัติความเคลื่อนไหวล่าสุด</h2>
          <Link to={`/app/inventory/movements?branchId=${id ?? ""}`}><Button variant="secondary">ดูประวัติทั้งหมด</Button></Link>
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
                  <td className="p-3"><span className={`rounded px-2 py-1 text-xs font-bold ${movementBadgeClass(movement.type)}`}>{movementLabels[movement.type] ?? movement.type}</span></td>
                  <td className="p-3 font-semibold">{movement.product.name}</td>
                  <td className="p-3">{number(movement.quantity)}</td>
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
