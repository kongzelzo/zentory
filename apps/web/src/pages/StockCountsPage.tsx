import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, CheckCircle2, ClipboardCheck, History, PackageSearch, Search, SlidersHorizontal, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Dropdown } from "../components/Dropdown";
import { api, patch, post } from "../lib/api";
import { number, thaiDate } from "../lib/format";
import { getProductDisplayName } from "../lib/products";
import { useWorkingBranch } from "../state/working-branch";

type StockCountStatus = "COUNTING" | "REVIEW" | "APPLIED" | "CANCELED";
type WarehouseOption = { id: string; branchId: string; name: string; code: string; branch?: { name: string } };
type StockCountSummary = {
  totalItems: number;
  countedItems: number;
  uncountedItems: number;
  differentItems: number;
  increaseQuantity: number;
  decreaseQuantity: number;
};
type StockCountListRow = {
  id: string;
  documentNo: string;
  status: StockCountStatus;
  note?: string | null;
  startedAt: string;
  completedAt?: string | null;
  appliedAt?: string | null;
  warehouse: { id: string; name: string; code: string; branch?: { name: string } };
  user?: { name: string };
  summary: StockCountSummary;
};
type StockCountItem = {
  id: string;
  productId: string;
  systemQuantity: number;
  countedQuantity: number | null;
  difference: number | null;
  note?: string | null;
  product: {
    id: string;
    sku: string;
    barcode?: string | null;
    name: string;
    variantColor?: string | null;
    variantSize?: string | null;
    unit?: string;
    category?: { name: string } | null;
    brand?: { name: string } | null;
  };
};
type StockCountDetail = StockCountListRow & { items: StockCountItem[] };
type ItemEdit = { countedQuantity: string; note: string };

const statusLabels: Record<StockCountStatus, string> = {
  COUNTING: "กำลังนับ",
  REVIEW: "รอตรวจทาน",
  APPLIED: "ปรับสต็อกแล้ว",
  CANCELED: "ยกเลิก"
};

const statusClasses: Record<StockCountStatus, string> = {
  COUNTING: "bg-sky-50 text-sky-700",
  REVIEW: "bg-amber-50 text-amber-800",
  APPLIED: "bg-emerald-50 text-emerald-700",
  CANCELED: "bg-stone-100 text-stone-500"
};

function buildItemEdits(count?: StockCountDetail): Record<string, ItemEdit> {
  if (!count) return {};
  return Object.fromEntries(count.items.map((item) => [
    item.productId,
    {
      countedQuantity: item.countedQuantity === null ? "" : String(item.countedQuantity),
      note: item.note ?? ""
    }
  ]));
}

