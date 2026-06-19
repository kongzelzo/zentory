import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { resolveEffectivePermissions, type AuthSession, type Permission } from "@zentory/shared";
import { ArrowDown, ArrowUp, Boxes, Check, CheckCircle2, ChevronDown, CircleCheck, ClipboardList, Clock3, History, Image as ImageIcon, PackageCheck, Plus, Trash2, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Dropdown } from "../components/Dropdown";
import { api, post } from "../lib/api";
import { branchScopedPath } from "../lib/branch-scope";
import { baht, number, thaiDate } from "../lib/format";
import { getProductDisplayName, getProductImageUrl } from "../lib/products";
import { getActiveWarehouses, getPreferredWarehouseId, getSingleActiveWarehouse, shouldShowWarehouseSelector, warehouseDisplayName } from "../lib/warehouses";
import { useWorkingBranch } from "../state/working-branch";

type ProductOption = { id: string; name: string; sku: string; costPrice: string; imagePath?: string | null; unit?: string; minStock?: number; variantColor?: string | null; variantSize?: string | null };
type BranchOption = { id: string; name: string; code: string };
type WarehouseOption = { id: string; branchId: string; name: string; code: string; status?: string; isDefault?: boolean };
type ReceiptRow = { id: string; productId: string; quantity: number; unitCost: number };
type ReceiptItemPayload = { productId: string; quantity: number; unitCost: number };
type ReceiptPayload = { branchId: string; warehouseId: string; supplier?: string; note?: string; items: ReceiptItemPayload[] };
type ReceiptSummary = { warehouseName: string; supplier?: string; note?: string; itemCount: number; totalQuantity: number; totalCost: number; items: ReceiptItemPayload[] };
type InventoryBalance = { id?: string; warehouseId?: string; productId?: string; quantity: number; product: { id: string; name: string; sku: string; minStock?: number; unit?: string; variantColor?: string | null; variantSize?: string | null }; warehouse?: { id: string; name: string; branch?: { name: string } } };
type Movement = { id: string; type: string; quantity: number; unitCost?: number | string; balanceAfter?: number; reference?: string; createdAt: string; product: { id?: string; name: string; sku?: string; variantColor?: string | null; variantSize?: string | null }; warehouse?: { id?: string; name: string; branch?: { name: string } }; user?: { name: string } };
type AdjustmentMode = "set" | "increase" | "decrease";
type AdjustmentModePayload = "SET_ACTUAL" | "INCREASE" | "DECREASE";

const adjustmentModePayloads: Record<AdjustmentMode, AdjustmentModePayload> = {
  set: "SET_ACTUAL",
  increase: "INCREASE",
  decrease: "DECREASE"
};

function withWarehouseParam(path: string, warehouseId?: string) {
  return warehouseId ? `${path}?warehouseId=${encodeURIComponent(warehouseId)}` : path;
}

function ProductThumb({ product, className = "h-11 w-11" }: { product?: ProductOption; className?: string }) {
  const imageUrl = product ? getProductImageUrl(product) : "";
  if (imageUrl) {
    return <img src={imageUrl} alt={product?.name ?? "สินค้า"} className={`${className} rounded-md border border-stone-200 object-cover`} />;
  }
  return (
    <span className={`${className} grid shrink-0 place-items-center rounded-md border border-dashed border-stone-300 bg-stone-50 text-stone-400`}>
      <ImageIcon size={18} />
    </span>
  );
}

function hasSessionPermission(session: AuthSession | undefined, permission: Permission) {
  if (session?.user.isSystemAdmin) return true;
  if (!session?.business) return false;
  const permissions = session.business.effectivePermissions ?? resolveEffectivePermissions(session.business.role);
  return permissions[permission];
}

