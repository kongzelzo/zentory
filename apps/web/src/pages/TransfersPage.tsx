import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, CheckCircle2, ChevronDown, ClipboardList, Image as ImageIcon, Plus, Trash2 } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Dropdown, type DropdownOption } from "../components/Dropdown";
import { api, post } from "../lib/api";
import { branchScopedPath } from "../lib/branch-scope";
import { number, thaiDate } from "../lib/format";
import { getProductDisplayName, getProductImageUrl } from "../lib/products";
import {
  buildTransferPayload,
  getTransferFormIssue,
  initialTransferRows,
  stockAtWarehouse,
  type TransferDraftRow,
  type TransferProductOption,
  type TransferStatus
} from "../lib/transfers";
import { useAuth } from "../state/auth";
import { useWorkingBranch } from "../state/working-branch";

type WarehouseOption = { id: string; branchId?: string; name: string; code: string; isDefault?: boolean; status?: "ACTIVE" | "INACTIVE"; branch?: { id: string; name: string } };
type BranchOption = { id: string; name: string };
type Session = ReturnType<typeof useAuth.getState>["session"];
type Transfer = {
  id: string;
  documentNo: string;
  status: TransferStatus;
  note?: string | null;
  createdAt: string;
  receivedAt?: string | null;
  canceledAt?: string | null;
  requestedBy?: { id?: string; name: string } | null;
  sourceWarehouse: WarehouseOption;
  destinationWarehouse: WarehouseOption;
  createdBy?: { id?: string; name: string } | null;
  sourceApprovedBy?: { id?: string; name: string } | null;
  sourceRejectedBy?: { id?: string; name: string } | null;
  destinationConfirmedBy?: { id?: string; name: string } | null;
  receivedBy?: { id?: string; name: string } | null;
  canceledBy?: { id?: string; name: string } | null;
  items: Array<{ id: string; quantity: number; unitCost: string | number; product: { id: string; name: string; sku: string; unit?: string; variantColor?: string | null; variantSize?: string | null } }>;
};

function newRow(productId = ""): TransferDraftRow {
  return { id: crypto.randomUUID(), productId, quantity: 1 };
}

function ProductThumb({ product, className = "h-10 w-10" }: { product?: TransferProductOption; className?: string }) {
  const imageUrl = product ? getProductImageUrl(product as TransferProductOption & { imagePath?: string | null }) : undefined;
  if (imageUrl && product) return <img src={imageUrl} alt={product.name} className={`${className} shrink-0 rounded-md border border-stone-200 object-cover`} />;
  return (
    <span className={`${className} grid shrink-0 place-items-center rounded-md border border-dashed border-stone-300 bg-stone-50 text-stone-400`}>
      <ImageIcon size={18} />
    </span>
  );
}

