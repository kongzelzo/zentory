import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Archive, ArrowLeft, Ban, Boxes, ChevronDown, Image as ImageIcon, Maximize2, PauseCircle, Pencil, ReceiptText, RotateCcw, Save, ScanLine, Trash2, X } from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { BarcodeScanner } from "../components/BarcodeScanner";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Dropdown } from "../components/Dropdown";
import { api, deleteProductImage, patch, uploadProductImage } from "../lib/api";
import { branchScopedPath } from "../lib/branch-scope";
import { baht, number, thaiDate } from "../lib/format";
import { getBalanceWarehouseName, getProductDisplayName, getProductImageUrl, getProductProfitMetrics, getProductReceiptHref, getProductStockAlert, getProductStockLocationSummary, getStockBadge, PRODUCT_STATUS_LABELS, stockOf, validateProductImageFile, type ProductForSummary, type ProductStatus } from "../lib/products";
import { useWorkingBranch } from "../state/working-branch";

type ProductMovement = {
  id: string;
  type: string;
  quantity: number;
  balanceBefore?: number;
  balanceAfter?: number;
  reason?: string;
  adjustmentMode?: "SET_ACTUAL" | "INCREASE" | "DECREASE";
  targetQuantity?: number;
  reference?: string;
  createdAt: string;
  user?: { name: string };
  branch?: { name: string };
  warehouse?: { name: string; branch?: { name: string } };
};