function SectionTitle({ icon, title, description, action }: { icon: React.ReactNode; title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-teal-50 text-leaf">{icon}</span>
        <span className="min-w-0">
          <span className="block font-black text-ink">{title}</span>
          <span className="mt-0.5 block text-sm font-normal text-stone-500">{description}</span>
        </span>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

function ProductDropdown({ products, selectedProduct, onChange, invalid = false, describedBy }: { products: ProductOption[]; selectedProduct?: ProductOption; onChange: (productId: string) => void; invalid?: boolean; describedBy?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selectedLabel = selectedProduct ? `${getProductDisplayName(selectedProduct)} (${selectedProduct.sku})` : "เลือกสินค้า";

  useEffect(() => {
    if (!open) return undefined;

    function closeOnOutsidePress(event: MouseEvent | TouchEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener("mousedown", closeOnOutsidePress);
    document.addEventListener("touchstart", closeOnOutsidePress);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsidePress);
      document.removeEventListener("touchstart", closeOnOutsidePress);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <button
        type="button"
        className={`field flex h-20 w-full items-center gap-3 bg-white py-2 text-left font-normal transition hover:border-teal-500 ${
          invalid ? "border-red-400 focus:border-red-600 focus:shadow-[0_0_0_3px_rgba(220,38,38,0.14)]" : ""
        }`}
        aria-expanded={open}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        onClick={() => setOpen((current) => !current)}
      >
        <ProductThumb product={selectedProduct} className="h-14 w-14" />
        <span className="min-w-0 flex-1">
          <span className={`block truncate ${selectedProduct ? "text-ink" : "text-stone-400"}`}>{selectedLabel}</span>
          {selectedProduct ? <span className="mt-0.5 block truncate text-xs text-stone-500">SKU {selectedProduct.sku}</span> : null}
        </span>
        <ChevronDown className="shrink-0 text-stone-400" size={18} />
      </button>

      {open ? (
        <div className="absolute left-0 right-0 z-30 mt-2 max-h-80 overflow-y-auto rounded-md border border-stone-200 bg-white p-1.5 shadow-xl">
          {products.map((product) => {
            const selected = product.id === selectedProduct?.id;
            return (
              <button
                key={product.id}
                type="button"
                className={`flex w-full items-center gap-3 rounded px-3 py-2.5 text-left text-sm transition ${selected ? "bg-teal-50" : "hover:bg-stone-50"}`}
                onClick={() => {
                  onChange(product.id);
                  setOpen(false);
                }}
              >
                <ProductThumb product={product} className="h-12 w-12" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-ink">{getProductDisplayName(product)}</span>
                  <span className="mt-0.5 block truncate text-xs text-stone-500">SKU {product.sku}</span>
                </span>
                {selected ? <Check className="shrink-0 text-leaf" size={17} /> : null}
              </button>
            );
          })}
          {products.length === 0 ? <p className="px-3 py-2 text-sm text-stone-500">ยังไม่มีสินค้าให้เลือก</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function newReceiptRow(product?: ProductOption): ReceiptRow {
  return {
    id: crypto.randomUUID(),
    productId: product?.id ?? "",
    quantity: 1,
    unitCost: Number(product?.costPrice ?? 0)
  };
}

function refreshCoreQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["products"] });
  queryClient.invalidateQueries({ queryKey: ["movements"] });
  queryClient.invalidateQueries({ queryKey: ["warehouses"] });
  queryClient.invalidateQueries({ queryKey: ["inventory-balances"] });
  queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  queryClient.invalidateQueries({ queryKey: ["stock-report"] });
}

export function InventoryReceiptPage() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const workingBranchId = useWorkingBranch((state) => state.workingBranchId);
  const requestedProductId = searchParams.get("productId") ?? "";
  const requestedBranchId = searchParams.get("branchId") ?? "";
  const requestedWarehouseId = searchParams.get("warehouseId") ?? "";
  const appliedProductIdRef = useRef("");
  const appliedLocationRef = useRef("");
  const [supplier, setSupplier] = useState("");
  const [note, setNote] = useState("");
  const [branchId, setBranchId] = useState(requestedBranchId || workingBranchId);
  const [warehouseId, setWarehouseId] = useState("");
  const [rows, setRows] = useState<ReceiptRow[]>([newReceiptRow()]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pendingReceipt, setPendingReceipt] = useState<ReceiptPayload | null>(null);
  const [successReceipt, setSuccessReceipt] = useState<ReceiptSummary | null>(null);
  const products = useQuery({ queryKey: ["products", "receipt"], queryFn: () => api<ProductOption[]>("/products?status=ACTIVE,PAUSED") });
  const branches = useQuery({ queryKey: ["branches"], queryFn: () => api<BranchOption[]>("/branches") });
  const warehouses = useQuery({ queryKey: ["warehouses"], queryFn: () => api<WarehouseOption[]>("/warehouses") });
  const balances = useQuery({ queryKey: ["inventory-balances", branchId], queryFn: () => api<InventoryBalance[]>(branchScopedPath("/inventory/balances", branchId)) });
  const movements = useQuery({ queryKey: ["movements", branchId], queryFn: () => api<Movement[]>(branchScopedPath("/inventory/movements", branchId)) });
  const productMap = useMemo(() => new Map((products.data ?? []).map((product) => [product.id, product])), [products.data]);
  const branchWarehouses = useMemo(() => getActiveWarehouses((warehouses.data ?? []).filter((warehouse) => !branchId || warehouse.branchId === branchId)), [warehouses.data, branchId]);
  const selectedWarehouse = warehouses.data?.find((warehouse) => warehouse.id === warehouseId);
  const singleActiveWarehouse = useMemo(() => getSingleActiveWarehouse(branchWarehouses), [branchWarehouses]);
  const showWarehouseSelector = shouldShowWarehouseSelector(branchWarehouses);
  const balanceByProduct = useMemo(() => {
    const map = new Map<string, InventoryBalance>();
    for (const balance of balances.data ?? []) {
      const balanceWarehouseId = balance.warehouse?.id ?? "";
      if (warehouseId && balanceWarehouseId && balanceWarehouseId !== warehouseId) continue;
      map.set(balance.product.id, balance);
    }
    return map;
  }, [balances.data, warehouseId]);
  const selectedRows = rows.filter((row) => row.productId);
  const totalQuantity = rows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const totalCost = rows.reduce((sum, row) => sum + row.quantity * row.unitCost, 0);
  const latestReceipts = useMemo(() => {
    return (movements.data ?? [])
      .filter((movement) => movement.type === "RECEIVE_IN")
      .filter((movement) => !warehouseId || !movement.warehouse?.id || movement.warehouse.id === warehouseId)
      .slice(0, 5);
  }, [movements.data, warehouseId]);

  useEffect(() => {
    if (!requestedProductId || appliedProductIdRef.current === requestedProductId) return;
    const product = productMap.get(requestedProductId);
    if (!product) return;
    setRows([newReceiptRow(product)]);
    appliedProductIdRef.current = requestedProductId;
  }, [productMap, requestedProductId]);

  useEffect(() => {
    if (!branches.data?.length || !warehouses.data?.length) return;
    const scopedBranchId = requestedBranchId || workingBranchId;
    const key = `${scopedBranchId}:${requestedWarehouseId}:${branches.data.length}:${warehouses.data.length}`;
    if (appliedLocationRef.current === key) return;
    const scopedWarehouses = getActiveWarehouses(warehouses.data.filter((warehouse) => !scopedBranchId || warehouse.branchId === scopedBranchId));
    const nextWarehouse = scopedWarehouses.find((warehouse) => warehouse.id === requestedWarehouseId)
      ?? scopedWarehouses.find((warehouse) => warehouse.id === getPreferredWarehouseId(scopedWarehouses))
      ?? getActiveWarehouses(warehouses.data)[0];
    const nextBranchId = scopedBranchId || nextWarehouse?.branchId || branches.data[0]?.id || "";
    setBranchId(nextBranchId);
    const nextBranchWarehouses = getActiveWarehouses(warehouses.data.filter((warehouse) => warehouse.branchId === nextBranchId));
    setWarehouseId(nextWarehouse?.branchId === nextBranchId ? nextWarehouse.id : getPreferredWarehouseId(nextBranchWarehouses));
    appliedLocationRef.current = key;
  }, [branches.data, requestedBranchId, requestedWarehouseId, warehouses.data, workingBranchId]);

  useEffect(() => {
    if (!branchId || !warehouses.data?.length) return;
    const current = warehouses.data.find((warehouse) => warehouse.id === warehouseId);
    if (current?.branchId === branchId) return;
    setWarehouseId(getPreferredWarehouseId(warehouses.data.filter((warehouse) => warehouse.branchId === branchId)));
  }, [branchId, warehouseId, warehouses.data]);

  const buildReceiptSummary = (payload: ReceiptPayload): ReceiptSummary => ({
    warehouseName: warehouses.data?.find((warehouse) => warehouse.id === payload.warehouseId)?.name ?? "คลังปลายทาง",
    supplier: payload.supplier,
    note: payload.note,
    itemCount: payload.items.length,
    totalQuantity: payload.items.reduce((sum, item) => sum + item.quantity, 0),
    totalCost: payload.items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0),
    items: payload.items
  });

  const mutation = useMutation({
    mutationFn: (body: ReceiptPayload) => post("/inventory/receipts", body),
    onSuccess: (_data, payload) => {
      setSuccessReceipt(buildReceiptSummary(payload));
      setPendingReceipt(null);
      setMessage("รับสินค้าเข้าเรียบร้อย");
      setError("");
      setSupplier("");
      setNote("");
      setRows([newReceiptRow()]);
      refreshCoreQueries(queryClient);
    },
    onError: (err) => {
      setMessage("");
      setPendingReceipt(null);
      setError(err.message);
    }
  });

  function updateRow(id: string, patch: Partial<ReceiptRow>) {
    setRows((current) => current.map((row) => {
      if (row.id !== id) return row;
      const next = { ...row, ...patch };
      if (patch.productId) next.unitCost = Number(productMap.get(patch.productId)?.costPrice ?? next.unitCost);
      return next;
    }));
  }

  function addRow() {
    setRows((current) => [...current, newReceiptRow()]);
  }

  function removeRow(id: string) {
    setRows((current) => current.length === 1 ? current : current.filter((row) => row.id !== id));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const items = rows.map((row) => ({
      productId: row.productId,
      quantity: Number(row.quantity),
      unitCost: Number(row.unitCost)
    }));
    if (!items.length || items.some((item) => !Number.isInteger(item.quantity) || item.quantity < 1 || !Number.isFinite(item.unitCost) || item.unitCost < 0)) {
      setError("กรุณาเลือกสินค้า และกรอกจำนวน/ต้นทุนให้ถูกต้อง");
      return;
    }
    if (items.some((item) => !item.productId)) {
      setError("กรุณาเลือกสินค้าที่ต้องการรับเข้า");
      return;
    }
    if (!branchId || !warehouseId) {
      setError("ไม่พบสาขาทำงานหรือคลังปลายทาง");
      return;
    }
    setMessage("");
    setPendingReceipt({ branchId, warehouseId, supplier: supplier.trim() || undefined, note: note.trim() || undefined, items });
  }

  function confirmReceipt() {
    if (!pendingReceipt) return;
    mutation.mutate(pendingReceipt);
  }

  const pendingSummary = pendingReceipt ? buildReceiptSummary(pendingReceipt) : null;

  return (
    <div className="w-full max-w-6xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-leaf">Stock receiving</p>
          <h1 className="mt-1 text-3xl font-black">รับสินค้าเข้า</h1>
          <p className="mt-1 text-sm text-stone-600">เลือกคลังปลายทาง เพิ่มรายการสินค้า แล้วตรวจยอดก่อนยืนยันรับเข้า</p>
        </div>
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,320px)]">
        <Card className="min-w-0 p-0">
          <form onSubmit={submit}>
            <div className="space-y-5 p-5">
              <section className="space-y-4">
                <SectionTitle icon={<Boxes size={18} />} title="ปลายทางและเอกสาร" description="ระบุว่าของเข้าที่ไหน และรับมาจากใคร" />
                <div className="grid min-w-0 gap-4 md:grid-cols-2">
                  {showWarehouseSelector ? (
                    <label className="grid gap-1 text-sm font-bold text-stone-700">
                      คลังปลายทาง
                      <Dropdown
                        value={warehouseId}
                        onValueChange={setWarehouseId}
                        required
                        placeholder="เลือกคลัง"
                        buttonClassName="font-normal"
                        options={[
                          { value: "", label: "เลือกคลัง" },
                          ...branchWarehouses.map((warehouse) => ({ value: warehouse.id, label: warehouseDisplayName(warehouse) }))
                        ]}
                      />
                    </label>
                  ) : singleActiveWarehouse ? (
                    <div className="rounded-md border border-stone-200 bg-stone-50 p-3">
                      <p className="text-xs font-bold text-stone-500">คลังปลายทาง</p>
                      <p className="mt-1 font-black text-ink">{warehouseDisplayName(singleActiveWarehouse)}</p>
                    </div>
                  ) : (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-800">ยังไม่มีคลังที่เปิดใช้งานในสาขานี้</div>
                  )}
                  <label className="grid gap-1 text-sm font-bold text-stone-700">
                    ซัพพลายเออร์
                    <input className="field font-normal" value={supplier} onChange={(event) => setSupplier(event.target.value)} placeholder="เช่น บริษัท/ร้านค้าที่ส่งสินค้า" />
                  </label>
                  <label className="grid gap-1 text-sm font-bold text-stone-700">
                    หมายเหตุ / เลขเอกสาร
                    <input className="field font-normal" value={note} onChange={(event) => setNote(event.target.value)} placeholder="เช่น เลขใบส่งของ หรือรายละเอียดเพิ่มเติม" />
                  </label>
                </div>
              </section>

              <section className="space-y-4 border-t border-stone-200 pt-5">
                <SectionTitle
                  icon={<PackageCheck size={18} />}
                  title="รายการสินค้า"
                  description="เลือกสินค้า ใส่จำนวน และตรวจต้นทุนต่อหน่วย"
                />
                <div className="space-y-3">
                  {rows.map((row, index) => {
                    const product = productMap.get(row.productId);
                    return (
                      <div key={row.id} className="rounded-md border border-stone-200 bg-stone-50/40 p-3">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                          <p className="text-sm font-black text-stone-700">รายการที่ {number(index + 1)}</p>
                          <Button type="button" variant="ghost" icon={<Trash2 size={16} />} aria-label="ลบแถว" disabled={rows.length === 1} onClick={() => removeRow(row.id)} />
                        </div>
                        <div className="grid min-w-0 items-start gap-4 md:grid-cols-2 2xl:grid-cols-[minmax(260px,1fr)_minmax(140px,180px)_minmax(160px,220px)]">
                          <div className="grid min-w-0 content-start gap-1 text-sm font-bold text-stone-700 md:col-span-2 2xl:col-span-1">
                            <span>สินค้าที่รับเข้า</span>
                            <ProductDropdown
                              products={products.data ?? []}
                              selectedProduct={product}
                              onChange={(productId) => updateRow(row.id, { productId })}
                            />
                            {row.productId ? (
                              <p className="mt-1 text-xs text-stone-500">
                                คงเหลือในคลังนี้ {number(balanceByProduct.get(row.productId)?.quantity ?? 0)} {product?.unit ?? "ชิ้น"}
                              </p>
                            ) : null}
                          </div>
                          <label className="grid content-start gap-1 text-sm font-bold text-stone-700">
                            จำนวน
                            <input
                              className="field h-20 text-lg font-normal"
                              type="number"
                              min={0}
                              step={1}
                              value={row.quantity}
                              aria-label={`จำนวนรายการที่ ${index + 1}`}
                              onChange={(event) => {
                                const value = event.target.value;
                                updateRow(row.id, { quantity: value === "" ? 0 : Math.max(0, Math.floor(Number(value) || 0)) });
                              }}
                            />
                          </label>
                          <label className="grid content-start gap-1 text-sm font-bold text-stone-700">
                            ต้นทุนต่อหน่วย
                            <input
                              className="field h-20 text-lg font-normal"
                              type="number"
                              min={0}
                              step="0.01"
                              value={row.unitCost}
                              aria-label={`ต้นทุนต่อหน่วยรายการที่ ${index + 1}`}
                              onChange={(event) => updateRow(row.id, { unitCost: Math.max(0, Number(event.target.value) || 0) })}
                            />
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>

            <div className="space-y-4 border-t border-stone-200 bg-stone-50 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button type="button" variant="secondary" icon={<Plus size={16} />} onClick={addRow}>เพิ่มรายการ</Button>
                <div className="text-right">
                  <p className="text-xs font-bold uppercase text-stone-500">รวมต้นทุนรับเข้า</p>
                  <p className="text-2xl font-black text-ink">{baht(totalCost)}</p>
                </div>
              </div>
              {message ? <p className="rounded-md bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{message}</p> : null}
              {error ? <p className="rounded-md bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p> : null}
              <div className="flex justify-end">
                <Button className="w-full md:w-auto" disabled={mutation.isPending || products.isLoading}>{mutation.isPending ? "กำลังรับเข้า..." : "ยืนยันรับเข้า"}</Button>
              </div>
            </div>
          </form>
        </Card>

        <div className="space-y-4">
          <Card className="min-w-0">
            <div className="flex items-center gap-2">
              <PackageCheck size={18} className="text-leaf" />
              <h2 className="font-black">สรุปรับเข้า</h2>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-md bg-stone-50 p-3">
                <p className="text-stone-500">จำนวนรายการ</p>
                <p className="mt-1 text-2xl font-black">{number(selectedRows.length)}</p>
              </div>
              <div className="rounded-md bg-stone-50 p-3">
                <p className="text-stone-500">จำนวนรวม</p>
                <p className="mt-1 text-2xl font-black">{number(totalQuantity)}</p>
              </div>
            </div>
            <div className="mt-3 rounded-md border border-stone-200 p-3 text-sm">
              <p className="font-bold">{selectedWarehouse?.name ?? "ยังไม่ได้เลือกคลัง"}</p>
              <p className="mt-3 text-lg font-black">{baht(totalCost)}</p>
            </div>
          </Card>

          <Card className="min-w-0">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Boxes size={18} className="text-leaf" />
                <h2 className="font-black">สต็อกที่จะเปลี่ยน</h2>
              </div>
              {balances.isLoading ? <span className="text-xs text-stone-500">โหลด...</span> : null}
            </div>
            <div className="mt-3 space-y-2">
              {selectedRows.map((row) => {
                const product = productMap.get(row.productId);
                const before = balanceByProduct.get(row.productId)?.quantity ?? 0;
                const after = before + Number(row.quantity || 0);
                return (
                  <div key={row.id} className="flex gap-3 rounded-md border border-stone-200 p-3 text-sm">
                    <ProductThumb product={product} className="h-10 w-10" />
                    <div className="min-w-0">
                      <p className="truncate font-bold">{product?.name ?? "สินค้า"}</p>
                      <p className="mt-1 text-stone-500">{number(before)} เป็น {number(after)} {product?.unit ?? "ชิ้น"}</p>
                    </div>
                  </div>
                );
              })}
              {selectedRows.length === 0 ? <p className="text-sm text-stone-500">เลือกสินค้าเพื่อดูยอดก่อนและหลังรับเข้า</p> : null}
            </div>
          </Card>
        </div>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Clock3 size={18} className="text-leaf" />
            <h2 className="font-black">รับเข้าล่าสุด</h2>
          </div>
          <Link to="/app/inventory/movements"><Button variant="secondary">ดูประวัติทั้งหมด</Button></Link>
        </div>
        <div className="mt-4 space-y-3">
          {movements.isLoading ? <p className="text-sm text-stone-500">กำลังโหลดประวัติรับเข้า...</p> : null}
          {latestReceipts.map((movement) => (
            <div key={movement.id} className="grid gap-2 rounded-md border border-stone-200 p-3 text-sm md:grid-cols-[1fr_140px_140px_180px]">
              <div>
                <p className="font-bold">{getProductDisplayName(movement.product)}</p>
                <p className="text-xs text-stone-500">{movement.reference ?? "ไม่มีเลขอ้างอิง"}</p>
              </div>
              <p>จำนวน {number(movement.quantity)}</p>
              <p>{movement.unitCost !== undefined ? baht(movement.unitCost) : "ไม่ระบุต้นทุน"}</p>
              <p className="text-stone-500">{thaiDate(movement.createdAt)}</p>
            </div>
          ))}
          {!movements.isLoading && latestReceipts.length === 0 ? <p className="text-sm text-stone-500">ยังไม่มีประวัติรับเข้า</p> : null}
        </div>
      </Card>

      {pendingSummary ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4" role="dialog" aria-modal="true" aria-labelledby="receipt-confirm-title" onMouseDown={() => !mutation.isPending && setPendingReceipt(null)}>
          <div className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b border-stone-200 p-5">
              <div>
                <p className="text-xs font-black uppercase text-teal-700">ยืนยันรับสินค้าเข้า</p>
                <h2 id="receipt-confirm-title" className="mt-1 text-2xl font-black text-ink">ตรวจรายการก่อนรับเข้า</h2>
                <p className="mt-1 text-sm leading-6 text-stone-600">ระบบจะเพิ่มสต็อกเข้าคลังที่เลือกหลังจากยืนยัน</p>
              </div>
              <button
                type="button"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-stone-200 text-stone-600 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="ปิดหน้าต่างยืนยันรับเข้า"
                disabled={mutation.isPending}
                onClick={() => setPendingReceipt(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="overflow-y-auto p-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-md bg-stone-50 p-3">
                  <p className="text-xs font-bold text-stone-500">คลังปลายทาง</p>
                  <p className="mt-1 font-black text-ink">{pendingSummary.warehouseName}</p>
                </div>
                <div className="rounded-md bg-stone-50 p-3">
                  <p className="text-xs font-bold text-stone-500">จำนวนรวม</p>
                  <p className="mt-1 font-black text-ink">{number(pendingSummary.totalQuantity)}</p>
                </div>
                <div className="rounded-md bg-stone-50 p-3">
                  <p className="text-xs font-bold text-stone-500">ต้นทุนรวม</p>
                  <p className="mt-1 font-black text-ink">{baht(pendingSummary.totalCost)}</p>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {pendingSummary.items.map((item, index) => {
                  const product = productMap.get(item.productId);
                  const before = balanceByProduct.get(item.productId)?.quantity ?? 0;
                  return (
                    <div key={`${item.productId}-${index}`} className="flex gap-3 rounded-md border border-stone-200 p-3 text-sm">
                      <ProductThumb product={product} className="h-11 w-11" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold text-ink">{product?.name ?? "สินค้า"}</p>
                        <p className="mt-1 text-stone-500">
                          {number(before)} เป็น {number(before + item.quantity)} {product?.unit ?? "ชิ้น"} · ต้นทุน {baht(item.unitCost)}
                        </p>
                      </div>
                      <p className="shrink-0 font-black text-ink">+{number(item.quantity)}</p>
                    </div>
                  );
                })}
              </div>

              {(pendingSummary.supplier || pendingSummary.note) ? (
                <div className="mt-4 rounded-md border border-stone-200 bg-stone-50 p-3 text-sm">
                  {pendingSummary.supplier ? <p><span className="font-bold text-stone-600">ซัพพลายเออร์:</span> {pendingSummary.supplier}</p> : null}
                  {pendingSummary.note ? <p className="mt-1"><span className="font-bold text-stone-600">หมายเหตุ:</span> {pendingSummary.note}</p> : null}
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-stone-200 bg-stone-50 p-4">
              <Button type="button" variant="ghost" disabled={mutation.isPending} onClick={() => setPendingReceipt(null)}>กลับไปแก้ไข</Button>
              <Button type="button" icon={<PackageCheck size={16} />} disabled={mutation.isPending} onClick={confirmReceipt}>
                {mutation.isPending ? "กำลังรับเข้า..." : "ยืนยันรับเข้า"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {successReceipt ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4" role="dialog" aria-modal="true" aria-labelledby="receipt-success-title" onMouseDown={() => setSuccessReceipt(null)}>
          <div className="w-full max-w-md overflow-hidden rounded-lg bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="p-6 text-center">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-emerald-700">
                <CircleCheck size={30} />
              </span>
              <h2 id="receipt-success-title" className="mt-4 text-2xl font-black text-ink">รับสินค้าเข้าเรียบร้อย</h2>
              <p className="mt-2 text-sm leading-6 text-stone-600">เพิ่มสต็อกเข้า {successReceipt.warehouseName} แล้ว</p>

              <div className="mt-5 grid grid-cols-3 gap-2 text-sm">
                <div className="rounded-md bg-stone-50 p-3">
                  <p className="text-xs font-bold text-stone-500">รายการ</p>
                  <p className="mt-1 text-lg font-black text-ink">{number(successReceipt.itemCount)}</p>
                </div>
                <div className="rounded-md bg-stone-50 p-3">
                  <p className="text-xs font-bold text-stone-500">จำนวน</p>
                  <p className="mt-1 text-lg font-black text-ink">{number(successReceipt.totalQuantity)}</p>
                </div>
                <div className="rounded-md bg-stone-50 p-3">
                  <p className="text-xs font-bold text-stone-500">ต้นทุน</p>
                  <p className="mt-1 text-lg font-black text-ink">{baht(successReceipt.totalCost)}</p>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-stone-200 bg-stone-50 p-4">
              <Link to="/app/inventory/movements" onClick={() => setSuccessReceipt(null)}>
                <Button type="button" variant="secondary" icon={<History size={16} />}>ดูประวัติ</Button>
              </Link>
              <Button type="button" icon={<Check size={16} />} onClick={() => setSuccessReceipt(null)}>เสร็จสิ้น</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function InventoryAdjustmentPage() {
  const [searchParams] = useSearchParams();
  const workingBranchId = useWorkingBranch((state) => state.workingBranchId);
  const queryClient = useQueryClient();
  const requestedBranchId = searchParams.get("branchId") ?? "";
  const requestedWarehouseId = searchParams.get("warehouseId") ?? "";
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [branchId, setBranchId] = useState(requestedBranchId || workingBranchId);
  const [warehouseId, setWarehouseId] = useState(requestedWarehouseId);
  const [productId, setProductId] = useState(searchParams.get("productId") ?? "");
  const [mode, setMode] = useState<AdjustmentMode>("set");
  const [isAdvancedAdjustmentOpen, setIsAdvancedAdjustmentOpen] = useState(false);
  const [quantityInput, setQuantityInput] = useState("");
  const [reason, setReason] = useState("");
  const products = useQuery({ queryKey: ["products", "adjustment", branchId], queryFn: () => api<ProductOption[]>(branchScopedPath("/products", branchId)) });
  const branches = useQuery({ queryKey: ["branches"], queryFn: () => api<BranchOption[]>("/branches") });
  const warehouses = useQuery({ queryKey: ["warehouses"], queryFn: () => api<WarehouseOption[]>("/warehouses") });
  const balances = useQuery({ queryKey: ["inventory-balances", branchId], queryFn: () => api<InventoryBalance[]>(branchScopedPath("/inventory/balances", branchId)) });
  const branchWarehouses = useMemo(() => getActiveWarehouses((warehouses.data ?? []).filter((warehouse) => !branchId || warehouse.branchId === branchId)), [warehouses.data, branchId]);
  const selectedProduct = useMemo(() => (products.data ?? []).find((product) => product.id === productId), [productId, products.data]);
  const selectedWarehouse = useMemo(() => (warehouses.data ?? []).find((warehouse) => warehouse.id === warehouseId), [warehouseId, warehouses.data]);
  const singleActiveWarehouse = useMemo(() => getSingleActiveWarehouse(branchWarehouses), [branchWarehouses]);
  const showWarehouseSelector = shouldShowWarehouseSelector(branchWarehouses);
  const currentBalance = useMemo(() => {
    const balance = (balances.data ?? []).find((item) => {
      const itemWarehouseId = item.warehouseId ?? item.warehouse?.id;
      const itemProductId = item.productId ?? item.product.id;
      return itemWarehouseId === warehouseId && itemProductId === productId;
    });
    return balance?.quantity ?? 0;
  }, [balances.data, productId, warehouseId]);
  const quantityValue = Math.trunc(Number(quantityInput));
  const hasQuantity = quantityInput.trim() !== "" && Number.isFinite(quantityValue);
  const adjustmentQuantity = hasQuantity
    ? mode === "increase"
      ? Math.abs(quantityValue)
      : mode === "decrease"
        ? -Math.abs(quantityValue)
        : quantityValue - currentBalance
    : 0;
  const balanceAfter = currentBalance + adjustmentQuantity;
  const isDecreaseOverStock = balanceAfter < 0;
  const quantityLabel = mode === "set" ? "ยอดที่นับได้จริง" : mode === "increase" ? "จำนวนที่ต้องเพิ่ม" : "จำนวนที่ต้องลด";
  const quantityPlaceholder = mode === "set" ? "เช่น 12" : "เช่น 2";
  const previewChangeLabel = mode === "set" ? "ส่วนต่าง" : adjustmentQuantity >= 0 ? "ปรับเพิ่ม" : "ปรับลด";
  const recordSummary = mode === "set"
    ? `ระบบจะบันทึกเป็นตั้งยอดจริง จาก ${number(currentBalance)} เป็น ${number(balanceAfter)}`
    : `ระบบจะบันทึกเป็น${mode === "increase" ? "ปรับเพิ่ม" : "ปรับลด"} ${number(Math.abs(adjustmentQuantity))} จาก ${number(currentBalance)} เป็น ${number(balanceAfter)}`;
  const warehouseError = error === "กรุณาเลือกคลัง" ? error : "";
  const productError = error === "กรุณาเลือกสินค้า" ? error : "";
  const quantityError = error === "กรุณากรอกยอดนับจริงเป็นจำนวนเต็ม 0 ขึ้นไป" || error === "กรุณากรอกจำนวนเป็นจำนวนเต็ม 0 ขึ้นไป" || error === "ยอดหลังปรับเท่ากับยอดในระบบอยู่แล้ว" ? error : "";
  const reasonError = error === "กรุณาระบุเหตุผล" ? error : "";
  const reasonPresets = ["นับจริงไม่ตรง", "สินค้าเสียหาย", "ของหาย", "แก้ยอดยกมา"];
  const mutation = useMutation({
    mutationFn: (body: unknown) => post("/inventory/adjustments", body),
    onSuccess: () => {
      setMessage("ปรับสต็อกเรียบร้อย");
      setError("");
      setQuantityInput("");
      setReason("");
      refreshCoreQueries(queryClient);
    },
    onError: (error) => {
      setMessage("");
      setError(error.message);
    }
  });

  useEffect(() => {
    if (requestedBranchId) return;
    const nextBranchId = workingBranchId || branches.data?.[0]?.id || "";
    if (!nextBranchId || nextBranchId === branchId) return;
    setBranchId(nextBranchId);
    setWarehouseId("");
  }, [branchId, branches.data, requestedBranchId, workingBranchId]);

  useEffect(() => {
    if (!branchId || !warehouses.data?.length) return;
    const current = warehouses.data.find((warehouse) => warehouse.id === warehouseId);
    if (current?.branchId === branchId) return;
    setWarehouseId(getPreferredWarehouseId(warehouses.data.filter((warehouse) => warehouse.branchId === branchId)));
  }, [branchId, warehouseId, warehouses.data]);

  useEffect(() => {
    if (productId || !products.data?.[0]) return;
    setProductId(products.data[0].id);
  }, [productId, products.data]);

  function chooseAdjustmentMode(nextMode: AdjustmentMode) {
    setMode(nextMode);
    setQuantityInput("");
    setError("");
    setMessage("");
  }

  function toggleAdvancedAdjustment() {
    if (isAdvancedAdjustmentOpen) chooseAdjustmentMode("set");
    setIsAdvancedAdjustmentOpen(!isAdvancedAdjustmentOpen);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!branchId) {
      setError("ไม่พบสาขาทำงาน");
      return;
    }
    if (!warehouseId) {
      setError("กรุณาเลือกคลัง");
      return;
    }
    if (!productId) {
      setError("กรุณาเลือกสินค้า");
      return;
    }
    if (!hasQuantity || quantityValue < 0) {
      setError(mode === "set" ? "กรุณากรอกยอดนับจริงเป็นจำนวนเต็ม 0 ขึ้นไป" : "กรุณากรอกจำนวนเป็นจำนวนเต็ม 0 ขึ้นไป");
      return;
    }
    if (adjustmentQuantity === 0) {
      setError("ยอดหลังปรับเท่ากับยอดในระบบอยู่แล้ว");
      return;
    }
    if (isDecreaseOverStock) {
      setError("ปรับลดเกินยอดคงเหลือในคลังนี้");
      return;
    }
    if (!reason.trim()) {
      setError("กรุณาระบุเหตุผล");
      return;
    }
    mutation.mutate({
      branchId,
      warehouseId,
      productId,
      quantity: adjustmentQuantity,
      adjustmentMode: adjustmentModePayloads[mode],
      targetQuantity: mode === "set" ? balanceAfter : undefined,
      reason: reason.trim()
    });
  }

  return (
    <div className="max-w-6xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black">ปรับสต็อก</h1>
          <p className="mt-1 text-sm text-stone-600">ใช้แก้ยอดทีละสินค้า ถ้าต้องตรวจทั้งคลังให้ใช้นับสต็อกเป็นรอบ</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={withWarehouseParam("/app/stock-counts", warehouseId)}><Button variant="secondary" icon={<CheckCircle2 size={16} />}>นับสต็อกเป็นรอบ</Button></Link>
          <Link to="/app/inventory/movements"><Button variant="secondary" icon={<History size={16} />}>ประวัติสต็อก</Button></Link>
        </div>
      </div>

      <Card>
        <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
          <div className="space-y-4">
            <div className="grid gap-4">
              {showWarehouseSelector ? (
                <label className="block">
                  <span className="mb-1 block text-sm font-bold text-stone-700">คลัง</span>
                  <Dropdown
                    value={warehouseId}
                    onValueChange={(value) => {
                      setWarehouseId(value);
                      if (warehouseError) setError("");
                    }}
                    required
                    placeholder="เลือกคลัง"
                    buttonClassName={warehouseError ? "border-red-400 focus:border-red-600 focus:shadow-[0_0_0_3px_rgba(220,38,38,0.14)]" : ""}
                    options={[
                      { value: "", label: "เลือกคลัง" },
                      ...branchWarehouses.map((warehouse) => ({ value: warehouse.id, label: warehouseDisplayName(warehouse) }))
                    ]}
                  />
                  {warehouseError ? <p className="mt-1 text-sm font-semibold text-red-700">{warehouseError}</p> : null}
                </label>
              ) : singleActiveWarehouse ? (
                <div className="rounded-md border border-stone-200 bg-stone-50 p-3">
                  <p className="text-xs font-bold text-stone-500">คลัง</p>
                  <p className="mt-1 font-black text-ink">{warehouseDisplayName(singleActiveWarehouse)}</p>
                </div>
              ) : (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-800">ยังไม่มีคลังที่เปิดใช้งานในสาขานี้</div>
              )}
            </div>

            <label className="block">
              <span className="mb-1 block text-sm font-bold text-stone-700">สินค้า</span>
              <ProductDropdown
                products={products.data ?? []}
                selectedProduct={selectedProduct}
                invalid={Boolean(productError)}
                describedBy={productError ? "adjustment-product-error" : undefined}
                onChange={(value) => {
                  setProductId(value);
                  if (productError) setError("");
                }}
              />
              {productError ? <p id="adjustment-product-error" className="mt-1 text-sm font-semibold text-red-700">{productError}</p> : null}
            </label>

            <div className="rounded-lg border border-teal-100 bg-teal-50/60 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 gap-3">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-white text-leaf">
                    <ClipboardList size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-black text-ink">ตั้งยอดจริง</p>
                    <p className="mt-1 text-sm text-stone-600">ใช้เป็นค่าเริ่มต้นเมื่อพนักงานนับของแล้วต้องการให้ยอดในระบบเท่ากับยอดที่นับได้</p>
                  </div>
                </div>
                <Button type="button" variant="secondary" onClick={toggleAdvancedAdjustment}>
                  {isAdvancedAdjustmentOpen ? "ปิด" : "ตัวเลือกขั้นสูง"}
                </Button>
              </div>
              {isAdvancedAdjustmentOpen ? (
                <div className="mt-4 border-t border-teal-100 pt-4">
                  <p className="text-sm font-bold text-stone-700">โหมดขั้นสูง ใช้เมื่อรู้จำนวนที่จะบวกหรือลบอยู่แล้ว</p>
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    <AdjustmentModeButton mode={mode} value="increase" icon={<ArrowUp size={16} />} label="ปรับเพิ่ม" onChange={chooseAdjustmentMode} />
                    <AdjustmentModeButton mode={mode} value="decrease" icon={<ArrowDown size={16} />} label="ปรับลด" onChange={chooseAdjustmentMode} />
                  </div>
                </div>
              ) : null}
            </div>

            <div className="grid gap-4 md:grid-cols-[180px_1fr]">
              <label className="block">
                <span className="mb-1 block text-sm font-bold text-stone-700">{quantityLabel}</span>
                <input
                  className={`field ${quantityError ? "border-red-400 focus:border-red-600 focus:shadow-[0_0_0_3px_rgba(220,38,38,0.14)]" : ""}`}
                  type="number"
                  min={0}
                  step={1}
                  value={quantityInput}
                  onChange={(event) => {
                    setQuantityInput(event.target.value);
                    if (quantityError) setError("");
                  }}
                  placeholder={quantityPlaceholder}
                  aria-invalid={Boolean(quantityError)}
                  aria-describedby={quantityError ? "adjustment-quantity-error" : undefined}
                  aria-required="true"
                />
                {quantityError ? <p id="adjustment-quantity-error" className="mt-1 text-sm font-semibold text-red-700">{quantityError}</p> : null}
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-bold text-stone-700">เหตุผล</span>
                <input
                  className={`field ${reasonError ? "border-red-400 focus:border-red-600 focus:shadow-[0_0_0_3px_rgba(220,38,38,0.14)]" : ""}`}
                  value={reason}
                  onChange={(event) => {
                    setReason(event.target.value);
                    if (reasonError) setError("");
                  }}
                  placeholder="เช่น นับจริงไม่ตรง / สินค้าเสียหาย"
                  aria-invalid={Boolean(reasonError)}
                  aria-describedby={reasonError ? "adjustment-reason-error" : undefined}
                  aria-required="true"
                />
                {reasonError ? <p id="adjustment-reason-error" className="mt-1 text-sm font-semibold text-red-700">{reasonError}</p> : null}
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              {reasonPresets.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className="rounded-md border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50"
                  onClick={() => {
                    setReason(preset);
                    if (reasonError) setError("");
                  }}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <aside className="rounded-lg border border-stone-200 bg-stone-50 p-4">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-teal-50 text-teal-700">
                <PackageCheck size={20} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-stone-500">รายการที่จะบันทึก</p>
                <p className="truncate text-lg font-black text-ink">{selectedProduct?.name ?? "ยังไม่ได้เลือกสินค้า"}</p>
                <p className="text-xs text-stone-500">{selectedWarehouse ? `${selectedWarehouse.name} (${selectedWarehouse.code})` : "ยังไม่ได้เลือกคลัง"}</p>
              </div>
            </div>

            <dl className="mt-5 grid grid-cols-2 gap-3">
              <StockPreview label="ยอดในระบบ" value={currentBalance} />
              <StockPreview label="ยอดหลังปรับ" value={balanceAfter} tone={isDecreaseOverStock ? "text-red-700" : "text-ink"} />
              <StockPreview label={previewChangeLabel} value={Math.abs(adjustmentQuantity)} tone={adjustmentQuantity < 0 ? "text-amber-700" : "text-teal-700"} />
              <StockPreview label="จุดแจ้งเตือน" value={selectedProduct?.minStock ?? 0} />
            </dl>

            {selectedProduct?.unit ? <p className="mt-3 text-xs text-stone-500">หน่วยนับ: {selectedProduct.unit}</p> : null}
            {hasQuantity && !isDecreaseOverStock ? <p className="mt-4 rounded-md bg-white p-3 text-sm font-semibold text-stone-700 ring-1 ring-stone-200">{recordSummary}</p> : null}
            {isDecreaseOverStock ? <p className="mt-4 rounded-md bg-red-50 p-3 text-sm font-semibold text-red-700">ยอดหลังปรับติดลบ กรุณาตรวจจำนวนอีกครั้ง</p> : null}
            {message ? <p className="mt-4 rounded-md bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{message}</p> : null}
            {error && !warehouseError && !productError && !quantityError && !reasonError ? <p className="mt-4 rounded-md bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p> : null}
            <Button className="mt-5 w-full" disabled={mutation.isPending || products.isLoading || balances.isLoading}>
              {mutation.isPending ? "กำลังบันทึก..." : "บันทึกการปรับ"}
            </Button>
          </aside>
        </form>
      </Card>
    </div>
  );
}

function AdjustmentModeButton({ mode, value, icon, label, onChange }: { mode: AdjustmentMode; value: AdjustmentMode; icon: React.ReactNode; label: string; onChange: (mode: AdjustmentMode) => void }) {
  const active = mode === value;
  return (
    <button
      type="button"
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-md border px-3 text-sm font-bold transition ${
        active ? "border-leaf bg-teal-50 text-leaf" : "border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
      }`}
      aria-pressed={active}
      onClick={() => onChange(value)}
    >
      {icon}
      {label}
    </button>
  );
}

function StockPreview({ label, value, tone = "text-ink" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-md bg-white p-3 ring-1 ring-stone-200">
      <dt className="text-xs font-semibold text-stone-500">{label}</dt>
      <dd className={`mt-1 text-2xl font-black ${tone}`}>{number(value)}</dd>
    </div>
  );
}