function TransferProductDropdown({ products, value, onValueChange }: { products: TransferProductOption[]; value: string; onValueChange: (value: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selectedProduct = products.find((product) => product.id === value);

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

  function choose(productId: string) {
    onValueChange(productId);
    setOpen(false);
  }

  return (
    <div
      ref={containerRef}
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        className="field flex min-h-16 w-full items-center gap-3 bg-white py-2 text-left transition hover:border-teal-500"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((current) => !current)}
      >
        <ProductThumb product={selectedProduct} />
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-sm font-bold ${selectedProduct ? "text-ink" : "text-stone-400"}`}>
            {selectedProduct ? getProductDisplayName(selectedProduct) : "เลือกสินค้า"}
          </span>
          {selectedProduct ? <span className="mt-0.5 block truncate text-xs font-semibold text-stone-500">SKU {selectedProduct.sku}</span> : null}
        </span>
        <ChevronDown className={`shrink-0 text-stone-400 transition ${open ? "rotate-180" : ""}`} size={18} />
      </button>

      {open ? (
        <div role="listbox" className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-auto rounded-md border border-stone-200 bg-white p-1 shadow-xl">
          {products.length === 0 ? (
            <div className="px-3 py-4 text-sm font-semibold text-stone-500">ยังไม่มีสินค้าให้เลือก</div>
          ) : products.map((product) => (
            <button
              key={product.id}
              type="button"
              role="option"
              aria-selected={product.id === value}
              className={`flex min-h-14 w-full items-center gap-3 rounded px-3 py-2 text-left transition hover:bg-teal-50 ${product.id === value ? "bg-teal-50" : ""}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(product.id)}
            >
              <ProductThumb product={product} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-ink">{getProductDisplayName(product)}</span>
                <span className="mt-0.5 block truncate text-xs font-semibold text-stone-500">SKU {product.sku}</span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TransferLocationPicker({
  title,
  branchId,
  warehouseId,
  branchOptions,
  warehouseOptions,
  warehouses,
  onBranchChange,
  onWarehouseChange,
  disabled
}: {
  title: string;
  branchId: string;
  warehouseId: string;
  branchOptions: DropdownOption[];
  warehouseOptions: DropdownOption[];
  warehouses: WarehouseOption[];
  onBranchChange: (branchId: string) => void;
  onWarehouseChange: (warehouseId: string) => void;
  disabled?: boolean;
}) {
  const selectedWarehouse = warehouses.find((warehouse) => warehouse.id === warehouseId);
  const showWarehouseDropdown = warehouses.length > 1;
  return (
    <div className="space-y-2">
      <label className="block space-y-1">
        <span className="text-sm font-bold text-stone-600">สาขา{title}</span>
        <Dropdown
          value={branchId}
          onValueChange={onBranchChange}
          options={branchOptions}
          placeholder={`เลือกสาขา${title}`}
          disabled={disabled || branchOptions.length === 0}
        />
      </label>
      {showWarehouseDropdown ? (
        <label className="block space-y-1">
          <span className="text-sm font-bold text-stone-600">คลัง{title}</span>
          <Dropdown
            value={warehouseId}
            onValueChange={onWarehouseChange}
            options={warehouseOptions}
            placeholder={`เลือกคลัง${title}`}
            disabled={disabled || warehouseOptions.length === 0}
          />
        </label>
      ) : selectedWarehouse ? (
        <div className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm">
          <span className="block text-xs font-bold text-stone-500">คลัง{title}</span>
          <span className="mt-0.5 block font-black text-ink">{selectedWarehouse.name}</span>
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-stone-300 bg-stone-50 px-3 py-3 text-sm font-semibold text-stone-500">
          ไม่มีคลังที่เลือกได้
        </div>
      )}
    </div>
  );
}

export function TransfersPage() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const workingBranchId = useWorkingBranch((state) => state.workingBranchId);
  const session = useAuth((state) => state.session);
  const requestedSourceWarehouseId = searchParams.get("sourceWarehouseId") ?? "";
  const requestedDestinationWarehouseId = searchParams.get("destinationWarehouseId") ?? "";
  const requestedProductId = searchParams.get("productId") ?? "";
  const requestedStatus = searchParams.get("status") ?? "";
  const requestedReference = searchParams.get("reference") ?? "";
  const appliedParamsRef = useRef("");
  const [sourceBranchId, setSourceBranchId] = useState("");
  const [destinationBranchId, setDestinationBranchId] = useState("");
  const [sourceWarehouseId, setSourceWarehouseId] = useState(requestedSourceWarehouseId);
  const [destinationWarehouseId, setDestinationWarehouseId] = useState(requestedDestinationWarehouseId);
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<TransferDraftRow[]>(initialTransferRows(requestedProductId));
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const warehouses = useQuery({
    queryKey: ["warehouses", "transfer-options", "business-scope"],
    queryFn: () => api<WarehouseOption[]>("/warehouses?scope=business&for=transfer"),
    refetchOnMount: "always"
  });
  const activeWarehouses = useMemo(() => (warehouses.data ?? []).filter((warehouse) => (warehouse.status ?? "ACTIVE") === "ACTIVE"), [warehouses.data]);
  const destinationWarehouses = useMemo(
    () => activeWarehouses.filter((warehouse) => canAccessWarehouse(session, warehouse)),
    [activeWarehouses, session]
  );
  const sourceBranches = useMemo(() => branchOptionsForWarehouses(activeWarehouses), [activeWarehouses]);
  const destinationBranches = useMemo(() => branchOptionsForWarehouses(destinationWarehouses), [destinationWarehouses]);
  const sourceBranchWarehouses = useMemo(() => warehousesForBranch(activeWarehouses, sourceBranchId), [activeWarehouses, sourceBranchId]);
  const destinationBranchWarehouses = useMemo(() => warehousesForBranch(destinationWarehouses, destinationBranchId), [destinationWarehouses, destinationBranchId]);
  const sourceBranchOptions = useMemo(() => sourceBranches.map((branch) => ({ value: branch.id, label: branch.name })), [sourceBranches]);
  const destinationBranchOptions = useMemo(() => destinationBranches.map((branch) => ({ value: branch.id, label: branch.name })), [destinationBranches]);
  const sourceWarehouseOptions = useMemo(() => warehouseOnlyOptions(sourceBranchWarehouses), [sourceBranchWarehouses]);
  const destinationWarehouseOptions = useMemo(() => warehouseOnlyOptions(destinationBranchWarehouses, sourceWarehouseId), [destinationBranchWarehouses, sourceWarehouseId]);
  const selectedSourceBranchId = useMemo(() => {
    const source = activeWarehouses.find((warehouse) => warehouse.id === sourceWarehouseId);
    return source?.branchId ?? source?.branch?.id ?? workingBranchId;
  }, [activeWarehouses, sourceWarehouseId, workingBranchId]);
  const products = useQuery({ queryKey: ["products", "transfer", selectedSourceBranchId], queryFn: () => api<TransferProductOption[]>(branchScopedPath("/products?status=ACTIVE,PAUSED,DISCONTINUED", selectedSourceBranchId)) });
  const transfers = useQuery({
    queryKey: ["transfers", workingBranchId, requestedStatus],
    queryFn: () => api<Transfer[]>(branchScopedPath(`/inventory/transfers${requestedStatus ? `?status=${encodeURIComponent(requestedStatus)}` : ""}`, workingBranchId))
  });
  const productMap = useMemo(() => new Map((products.data ?? []).map((product) => [product.id, product])), [products.data]);
  const formIssue = getTransferFormIssue({ sourceWarehouseId, destinationWarehouseId, rows, products: products.data ?? [] });
  const createsImmediateTransfer = Boolean(session?.user.isSystemAdmin || session?.business?.role === "OWNER");
  const requestedTransfers = useMemo(() => (transfers.data ?? []).filter((transfer) => transfer.status === "REQUESTED"), [transfers.data]);
  const inTransitTransfers = useMemo(() => (transfers.data ?? []).filter((transfer) => transfer.status === "IN_TRANSIT"), [transfers.data]);
  const transferHistory = useMemo(() => {
    const keyword = requestedReference.trim().toLowerCase();
    const rows = transfers.data ?? [];
    if (!keyword) return rows;
    return rows.filter((transfer) => transfer.documentNo.toLowerCase().includes(keyword));
  }, [requestedReference, transfers.data]);

  useEffect(() => {
    if (!activeWarehouses.length) return;
    const key = `${requestedSourceWarehouseId}:${requestedDestinationWarehouseId}:${requestedProductId}:${activeWarehouses.length}:${destinationWarehouses.length}:${workingBranchId}`;
    if (appliedParamsRef.current === key) return;
    const source = activeWarehouses.find((warehouse) => warehouse.id === requestedSourceWarehouseId) ?? activeWarehouses.find((warehouse) => (warehouse.branchId ?? warehouse.branch?.id) === workingBranchId) ?? activeWarehouses[0];
    const destination = preferredDestinationWarehouse(destinationWarehouses, workingBranchId, source?.id, requestedDestinationWarehouseId);
    setSourceBranchId(branchIdOf(source) ?? "");
    setDestinationBranchId(branchIdOf(destination) ?? workingBranchId ?? "");
    setSourceWarehouseId(source?.id ?? "");
    setDestinationWarehouseId(destination?.id ?? "");
    setRows(initialTransferRows(requestedProductId));
    appliedParamsRef.current = key;
  }, [activeWarehouses, destinationWarehouses, requestedDestinationWarehouseId, requestedProductId, requestedSourceWarehouseId, workingBranchId]);

  useEffect(() => {
    if (!sourceWarehouseId || !destinationWarehouses.length) return;
    const destination = destinationWarehouses.find((warehouse) => warehouse.id === destinationWarehouseId);
    if (destination && destination.id !== sourceWarehouseId) return;
    const nextDestination = preferredDestinationWarehouse(destinationWarehouses, workingBranchId, sourceWarehouseId);
    setDestinationBranchId(branchIdOf(nextDestination) ?? "");
    setDestinationWarehouseId(nextDestination?.id ?? "");
  }, [destinationWarehouseId, destinationWarehouses, sourceWarehouseId, workingBranchId]);

  useEffect(() => {
    if (!sourceBranchId || sourceBranchWarehouses.length === 0) return;
    if (sourceBranchWarehouses.some((warehouse) => warehouse.id === sourceWarehouseId)) return;
    setSourceWarehouseId(preferredWarehouse(sourceBranchWarehouses)?.id ?? "");
  }, [sourceBranchId, sourceBranchWarehouses, sourceWarehouseId]);

  useEffect(() => {
    if (!destinationBranchId || destinationBranchWarehouses.length === 0) return;
    const currentDestination = destinationBranchWarehouses.find((warehouse) => warehouse.id === destinationWarehouseId && warehouse.id !== sourceWarehouseId);
    if (currentDestination) return;
    setDestinationWarehouseId(preferredWarehouse(destinationBranchWarehouses, sourceWarehouseId)?.id ?? "");
  }, [destinationBranchId, destinationBranchWarehouses, destinationWarehouseId, sourceWarehouseId]);

  const createMutation = useMutation({
    mutationFn: () => post<Transfer>("/inventory/transfers", buildTransferPayload({ sourceWarehouseId, destinationWarehouseId, note, rows })),
    onSuccess: (transfer) => {
      setMessage(transfer.status === "IN_TRANSIT" ? "โอนสินค้าแล้ว สินค้าอยู่ระหว่างทาง" : "สร้างคำขอสินค้าแล้ว รอต้นทางอนุมัติ");
      setError("");
      setNote("");
      setRows([newRow()]);
      refreshTransferQueries(queryClient);
    },
    onError: (err) => {
      setMessage("");
      setError(err.message);
    }
  });

  function updateRow(id: string, patch: Partial<TransferDraftRow>) {
    setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch, quantity: Number(patch.quantity ?? row.quantity) } : row));
  }

  function addRow() {
    setRows((current) => [...current, newRow()]);
  }

  function removeRow(id: string) {
    setRows((current) => current.length === 1 ? current : current.filter((row) => row.id !== id));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (formIssue) {
      setError(formIssue);
      return;
    }
    createMutation.mutate();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-ink">โอนสินค้า</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-stone-600">{createsImmediateTransfer ? "โอนออกจากคลังต้นทางทันที แล้วรอรับเข้าคลังปลายทาง" : "ขอสินค้าจากคลังต้นทาง รอผู้จัดการต้นทางอนุมัติ แล้วรับเข้าคลังปลายทาง"}</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {canViewTransferRequests(session) ? (
            <Link to="/app/transfers/requests" className="relative inline-flex">
              <Button className="h-9 px-3" variant="secondary" icon={<CheckCircle2 size={17} />}>รอยืนยันรับของ</Button>
              {inTransitTransfers.length > 0 ? (
                <span className="absolute -right-2 -top-2 grid h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[11px] font-black leading-none text-white shadow-sm ring-2 ring-white">
                  {inTransitTransfers.length > 9 ? "9+" : number(inTransitTransfers.length)}
                </span>
              ) : null}
            </Link>
          ) : null}
          <Link to="/app/stock-search">
            <Button className="h-9 px-3" variant="secondary" icon={<ClipboardList size={17} />}>ค้นหาคลัง</Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Metric label="รออนุมัติต้นทาง" value={`${number(requestedTransfers.length)} ใบ`} />
        <Metric label="ระหว่างทาง" value={`${number(inTransitTransfers.length)} ใบ`} />
        <Metric label="เอกสารทั้งหมด" value={`${number(transfers.data?.length ?? 0)} ใบ`} />
      </div>

      <Card className="space-y-4 p-4">
        <div>
          <h2 className="text-lg font-black text-ink">{createsImmediateTransfer ? "โอนสินค้า" : "สร้างคำขอสินค้า"}</h2>
          <p className="mt-0.5 text-sm text-stone-500">{createsImmediateTransfer ? "เจ้าของร้านโอนได้ทันที ระบบจะตัดสต็อกต้นทางและบันทึกสินค้าอยู่ระหว่างทาง" : "บันทึกคำขอก่อน ยังไม่ตัดสต็อกจนกว่าผู้จัดการต้นทางจะอนุมัติส่งออก"}</p>
        </div>
        <form className="space-y-4" onSubmit={submit}>
          <div className="grid gap-3 md:grid-cols-2">
            <TransferLocationPicker
              title="ต้นทาง"
              branchId={sourceBranchId}
              warehouseId={sourceWarehouseId}
              branchOptions={sourceBranchOptions}
              warehouseOptions={sourceWarehouseOptions}
              warehouses={sourceBranchWarehouses}
              onBranchChange={(branchId) => {
                setSourceBranchId(branchId);
                setSourceWarehouseId(preferredWarehouse(warehousesForBranch(activeWarehouses, branchId))?.id ?? "");
              }}
              onWarehouseChange={setSourceWarehouseId}
            />
            <TransferLocationPicker
              title="ปลายทาง"
              branchId={destinationBranchId}
              warehouseId={destinationWarehouseId}
              branchOptions={destinationBranchOptions}
              warehouseOptions={destinationWarehouseOptions}
              warehouses={destinationBranchWarehouses}
              onBranchChange={(branchId) => {
                setDestinationBranchId(branchId);
                setDestinationWarehouseId(preferredWarehouse(warehousesForBranch(destinationWarehouses, branchId), sourceWarehouseId)?.id ?? "");
              }}
              onWarehouseChange={setDestinationWarehouseId}
              disabled={destinationWarehouses.length === 0}
            />
          </div>

          <div className="space-y-2">
            {rows.map((row) => {
              const product = productMap.get(row.productId);
              const sourceStock = stockAtWarehouse(product, sourceWarehouseId);
              return (
                <div key={row.id} className="grid gap-2 rounded-md border border-stone-200 p-3 md:grid-cols-[1fr_140px_120px_44px]">
                  <TransferProductDropdown
                    value={row.productId}
                    onValueChange={(productId) => updateRow(row.id, { productId })}
                    products={products.data ?? []}
                  />
                  <input className="field h-11" type="number" min={1} value={row.quantity} onChange={(event) => updateRow(row.id, { quantity: Number(event.target.value) })} />
                  <div className="rounded-md bg-stone-50 px-3 py-2 text-sm">
                    <span className="block text-xs font-bold text-stone-500">ต้นทางมี</span>
                    <span className="font-black text-ink">{number(sourceStock)} {product?.unit ?? ""}</span>
                  </div>
                  <Button type="button" variant="ghost" className="h-11 w-11 px-0" icon={<Trash2 size={16} />} onClick={() => removeRow(row.id)} aria-label="ลบรายการ" />
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button type="button" variant="secondary" icon={<Plus size={16} />} onClick={addRow}>เพิ่มสินค้า</Button>
            <label className="min-w-[260px] flex-1">
              <input className="field h-11" value={note} onChange={(event) => setNote(event.target.value)} placeholder="หมายเหตุ เช่น ส่งไปเติมหน้าร้าน" />
            </label>
            <Button type="submit" icon={<ArrowRightLeft size={16} />} disabled={createMutation.isPending || Boolean(formIssue)}>
              {createsImmediateTransfer ? "โอนทันที" : "สร้างคำขอ"}
            </Button>
          </div>
          {formIssue ? <p className="text-sm font-semibold text-amber-700">{formIssue}</p> : null}
          {message ? <p className="rounded-md bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-700">{message}</p> : null}
          {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p> : null}
        </form>
      </Card>

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-ink">ประวัติโอนสาขา</h2>
            <p className="mt-0.5 text-sm text-stone-500">{requestedReference ? `กรองเอกสาร ${requestedReference}` : "ติดตามเอกสารโอนทั้งใบ พร้อมต้นทาง ปลายทาง สถานะ และรายการสินค้า"}</p>
          </div>
          {requestedReference ? (
            <Link to="/app/transfers">
              <Button type="button" variant="ghost">ดูทั้งหมด</Button>
            </Link>
          ) : null}
        </div>
        <div className="table-shell -mx-4 border-x-0 shadow-none sm:mx-0 sm:border-x sm:shadow-sm">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="bg-stone-50 text-stone-500">
              <tr>
                <th className="p-3">เลขเอกสาร</th>
                <th className="p-3">ต้นทาง</th>
                <th className="p-3">ปลายทาง</th>
                <th className="p-3">สินค้า</th>
                <th className="p-3">สถานะ</th>
                <th className="p-3">วันที่</th>
              </tr>
            </thead>
            <tbody>
              {transferHistory.map((transfer) => (
                <tr key={transfer.id} className="border-t border-stone-100 align-top hover:bg-stone-50">
                  <td className="p-3 font-black text-ink">{transfer.documentNo}</td>
                  <td className="p-3 text-stone-600">{warehouseDisplay(transfer.sourceWarehouse)}</td>
                  <td className="p-3 text-stone-600">{warehouseDisplay(transfer.destinationWarehouse)}</td>
                  <td className="max-w-[260px] p-3 text-stone-600">{transferItemsLabel(transfer)}</td>
                  <td className="p-3">
                    <span className="inline-flex rounded-md bg-stone-100 px-2 py-1 text-xs font-black text-stone-700 ring-1 ring-stone-200">
                      {transferStatusLabel(transfer.status)}
                    </span>
                  </td>
                  <td className="p-3 text-stone-600">{thaiDate(transfer.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!transfers.isLoading && transferHistory.length === 0 ? <p className="rounded-md bg-stone-50 p-4 text-sm text-stone-600">ยังไม่พบเอกสารโอนที่ตรงกับเงื่อนไขนี้</p> : null}
        {transfers.error ? <p className="text-sm font-semibold text-red-700">โหลดประวัติโอนไม่สำเร็จ: {transfers.error.message}</p> : null}
      </Card>

    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-stone-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-semibold text-stone-500">{label}</p>
      <p className="mt-2 text-2xl font-black text-ink">{value}</p>
    </div>
  );
}

const transferStatusLabels: Record<TransferStatus, string> = {
  REQUESTED: "รออนุมัติต้นทาง",
  SOURCE_APPROVED: "ต้นทางอนุมัติแล้ว",
  IN_TRANSIT: "ระหว่างทาง",
  RECEIVED: "รับเข้าปลายทางแล้ว",
  SOURCE_REJECTED: "ต้นทางปฏิเสธ",
  CANCELED: "ยกเลิก"
};

function transferStatusLabel(status: TransferStatus) {
  return transferStatusLabels[status] ?? status;
}

function warehouseDisplay(warehouse: WarehouseOption) {
  const branchName = warehouse.branch?.name;
  if (!branchName || branchName === warehouse.name) return warehouse.name;
  return `${branchName} / ${warehouse.name}`;
}

function transferItemsLabel(transfer: Transfer) {
  return transfer.items.map((item) => `${getProductDisplayName(item.product)} x ${number(item.quantity)} ${item.product.unit ?? ""}`.trim()).join(", ");
}

function refreshTransferQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["transfers"] });
  queryClient.invalidateQueries({ queryKey: ["products"] });
  queryClient.invalidateQueries({ queryKey: ["inventory-balances"] });
  queryClient.invalidateQueries({ queryKey: ["movements"] });
  queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  queryClient.invalidateQueries({ queryKey: ["stock-report"] });
}

function branchIdOf(warehouse?: WarehouseOption) {
  return warehouse?.branchId ?? warehouse?.branch?.id;
}

function canAccessWarehouse(session: Session, warehouse?: WarehouseOption) {
  const role = session?.business?.role;
  if (session?.user.isSystemAdmin || role === "OWNER") return true;
  const branchId = branchIdOf(warehouse);
  return Boolean(branchId && session?.business?.assignedBranchIds?.includes(branchId));
}

function canViewTransferRequests(session: Session) {
  const role = session?.business?.role;
  return Boolean(session?.user.isSystemAdmin || role === "OWNER" || role === "MANAGER" || role === "BRANCH_MANAGER");
}

function branchOptionsForWarehouses(warehouses: WarehouseOption[]): BranchOption[] {
  const branches = new Map<string, BranchOption>();
  for (const warehouse of warehouses) {
    const branchId = branchIdOf(warehouse);
    if (!branchId || branches.has(branchId)) continue;
    branches.set(branchId, { id: branchId, name: warehouse.branch?.name ?? "ไม่ระบุสาขา" });
  }
  return [...branches.values()].sort((left, right) => left.name.localeCompare(right.name, "th"));
}

function warehousesForBranch(warehouses: WarehouseOption[], branchId: string) {
  if (!branchId) return [];
  return warehouses
    .filter((warehouse) => branchIdOf(warehouse) === branchId)
    .sort((left, right) => Number(Boolean(right.isDefault)) - Number(Boolean(left.isDefault)) || left.name.localeCompare(right.name, "th"));
}

function warehouseOnlyOptions(warehouses: WarehouseOption[], disabledWarehouseId?: string): DropdownOption[] {
  return warehouses.map((warehouse) => ({
    value: warehouse.id,
    label: warehouse.name,
    disabled: Boolean(disabledWarehouseId && warehouse.id === disabledWarehouseId)
  }));
}

function preferredWarehouse(warehouses: WarehouseOption[], excludedWarehouseId?: string) {
  const allowed = warehouses.filter((warehouse) => warehouse.id !== excludedWarehouseId);
  return allowed.find((warehouse) => warehouse.isDefault) ?? allowed[0];
}

function preferredDestinationWarehouse(warehouses: WarehouseOption[], workingBranchId?: string, sourceWarehouseId?: string, requestedWarehouseId?: string) {
  const allowed = warehouses.filter((warehouse) => warehouse.id !== sourceWarehouseId);
  if (requestedWarehouseId) {
    const requested = allowed.find((warehouse) => warehouse.id === requestedWarehouseId);
    if (requested) return requested;
  }
  const workingBranchWarehouses = allowed.filter((warehouse) => branchIdOf(warehouse) === workingBranchId);
  return preferredWarehouse(workingBranchWarehouses) ?? preferredWarehouse(allowed);
}