type ProductDetail = Omit<ProductForSummary, "balances"> & {
  description?: string;
  status: ProductStatus;
  createdAt?: string;
  updatedAt?: string;
  balances: Array<{ quantity: number; branch?: { name: string }; warehouse?: { name: string; branch?: { name: string } } }>;
  movements?: ProductMovement[];
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

const adjustmentModeLabels: Record<NonNullable<ProductMovement["adjustmentMode"]>, string> = {
  SET_ACTUAL: "ตั้งยอดจริง",
  INCREASE: "ปรับเพิ่ม",
  DECREASE: "ปรับลด"
};

const editableStatuses: Array<{ value: "ACTIVE" | "PAUSED" | "DISCONTINUED"; label: string }> = [
  { value: "ACTIVE", label: "เปิดขาย / ใช้งาน" },
  { value: "PAUSED", label: "หยุดขายชั่วคราว" },
  { value: "DISCONTINUED", label: "ปิดขาย" }
];

function textValue(form: FormData, name: string) {
  const value = String(form.get(name) ?? "").trim();
  return value || undefined;
}

function numberValue(form: FormData, name: string) {
  const value = Number(form.get(name));
  return Number.isFinite(value) ? value : NaN;
}

function formatMaybeBaht(value?: number) {
  return value === undefined ? "-" : baht(value);
}

function formatMaybePercent(value?: number) {
  return value === undefined ? "-" : `${number(Math.round(value * 10) / 10)}%`;
}

function balanceWarehouseName(balance: ProductDetail["balances"][number]) {
  return getBalanceWarehouseName(balance);
}

function movementWarehouseName(movement: ProductMovement) {
  return movement.warehouse?.name?.trim() || movement.branch?.name?.trim() || "คลังหลัก";
}

function movementLabel(movement: ProductMovement) {
  if (movement.reference === "INITIAL-STOCK") return "สต็อกเริ่มต้น";
  if (movement.reference === "SAMPLE-DATA") return "ข้อมูลตัวอย่าง";
  if (movement.adjustmentMode) return adjustmentModeLabels[movement.adjustmentMode];
  return movementLabels[movement.type] ?? movement.type;
}

function signedQuantity(movement: ProductMovement, unit: string) {
  if (movement.adjustmentMode === "SET_ACTUAL") return `ตั้งเป็น ${number(movement.targetQuantity ?? movement.balanceAfter ?? 0)} ${unit}`;
  const sign = movement.type === "RECEIVE_IN" || movement.type === "ADJUSTMENT_IN" || movement.type === "TRANSFER_IN" || movement.type === "TRANSFER_CANCEL" ? "+" : "-";
  return `${sign}${number(movement.quantity)} ${unit}`;
}

function ProductImageFrame({ product, className = "h-40 w-40" }: { product: Pick<ProductForSummary, "imagePath" | "name">; className?: string }) {
  const imageUrl = getProductImageUrl(product);
  if (imageUrl) {
    return <img src={imageUrl} alt={product.name} className={`${className} rounded-md border border-stone-200 object-cover shadow-sm`} />;
  }
  return (
    <span className={`${className} grid place-items-center rounded-md border border-dashed border-stone-300 bg-stone-50 text-stone-400`}>
      <ImageIcon size={34} />
    </span>
  );
}

export function ProductDetailPage() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const workingBranchId = useWorkingBranch((state) => state.workingBranchId);
  const [message, setMessage] = useState("");
  const [showMoreActions, setShowMoreActions] = useState(false);
  const [isImagePreviewOpen, setIsImagePreviewOpen] = useState(false);
  const product = useQuery({ queryKey: ["product", id, workingBranchId], queryFn: () => api<ProductDetail>(branchScopedPath(`/products/${id}`, workingBranchId)), enabled: Boolean(id) });
  const statusMutation = useMutation({
    mutationFn: ({ action }: { action: "pause" | "discontinue" | "archive" | "reactivate" }) => {
      const path = action === "archive" ? `/products/${id}/${action}` : branchScopedPath(`/products/${id}/${action}`, workingBranchId);
      return patch(path, {});
    },
    onSuccess: (_, variables) => {
      setMessage(variables.action === "reactivate" && product.data?.status === "ARCHIVED" ? "กู้คืนสินค้าเป็นสถานะหยุดขายแล้ว" : "อัปเดตสถานะสินค้าแล้ว");
      queryClient.invalidateQueries({ queryKey: ["product", id] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["stock-report"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error) => setMessage(error.message)
  });

  const productImageUrl = getProductImageUrl(product.data ?? { imagePath: null });

  useEffect(() => {
    if (!isImagePreviewOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsImagePreviewOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isImagePreviewOpen]);

  if (product.isLoading) return <Card>กำลังโหลดสินค้า...</Card>;
  if (product.error) return <Card className="text-red-700">โหลดสินค้าไม่สำเร็จ: {product.error.message}</Card>;
  if (!product.data) return null;

  const stock = stockOf(product.data);
  const lifecycle = PRODUCT_STATUS_LABELS[product.data.status];
  const stockBadge = getStockBadge(product.data);
  const stockAlert = getProductStockAlert(product.data);
  const profit = getProductProfitMetrics(product.data);
  const receiptHref = getProductReceiptHref(product.data.id);
  const dangerousActions = [
    product.data.status === "ACTIVE" ? { key: "pause" as const, icon: <PauseCircle size={16} />, label: "หยุดขายชั่วคราว" } : null,
    product.data.status === "ACTIVE" || product.data.status === "PAUSED" ? { key: "discontinue" as const, icon: <Ban size={16} />, label: "ปิดขาย" } : null,
    product.data.status === "PAUSED" || product.data.status === "DISCONTINUED" ? { key: "reactivate" as const, icon: <RotateCcw size={16} />, label: "เปิดขายอีกครั้ง" } : null,
    product.data.status === "ARCHIVED" ? { key: "reactivate" as const, icon: <RotateCcw size={16} />, label: "กู้คืนสินค้า" } : null,
    product.data.status === "DISCONTINUED" ? { key: "archive" as const, icon: <Archive size={16} />, label: "เก็บเข้าประวัติ" } : null
  ].filter(Boolean) as Array<{ key: "pause" | "discontinue" | "archive" | "reactivate"; icon: JSX.Element; label: string }>;

  function changeStatus(action: "pause" | "discontinue" | "archive" | "reactivate") {
    if (!product.data) return;
    const branchText = workingBranchId ? "ในสาขานี้" : "ทั้งร้าน";
    const prompts = {
      pause: `หยุดขายชั่วคราว "${product.data.name}" ${branchText} ใช่ไหม?`,
      discontinue:
        stock > 0
          ? `ปิดขายถาวร "${product.data.name}" ${branchText} ใช่ไหม? ยังมีสต็อกเหลือ ${number(stock)} ${product.data.unit} และสินค้ายังนับในแพ็กเกจจนกว่าจะเคลียร์สต็อก`
          : `ปิดขายถาวร "${product.data.name}" ${branchText} ใช่ไหม? สินค้านี้ไม่มีสต็อกแล้ว`,
      archive: `เก็บ "${product.data.name}" เข้าประวัติใช่ไหม? ต้องไม่มีสต็อกคงเหลือก่อนเก็บ`,
      reactivate: product.data.status === "ARCHIVED" ? `กู้คืน "${product.data.name}" กลับมาเป็นสถานะหยุดขายใช่ไหม?` : `เปิดขาย "${product.data.name}" ${branchText} อีกครั้งใช่ไหม?`
    };
    if (!window.confirm(prompts[action])) return;
    statusMutation.mutate({ action });
  }

  return (
    <div className="space-y-5">
      <Card className="p-4 sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            {productImageUrl ? (
              <button
                type="button"
                className="group relative h-32 w-32 shrink-0 rounded-md text-left focus:outline-none focus:ring-4 focus:ring-teal-100"
                onClick={() => setIsImagePreviewOpen(true)}
                aria-label={`ขยายรูปสินค้า ${product.data.name}`}
              >
                <ProductImageFrame product={product.data} className="h-32 w-32" />
                <span className="absolute inset-0 grid place-items-center rounded-md bg-black/0 text-white opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100 group-focus:bg-black/30 group-focus:opacity-100">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-black/55">
                    <Maximize2 size={18} />
                  </span>
                </span>
              </button>
            ) : (
              <ProductImageFrame product={product.data} className="h-32 w-32 shrink-0" />
            )}
            <div className="min-w-0">
              <Link to="/app/products" className="inline-flex items-center gap-2 text-sm font-semibold text-stone-500 hover:text-ink">
                <ArrowLeft size={16} /> กลับไปหน้าสินค้า
              </Link>
              <h1 className="mt-2 break-words text-3xl font-black text-ink">{getProductDisplayName(product.data)}</h1>
              <div className="mt-2 grid gap-1 text-sm text-stone-600 sm:grid-cols-2">
                <p><span className="font-semibold text-ink">SKU:</span> {product.data.sku}</p>
                <p><span className="font-semibold text-ink">Barcode:</span> {product.data.barcode ?? "-"}</p>
                <p className="sm:col-span-2"><span className="font-semibold text-ink">คลัง:</span> {getProductStockLocationSummary(product.data)}</p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className={`rounded px-2 py-1 text-xs font-bold ${lifecycle.className}`}>{lifecycle.label}</span>
                <span className={`rounded px-2 py-1 text-xs font-bold ${stockBadge.className}`}>{stockBadge.label}</span>
              </div>
              {!product.data.imagePath && product.data.status !== "ARCHIVED" ? (
                <Link to={`/app/products/${product.data.id}/edit`} className="mt-3 inline-flex text-sm font-bold text-leaf hover:text-teal-800">
                  เพิ่มรูปสินค้า
                </Link>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-start gap-2 lg:justify-end">
            {product.data.status !== "ARCHIVED" ? <Link to={receiptHref}><Button variant="secondary" icon={<Boxes size={16} />}>รับเข้าเพิ่ม</Button></Link> : null}
            <Link to="/app/pos"><Button variant="secondary" icon={<ReceiptText size={16} />}>ขายหน้าร้าน</Button></Link>
            {product.data.status !== "ARCHIVED" ? <Link to={`/app/products/${product.data.id}/edit`}><Button icon={<Pencil size={16} />}>แก้ไขสินค้า</Button></Link> : null}
            {dangerousActions.length ? (
              <div className="relative">
                <Button type="button" variant="secondary" icon={<ChevronDown size={16} />} onClick={() => setShowMoreActions((current) => !current)}>เพิ่มเติม</Button>
                {showMoreActions ? (
                  <div className="absolute right-0 z-10 mt-2 w-56 rounded-md border border-stone-200 bg-white p-2 shadow-lg">
                    {dangerousActions.map((action) => (
                      <button
                        key={action.key}
                        type="button"
                        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold text-ink hover:bg-stone-50 disabled:opacity-50"
                        disabled={statusMutation.isPending}
                        onClick={() => {
                          setShowMoreActions(false);
                          changeStatus(action.key);
                        }}
                      >
                        {action.icon}
                        {action.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </Card>

      {isImagePreviewOpen && productImageUrl ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`รูปสินค้า ${product.data.name}`}
          onMouseDown={() => setIsImagePreviewOpen(false)}
        >
          <div className="relative max-h-full w-full max-w-5xl" onMouseDown={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="absolute right-0 top-0 z-10 grid h-10 w-10 -translate-y-12 place-items-center rounded-full bg-white text-ink shadow-lg transition hover:bg-stone-100 focus:outline-none focus:ring-4 focus:ring-teal-100 sm:right-2 sm:top-2 sm:translate-y-0"
              onClick={() => setIsImagePreviewOpen(false)}
              aria-label="ปิดรูปสินค้า"
            >
              <X size={20} />
            </button>
            <img
              src={productImageUrl}
              alt={product.data.name}
              className="mx-auto max-h-[82vh] w-auto max-w-full rounded-md bg-white object-contain shadow-2xl"
            />
            <p className="mt-3 text-center text-sm font-semibold text-white">{product.data.name}</p>
          </div>
        </div>
      ) : null}

      {message ? <p className="rounded-md bg-teal-50 p-3 text-sm font-semibold text-leaf">{message}</p> : null}

      {stockAlert ? (
        <Card className={stockAlert.tone === "danger" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className={stockAlert.tone === "danger" ? "font-black text-red-800" : "font-black text-amber-800"}>{stockAlert.title}</p>
              <p className="mt-1 text-sm text-stone-700">{stockAlert.description}</p>
            </div>
            {product.data.status !== "ARCHIVED" ? (
              <Link to={receiptHref}><Button variant="secondary" icon={<Boxes size={16} />}>รับเข้าเพิ่ม</Button></Link>
            ) : null}
          </div>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <ProductKpi label="คงเหลือรวม" value={`${number(stock)} ${product.data.unit}`} />
        <ProductKpi label="ต้นทุนมาตรฐาน" value={formatMaybeBaht(profit.costPrice)} />
        <ProductKpi label="ราคาขาย" value={formatMaybeBaht(profit.salePrice)} />
        <ProductKpi label="กำไรต่อชิ้น" value={formatMaybeBaht(profit.profit)} />
        <ProductKpi label="Margin" value={formatMaybePercent(profit.marginPercent)} />
        <ProductKpi label="จุดแจ้งเตือน" value={`${number(product.data.minStock)} ${product.data.unit}`} />
      </div>

      <Card>
        <h2 className="text-xl font-black text-ink">ข้อมูลสินค้า</h2>
        <div className="mt-4 grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
          <InfoItem label="หมวดหมู่" value={product.data.category?.name} />
          <InfoItem label="แบรนด์" value={product.data.brand?.name} />
          <InfoItem label="หน่วยนับ" value={product.data.unit} />
          <InfoItem label="สถานะสินค้า" value={lifecycle.label} />
          <InfoItem label="วันที่สร้าง" value={product.data.createdAt ? thaiDate(product.data.createdAt) : undefined} />
          <InfoItem label="แก้ไขล่าสุด" value={product.data.updatedAt ? thaiDate(product.data.updatedAt) : undefined} />
          <div className="md:col-span-2 xl:col-span-4">
            <p className="text-xs font-bold uppercase text-stone-500">รายละเอียด / หมายเหตุ</p>
            <p className="mt-1 whitespace-pre-wrap rounded-md bg-stone-50 p-3 text-ink">{product.data.description ?? "-"}</p>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="text-xl font-black text-ink">คงเหลือตามคลัง</h2>
        {product.data.balances.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="border-b border-stone-200 text-stone-500">
                <tr>
                  <th className="py-2 pr-3">คลัง</th>
                  <th className="py-2 pr-3 text-right">จำนวนคงเหลือ</th>
                  <th className="py-2 pr-3">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {product.data.balances.map((balance, index) => {
                  const branchStockState = balance.quantity <= 0 ? "หมดสต็อก" : balance.quantity <= product.data.minStock ? "ใกล้หมด" : "ปกติ";
                  return (
                    <tr key={`${balance.warehouse?.name ?? balance.branch?.name ?? "warehouse"}-${index}`} className="border-b border-stone-100 last:border-0">
                      <td className="py-3 pr-3 font-semibold text-ink">{balanceWarehouseName(balance)}</td>
                      <td className="py-3 pr-3 text-right">{number(balance.quantity)} {product.data.unit}</td>
                      <td className="py-3 pr-3 text-stone-600">{branchStockState}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 rounded-md bg-stone-50 p-4 text-sm text-stone-600">ยังไม่มีข้อมูลคงเหลือตามคลัง สต็อกจริงจะถูกสร้างเมื่อมีรายการรับเข้า ปรับยอด ขายออก หรือธุรกรรมคลังอื่น ๆ</p>
        )}
        <div className="mt-4">
          <Link to="/app/inventory/movements"><Button type="button" variant="secondary">ดูประวัติสต็อกทั้งหมด</Button></Link>
        </div>
      </Card>

      <Card>
        <h2 className="text-xl font-black text-ink">ประวัติสต็อกล่าสุด</h2>
        <div className="mt-4 space-y-2">
          {(product.data.movements ?? []).map((movement) => (
            <div key={movement.id} className="grid gap-2 rounded-md border border-stone-200 p-3 text-sm md:grid-cols-[1fr_120px_120px_120px_150px]">
              <div>
                <p className="font-semibold text-ink">{movementLabel(movement)}</p>
                <p className="text-xs text-stone-500">{movement.reference ?? "ไม่มีเลขอ้างอิง"}{movement.reason ? ` / ${movement.reason}` : ""}</p>
                <p className="text-xs text-stone-500">{movementWarehouseName(movement)} / {movement.user?.name ?? "-"}</p>
              </div>
              <p>{signedQuantity(movement, product.data.unit)}</p>
              <p>ก่อน {movement.balanceBefore === undefined ? "-" : number(movement.balanceBefore)}</p>
              <p>หลัง {movement.balanceAfter === undefined ? "-" : number(movement.balanceAfter)}</p>
              <p className="text-stone-500">{thaiDate(movement.createdAt)}</p>
            </div>
          ))}
          {(product.data.movements ?? []).length === 0 ? <p className="rounded-md bg-stone-50 p-4 text-sm text-stone-600">ยังไม่มีประวัติสต็อกสำหรับสินค้านี้</p> : null}
        </div>
      </Card>
    </div>
  );
}

function ProductKpi({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-bold uppercase text-stone-500">{label}</p>
      <p className="mt-2 break-words text-2xl font-black text-ink">{value}</p>
    </Card>
  );
}

function InfoItem({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="rounded-md bg-stone-50 p-3">
      <p className="text-xs font-bold uppercase text-stone-500">{label}</p>
      <p className="mt-1 font-semibold text-ink">{value || "-"}</p>
    </div>
  );
}

export function ProductEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState("");
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [removeImage, setRemoveImage] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [costInput, setCostInput] = useState("");
  const [saleInput, setSaleInput] = useState("");
  const [barcodeInput, setBarcodeInput] = useState("");
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const workingBranchId = useWorkingBranch((state) => state.workingBranchId);
  const product = useQuery({ queryKey: ["product", id, workingBranchId], queryFn: () => api<ProductDetail>(branchScopedPath(`/products/${id}`, workingBranchId)), enabled: Boolean(id) });
  const mutation = useMutation({
    mutationFn: async (body: unknown) => {
      const updated = await patch<ProductDetail>(`/products/${id}`, body);
      if (!id) return updated;
      if (removeImage) await deleteProductImage<ProductDetail>(id);
      if (selectedImage) return uploadProductImage<ProductDetail>(id, selectedImage);
      return updated;
    },
    onSuccess: () => {
      setIsDirty(false);
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["product", id] });
      queryClient.invalidateQueries({ queryKey: ["stock-report"] });
      navigate(`/app/products/${id}`);
    },
    onError: (err) => setError(err.message)
  });

  useEffect(() => {
    if (!product.data) return;
    setCostInput(String(product.data.costPrice));
    setSaleInput(String(product.data.salePrice));
    setBarcodeInput(product.data.barcode ?? "");
  }, [product.data]);

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  function confirmLeave() {
    return !isDirty || window.confirm("คุณมีข้อมูลที่ยังไม่ได้บันทึก ต้องการออกจากหน้านี้หรือไม่?");
  }

  function cancelEdit() {
    if (!confirmLeave()) return;
    navigate(`/app/products/${id}`);
  }

  function chooseImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    const validation = validateProductImageFile(file);
    if (validation) {
      setError(validation);
      event.target.value = "";
      return;
    }
    setError("");
    setSelectedImage(file);
    setRemoveImage(false);
    setIsDirty(true);
    setImagePreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return file ? URL.createObjectURL(file) : "";
    });
  }

  const fieldValues = useMemo(() => {
    if (!product.data) return {};
    return {
      name: product.data.name,
      sku: product.data.sku,
      barcode: barcodeInput,
      categoryName: product.data.category?.name ?? "",
      brandName: product.data.brand?.name ?? "",
      unit: product.data.unit,
      costPrice: costInput || String(product.data.costPrice),
      salePrice: saleInput || String(product.data.salePrice),
      minStock: String(product.data.minStock)
    } as Record<string, string>;
  }, [barcodeInput, costInput, product.data, saleInput]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const name = textValue(form, "name");
    const sku = textValue(form, "sku");
    const costPrice = numberValue(form, "costPrice");
    const salePrice = numberValue(form, "salePrice");
    const minStock = numberValue(form, "minStock");

    if (!name || !sku) {
      setError("กรุณากรอกชื่อสินค้าและ SKU");
      return;
    }
    if ([costPrice, salePrice, minStock].some((value) => !Number.isFinite(value) || value < 0)) {
      setError("ราคาและจุดแจ้งเตือนต้องเป็นตัวเลข 0 ขึ้นไป");
      return;
    }
    if (!Number.isInteger(minStock)) {
      setError("จุดแจ้งเตือนต้องเป็นจำนวนเต็ม");
      return;
    }

    mutation.mutate({
      name,
      sku,
      barcode: textValue(form, "barcode"),
      categoryName: textValue(form, "categoryName"),
      brandName: textValue(form, "brandName"),
      unit: textValue(form, "unit") ?? "ชิ้น",
      status: textValue(form, "status"),
      description: textValue(form, "description"),
      costPrice,
      salePrice,
      minStock
    });
  }

  if (product.isLoading) return <Card>กำลังโหลดสินค้า...</Card>;
  if (product.error) return <Card className="text-red-700">โหลดสินค้าไม่สำเร็จ: {product.error.message}</Card>;
  if (!product.data) return null;
  if (product.data.status === "ARCHIVED") return <Card className="text-red-700">สินค้าที่เก็บเข้าประวัติแล้วไม่สามารถแก้ไขข้อมูลหลักได้</Card>;
  const currentImageUrl = getProductImageUrl(product.data);
  const displayedImageUrl = imagePreview || (!removeImage ? currentImageUrl : "");
  const liveProfit = getProductProfitMetrics({ costPrice: costInput, salePrice: saleInput });
  const editStatusDefault = editableStatuses.some((item) => item.value === product.data.status) ? product.data.status : "PAUSED";

  return (
    <div className="space-y-5 pb-24">
      <BarcodeScanner
        open={isScannerOpen}
        title="สแกนบาร์โค้ดสินค้า"
        onDetected={(code) => {
          setBarcodeInput(code);
          setError("");
          setIsDirty(true);
        }}
        onClose={() => setIsScannerOpen(false)}
      />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button type="button" onClick={cancelEdit} className="inline-flex items-center gap-2 text-sm font-semibold text-stone-500 hover:text-ink">
            <ArrowLeft size={16} /> กลับไปหน้ารายละเอียด
          </button>
          <h1 className="mt-2 text-3xl font-black text-ink">แก้ไขสินค้า</h1>
          <p className="mt-1 max-w-2xl text-sm text-stone-600">แก้ไขข้อมูลหลักของสินค้า ราคา และค่าเริ่มต้นสำหรับแจ้งเตือน สต็อกจริงให้เปลี่ยนผ่านรายการรับเข้า ขายออก ปรับยอด หรือธุรกรรมคลังเท่านั้น</p>
        </div>
        <span className={`inline-flex rounded px-2 py-1 text-xs font-bold ${PRODUCT_STATUS_LABELS[product.data.status].className}`}>{PRODUCT_STATUS_LABELS[product.data.status].label}</span>
      </div>

      <form onSubmit={submit} onChange={() => setIsDirty(true)} className="space-y-5">
        <Card>
          <h2 className="text-lg font-black text-ink">ข้อมูลพื้นฐานสินค้า</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="block md:col-span-2">
              <span className="text-sm font-semibold text-ink">รูปสินค้า</span>
              <div className="mt-2 flex flex-wrap items-center gap-4 rounded-md border border-dashed border-stone-300 bg-stone-50 p-4">
                {displayedImageUrl ? (
                  <img src={displayedImageUrl} alt={product.data.name} className="h-32 w-32 rounded-md border border-stone-200 object-cover" />
                ) : (
                  <ProductImageFrame product={{ name: product.data.name, imagePath: null }} className="h-32 w-32" />
                )}
                <div className="space-y-2">
                  <input className="field max-w-sm bg-white" type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseImage} />
                  <p className="text-xs text-stone-500">รองรับ JPG, PNG, WebP ขนาดไม่เกิน 5MB</p>
                  {currentImageUrl || selectedImage ? (
                    <Button
                      type="button"
                      variant="ghost"
                      icon={<Trash2 size={16} />}
                      onClick={() => {
                        setSelectedImage(null);
                        setRemoveImage(true);
                        setIsDirty(true);
                        setImagePreview((current) => {
                          if (current) URL.revokeObjectURL(current);
                          return "";
                        });
                      }}
                    >
                      ลบรูป
                    </Button>
                  ) : null}
                </div>
              </div>
            </label>
            <Field name="name" label="ชื่อสินค้า *" value={fieldValues.name} required />
            <Field name="sku" label="SKU *" value={fieldValues.sku} required />
            <label className="block">
              <span className="text-sm font-semibold text-ink">Barcode</span>
              <div className="mt-1 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <input
                  className="field"
                  name="barcode"
                  value={barcodeInput}
                  onChange={(event) => setBarcodeInput(event.target.value)}
                  placeholder="สแกนหรือพิมพ์เลขบาร์โค้ด"
                />
                <Button type="button" variant="secondary" icon={<ScanLine size={16} />} onClick={() => setIsScannerOpen(true)}>
                  สแกน
                </Button>
              </div>
            </label>
            <Field name="categoryName" label="หมวดหมู่" value={fieldValues.categoryName} />
            <Field name="brandName" label="แบรนด์" value={fieldValues.brandName} />
            <Field name="unit" label="หน่วยนับ *" value={fieldValues.unit} required />
            <label className="block md:col-span-2">
              <span className="text-sm font-semibold text-ink">สถานะสินค้า</span>
              <Dropdown
                name="status"
                defaultValue={editStatusDefault}
                buttonClassName="mt-1"
                options={editableStatuses.map((item) => ({ value: item.value, label: item.label }))}
              />
              <p className="mt-1 text-xs text-stone-500">การเก็บเข้าประวัติให้ใช้เมนูเพิ่มเติมในหน้ารายละเอียด เพื่อให้ระบบตรวจสอบสต็อกคงเหลือก่อนเสมอ</p>
            </label>
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-black text-ink">ราคา</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <PriceField name="costPrice" label="ต้นทุนมาตรฐาน *" value={costInput} onChange={setCostInput} />
            <PriceField name="salePrice" label="ราคาขาย *" value={saleInput} onChange={setSaleInput} />
            <div className="rounded-md bg-stone-50 p-4">
              <p className="text-xs font-bold uppercase text-stone-500">กำไรต่อชิ้น</p>
              <p className="mt-1 text-2xl font-black text-ink">{formatMaybeBaht(liveProfit.profit)}</p>
            </div>
            <div className="rounded-md bg-stone-50 p-4">
              <p className="text-xs font-bold uppercase text-stone-500">Margin</p>
              <p className="mt-1 text-2xl font-black text-ink">{formatMaybePercent(liveProfit.marginPercent)}</p>
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-black text-ink">ตั้งค่าสต็อก</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field name="minStock" label="จุดแจ้งเตือนสต็อกต่ำ *" value={fieldValues.minStock} type="number" step="1" required />
            <div className="rounded-md bg-stone-50 p-4 text-sm text-stone-600">
              <p className="font-semibold text-ink">สต็อกจริงไม่ได้แก้จากหน้านี้</p>
              <p className="mt-1">ระบบจะใช้จุดแจ้งเตือนนี้กับยอดคงเหลือรวม สต็อกจริงต้องผ่านรายการรับเข้า ขายออก ปรับยอด หรือโอนย้าย</p>
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-black text-ink">ข้อมูลเพิ่มเติม</h2>
          <label className="mt-4 block">
            <span className="text-sm font-semibold text-ink">รายละเอียดสินค้า / หมายเหตุ</span>
            <textarea className="field mt-1 min-h-28" name="description" defaultValue={product.data.description ?? ""} />
          </label>
        </Card>

        {error ? <p className="flex items-center gap-2 rounded-md bg-red-50 p-3 text-sm text-red-700"><AlertCircle size={16} />{error}</p> : null}

        <div className="flex flex-wrap gap-3">
          <Button disabled={mutation.isPending} icon={<Save size={18} />}>{mutation.isPending ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}</Button>
          <Button type="button" variant="secondary" onClick={cancelEdit}>ยกเลิก</Button>
        </div>

        {isDirty ? (
          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
            <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-ink">มีการแก้ไขที่ยังไม่ได้บันทึก</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={cancelEdit}>ยกเลิก</Button>
                <Button disabled={mutation.isPending} icon={<Save size={18} />}>{mutation.isPending ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}</Button>
              </div>
            </div>
          </div>
        ) : null}
      </form>
    </div>
  );
}

function Field({ name, label, value, type = "text", step, required = false }: { name: string; label: string; value?: string; type?: string; step?: string; required?: boolean }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-ink">{label}</span>
      <input className="field mt-1" name={name} type={type} min={type === "number" ? 0 : undefined} step={step} defaultValue={value ?? ""} required={required} />
    </label>
  );
}

function PriceField({ name, label, value, onChange }: { name: string; label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-ink">{label}</span>
      <div className="mt-1 flex rounded-md border border-stone-300 bg-white focus-within:border-leaf focus-within:shadow-[0_0_0_3px_rgba(15,118,110,0.14)]">
        <span className="grid w-11 place-items-center border-r border-stone-200 text-sm font-bold text-stone-500">฿</span>
        <input
          className="w-full rounded-md border-0 bg-transparent px-3 py-2.5 outline-none"
          name={name}
          type="number"
          min={0}
          step="0.01"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required
        />
      </div>
    </label>
  );
}