function parsedCountedQuantity(value: string) {
  if (value.trim() === "") return null;
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function adjustmentHref(warehouseId?: string) {
  return warehouseId ? `/app/inventory/adjustments?warehouseId=${encodeURIComponent(warehouseId)}` : "/app/inventory/adjustments";
}

function summaryFromItems(items: StockCountItem[], edits: Record<string, ItemEdit>) {
  const rows = items.map((item) => {
    const countedQuantity = parsedCountedQuantity(edits[item.productId]?.countedQuantity ?? "");
    return { countedQuantity, difference: countedQuantity === null ? null : countedQuantity - item.systemQuantity };
  });
  return {
    totalItems: rows.length,
    countedItems: rows.filter((row) => row.countedQuantity !== null).length,
    uncountedItems: rows.filter((row) => row.countedQuantity === null).length,
    differentItems: rows.filter((row) => row.difference !== null && row.difference !== 0).length,
    increaseQuantity: rows.reduce((sum, row) => sum + Math.max(row.difference ?? 0, 0), 0),
    decreaseQuantity: rows.reduce((sum, row) => sum + Math.abs(Math.min(row.difference ?? 0, 0)), 0)
  };
}

function StockCountStat({ label, value, tone = "text-ink" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-md bg-stone-50 p-3">
      <p className="text-xs font-bold text-stone-500">{label}</p>
      <p className={`mt-1 text-xl font-black ${tone}`}>{value}</p>
    </div>
  );
}

export function StockCountsPage() {
  const [searchParams] = useSearchParams();
  const requestedWarehouseId = searchParams.get("warehouseId") ?? "";
  const workingBranchId = useWorkingBranch((state) => state.workingBranchId);
  const queryClient = useQueryClient();
  const [warehouseId, setWarehouseId] = useState(requestedWarehouseId);
  const [note, setNote] = useState("");
  const [activeId, setActiveId] = useState("");
  const [search, setSearch] = useState("");
  const [edits, setEdits] = useState<Record<string, ItemEdit>>({});
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const warehouses = useQuery({ queryKey: ["warehouses"], queryFn: () => api<WarehouseOption[]>("/warehouses") });
  const counts = useQuery({ queryKey: ["stock-counts"], queryFn: () => api<StockCountListRow[]>("/inventory/stock-counts") });
  const detail = useQuery({
    queryKey: ["stock-count", activeId],
    queryFn: () => api<StockCountDetail>(`/inventory/stock-counts/${activeId}`),
    enabled: Boolean(activeId)
  });
  const activeCount = detail.data;
  const branchWarehouses = useMemo(() => (warehouses.data ?? []).filter((warehouse) => !workingBranchId || warehouse.branchId === workingBranchId), [warehouses.data, workingBranchId]);
  const currentSummary = activeCount ? summaryFromItems(activeCount.items, edits) : undefined;
  const searchTerm = search.trim().toLowerCase();
  const visibleItems = useMemo(() => {
    if (!activeCount || !searchTerm) return activeCount?.items ?? [];
    return activeCount.items.filter((item) => [item.product.sku, item.product.barcode, item.product.name, item.product.variantColor, item.product.variantSize, item.product.category?.name, item.product.brand?.name]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(searchTerm)));
  }, [activeCount, searchTerm]);
  const differentItems = useMemo(() => {
    if (!activeCount) return [];
    return activeCount.items
      .map((item) => {
        const countedQuantity = parsedCountedQuantity(edits[item.productId]?.countedQuantity ?? "");
        return { ...item, countedQuantity, difference: countedQuantity === null ? null : countedQuantity - item.systemQuantity };
      })
      .filter((item) => item.difference !== null && item.difference !== 0);
  }, [activeCount, edits]);

  const createMutation = useMutation({
    mutationFn: () => post<StockCountDetail>("/inventory/stock-counts", { warehouseId, note: note.trim() || undefined }),
    onSuccess: (count) => {
      setActiveId(count.id);
      setEdits(buildItemEdits(count));
      setNote("");
      queryClient.invalidateQueries({ queryKey: ["stock-counts"] });
    }
  });
  const saveMutation = useMutation({
    mutationFn: () => patch<StockCountDetail>(`/inventory/stock-counts/${activeId}/items`, { items: itemPayload(activeCount, edits) }),
    onSuccess: (count) => {
      setEdits(buildItemEdits(count));
      queryClient.invalidateQueries({ queryKey: ["stock-count", activeId] });
      queryClient.invalidateQueries({ queryKey: ["stock-counts"] });
    }
  });
  const reviewMutation = useMutation({
    mutationFn: async () => {
      await patch<StockCountDetail>(`/inventory/stock-counts/${activeId}/items`, { items: itemPayload(activeCount, edits) });
      return patch<StockCountDetail>(`/inventory/stock-counts/${activeId}/review`, {});
    },
    onSuccess: (count) => {
      setEdits(buildItemEdits(count));
      queryClient.setQueryData(["stock-count", activeId], count);
      queryClient.invalidateQueries({ queryKey: ["stock-counts"] });
    }
  });
  const applyMutation = useMutation({
    mutationFn: () => post<StockCountDetail>(`/inventory/stock-counts/${activeId}/apply`, {}),
    onSuccess: (count) => {
      queryClient.setQueryData(["stock-count", activeId], count);
      queryClient.invalidateQueries({ queryKey: ["stock-counts"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-balances"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-movements"] });
    }
  });
  const cancelMutation = useMutation({
    mutationFn: () => patch<StockCountDetail>(`/inventory/stock-counts/${activeId}/cancel`, {}),
    onSuccess: (count) => {
      queryClient.setQueryData(["stock-count", activeId], count);
      queryClient.invalidateQueries({ queryKey: ["stock-counts"] });
    }
  });

  function openCount(id: string) {
    setActiveId(id);
    setSearch("");
    setEdits({});
  }

  function updateEdit(productId: string, next: Partial<ItemEdit>) {
    setEdits((current) => {
      const previous = current[productId] ?? { countedQuantity: "", note: "" };
      return { ...current, [productId]: { ...previous, ...next } };
    });
  }

  function jumpToMatch() {
    if (!activeCount || !searchTerm) return;
    const match = activeCount.items.find((item) => [item.product.sku, item.product.barcode, item.product.name, item.product.variantColor, item.product.variantSize]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(searchTerm)));
    if (!match) return;
    rowRefs.current[match.productId]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  if (activeId && activeCount) {
    const isCounting = activeCount.status === "COUNTING";
    const isReview = activeCount.status === "REVIEW";
    const isClosed = activeCount.status === "APPLIED" || activeCount.status === "CANCELED";
    const canReview = isCounting && currentSummary?.uncountedItems === 0;
    return (
      <div className="max-w-7xl space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <button className="text-sm font-semibold text-leaf hover:underline" type="button" onClick={() => setActiveId("")}>กลับไปรายการรอบนับ</button>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-black">นับสต็อก {activeCount.documentNo}</h1>
              <span className={`rounded px-2 py-1 text-xs font-bold ${statusClasses[activeCount.status]}`}>{statusLabels[activeCount.status]}</span>
            </div>
            <p className="mt-1 text-sm text-stone-600">{activeCount.warehouse.name} ({activeCount.warehouse.code}) • เริ่ม {thaiDate(activeCount.startedAt)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to={adjustmentHref(activeCount.warehouse.id)}><Button variant="secondary" icon={<SlidersHorizontal size={16} />}>ปรับทีละรายการ</Button></Link>
            <Link to="/app/inventory/movements"><Button variant="secondary" icon={<History size={16} />}>ประวัติสต็อก</Button></Link>
            {!isClosed ? <Button variant="ghost" onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending}>ยกเลิกรอบนับ</Button> : null}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-4">
            {isCounting ? (
              <Card className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <div className="relative min-w-[260px] flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={17} />
                    <input className="field pl-10" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") jumpToMatch(); }} placeholder="ค้นหา / สแกน SKU, Barcode, ชื่อสินค้า" />
                  </div>
                  <Button type="button" variant="secondary" icon={<PackageSearch size={16} />} onClick={jumpToMatch}>ไปสินค้า</Button>
                  {search ? <Button type="button" variant="ghost" icon={<X size={16} />} onClick={() => setSearch("")}>ล้าง</Button> : null}
                </div>
                <p className="rounded-md bg-teal-50 p-3 text-sm font-semibold text-teal-800">รอบนี้ดึงเฉพาะสินค้าที่มีรายการสต็อกในคลังนี้ กรอก 0 ได้ถ้านับแล้วไม่พบของจริง</p>
              </Card>
            ) : null}

            {isReview ? (
              <Card className="space-y-4">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-amber-50 text-amber-800"><ClipboardCheck size={20} /></span>
                  <div>
                    <h2 className="text-xl font-black">ตรวจทานส่วนต่างก่อนปรับสต็อก</h2>
                    <p className="mt-1 text-sm text-stone-600">ระบบจะแสดงเฉพาะรายการที่ยอดจริงไม่ตรงกับยอดระบบ และจะบันทึกเป็นการตั้งยอดจริงเมื่อยืนยัน</p>
                  </div>
                </div>
              </Card>
            ) : null}

            <div className="table-shell">
              <table className="w-full min-w-[920px] text-left text-sm">
                <thead className="bg-stone-50 text-stone-500">
                  <tr>
                    <th className="p-3">สินค้า</th>
                    <th className="p-3 text-right">ยอดระบบ</th>
                    <th className="p-3 text-right">ยอดจริง</th>
                    <th className="p-3 text-right">ส่วนต่าง</th>
                    <th className="p-3">หมายเหตุ</th>
                  </tr>
                </thead>
                <tbody>
                  {(isReview ? differentItems : visibleItems).map((item) => {
                    const edit = edits[item.productId] ?? { countedQuantity: item.countedQuantity === null ? "" : String(item.countedQuantity), note: item.note ?? "" };
                    const countedQuantity = parsedCountedQuantity(edit.countedQuantity);
                    const difference = countedQuantity === null ? null : countedQuantity - item.systemQuantity;
                    return (
                      <tr key={item.id} ref={(node) => { rowRefs.current[item.productId] = node; }} className="border-t border-stone-100 align-top">
                        <td className="p-3">
                          <p className="font-black text-ink">{getProductDisplayName(item.product)}</p>
                          <p className="mt-1 text-xs font-semibold text-stone-500">SKU {item.product.sku}{item.product.barcode ? ` / Barcode ${item.product.barcode}` : ""}</p>
                          <p className="mt-1 text-xs text-stone-500">{[item.product.category?.name, item.product.brand?.name].filter(Boolean).join(" • ") || "ไม่ระบุหมวดหมู่/แบรนด์"}</p>
                        </td>
                        <td className="p-3 text-right font-black">{number(item.systemQuantity)} {item.product.unit ?? "ชิ้น"}</td>
                        <td className="p-3 text-right">
                          {isCounting ? (
                            <input className="field ml-auto max-w-32 text-right" type="number" min={0} step={1} value={edit.countedQuantity} onChange={(event) => updateEdit(item.productId, { countedQuantity: event.target.value })} placeholder="ยังไม่นับ" />
                          ) : (
                            <span className="font-black">{number(countedQuantity ?? 0)} {item.product.unit ?? "ชิ้น"}</span>
                          )}
                        </td>
                        <td className={`p-3 text-right font-black ${difference === null ? "text-stone-400" : difference > 0 ? "text-teal-700" : difference < 0 ? "text-amber-800" : "text-stone-500"}`}>
                          {difference === null ? "ยังไม่นับ" : difference > 0 ? `+${number(difference)}` : number(difference)}
                        </td>
                        <td className="p-3">
                          {isCounting ? (
                            <input className="field min-w-44" value={edit.note} onChange={(event) => updateEdit(item.productId, { note: event.target.value })} placeholder="เช่น ของเสียหาย / ไม่พบสินค้า" />
                          ) : (
                            <span className="text-stone-600">{edit.note || "-"}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <aside className="space-y-4">
            <Card className="space-y-3 p-4">
              <h2 className="text-lg font-black">สรุปรอบนับ</h2>
              <div className="grid grid-cols-2 gap-2">
                <StockCountStat label="ทั้งหมด" value={`${number(currentSummary?.totalItems ?? 0)} รายการ`} />
                <StockCountStat label="นับแล้ว" value={`${number(currentSummary?.countedItems ?? 0)} รายการ`} tone="text-teal-700" />
                <StockCountStat label="ยังไม่นับ" value={`${number(currentSummary?.uncountedItems ?? 0)} รายการ`} tone={(currentSummary?.uncountedItems ?? 0) > 0 ? "text-amber-800" : "text-stone-500"} />
                <StockCountStat label="ยอดต่าง" value={`${number(currentSummary?.differentItems ?? 0)} รายการ`} />
                <StockCountStat label="เพิ่มรวม" value={`+${number(currentSummary?.increaseQuantity ?? 0)}`} tone="text-teal-700" />
                <StockCountStat label="ลดรวม" value={`-${number(currentSummary?.decreaseQuantity ?? 0)}`} tone="text-amber-800" />
              </div>
              {isCounting ? (
                <div className="space-y-2 pt-2">
                  <Button className="w-full" variant="secondary" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>บันทึกยอดนับ</Button>
                  <Button className="w-full" onClick={() => reviewMutation.mutate()} disabled={!canReview || reviewMutation.isPending}>
                    {reviewMutation.isPending ? "กำลังตรวจทาน..." : "ตรวจทานส่วนต่าง"}
                  </Button>
                  {!canReview ? <p className="text-xs font-semibold text-amber-800">ต้องกรอกยอดจริงให้ครบทุกแถวก่อนตรวจทาน</p> : null}
                </div>
              ) : null}
              {isReview ? (
                <Button className="w-full" icon={<CheckCircle2 size={16} />} onClick={() => applyMutation.mutate()} disabled={applyMutation.isPending}>
                  {applyMutation.isPending ? "กำลังปรับสต็อก..." : "ยืนยันปรับสต็อก"}
                </Button>
              ) : null}
              {activeCount.status === "APPLIED" ? <Link to="/app/inventory/movements"><Button className="w-full" variant="secondary">ดูประวัติสต็อก</Button></Link> : null}
              {[saveMutation, reviewMutation, applyMutation, cancelMutation].map((mutation, index) => mutation.isError ? <p key={index} className="rounded-md bg-red-50 p-3 text-sm font-semibold text-red-700">{mutation.error.message}</p> : null)}
            </Card>
          </aside>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black">นับสต็อก</h1>
          <p className="mt-1 text-sm text-stone-600">สร้างรอบนับจากคลัง กรอกยอดจริง ตรวจส่วนต่าง แล้วค่อยยืนยันปรับสต็อก</p>
        </div>
        <Link to={adjustmentHref(warehouseId)}><Button variant="secondary" icon={<SlidersHorizontal size={16} />}>ปรับทีละรายการ</Button></Link>
      </div>

      <Card className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(260px,360px)_1fr_auto]">
          <label className="block">
            <span className="mb-1 block text-sm font-bold text-stone-700">คลังที่ต้องการนับ</span>
            <Dropdown
              value={warehouseId}
              onValueChange={setWarehouseId}
              placeholder="เลือกคลัง"
              options={[
                { value: "", label: "เลือกคลัง" },
                ...branchWarehouses.map((warehouse) => ({ value: warehouse.id, label: `${warehouse.name} (${warehouse.code})` }))
              ]}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-bold text-stone-700">หมายเหตุรอบนับ</span>
            <input className="field" value={note} onChange={(event) => setNote(event.target.value)} placeholder="เช่น นับประจำเดือน / ตรวจหน้าร้าน" />
          </label>
          <div className="flex items-end">
            <Button className="w-full" icon={<ClipboardCheck size={16} />} disabled={!warehouseId || createMutation.isPending} onClick={() => createMutation.mutate()}>
              {createMutation.isPending ? "กำลังเริ่ม..." : "เริ่มรอบนับ"}
            </Button>
          </div>
        </div>
        <p className="rounded-md bg-teal-50 p-3 text-sm font-semibold text-teal-800">ระบบจะดึงเฉพาะสินค้าที่มีรายการสต็อกในคลังนี้มาให้กรอกยอดจริง</p>
        {createMutation.isError ? <p className="rounded-md bg-red-50 p-3 text-sm font-semibold text-red-700">{createMutation.error.message}</p> : null}
      </Card>

      <div className="table-shell">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="bg-stone-50 text-stone-500">
            <tr>
              <th className="p-3">รอบนับ</th>
              <th className="p-3">คลัง</th>
              <th className="p-3">ผู้รับผิดชอบ</th>
              <th className="p-3 text-right">ความคืบหน้า</th>
              <th className="p-3 text-right">ยอดต่าง</th>
              <th className="p-3 text-right">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {(counts.data ?? []).map((count) => (
              <tr key={count.id} className="border-t border-stone-100">
                <td className="p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-black text-ink">{count.documentNo}</span>
                    <span className={`rounded px-2 py-1 text-xs font-bold ${statusClasses[count.status]}`}>{statusLabels[count.status]}</span>
                  </div>
                  <p className="mt-1 text-xs text-stone-500">{thaiDate(count.startedAt)}{count.note ? ` • ${count.note}` : ""}</p>
                </td>
                <td className="p-3 font-semibold text-stone-700">{count.warehouse.name} ({count.warehouse.code})</td>
                <td className="p-3 text-stone-600">{count.user?.name ?? "-"}</td>
                <td className="p-3 text-right font-black">{number(count.summary.countedItems)} / {number(count.summary.totalItems)}</td>
                <td className="p-3 text-right">
                  <span className="font-black text-ink">{number(count.summary.differentItems)} รายการ</span>
                  <p className="mt-1 text-xs text-stone-500">+{number(count.summary.increaseQuantity)} / -{number(count.summary.decreaseQuantity)}</p>
                </td>
                <td className="p-3 text-right">
                  <Button variant="secondary" onClick={() => openCount(count.id)}>{count.status === "COUNTING" ? "นับต่อ" : "เปิดดู"}</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!counts.isLoading && (counts.data ?? []).length === 0 ? <p className="rounded-md bg-stone-50 p-4 text-sm text-stone-600">ยังไม่มีรอบนับ เลือกคลังแล้วเริ่มรอบนับแรกได้เลย</p> : null}
    </div>
  );
}

function itemPayload(count: StockCountDetail | undefined, edits: Record<string, ItemEdit>) {
  return (count?.items ?? []).map((item) => {
    const edit = edits[item.productId] ?? { countedQuantity: item.countedQuantity === null ? "" : String(item.countedQuantity), note: item.note ?? "" };
    return {
      productId: item.productId,
      countedQuantity: parsedCountedQuantity(edit.countedQuantity),
      note: edit.note.trim() || undefined
    };
  });
}
