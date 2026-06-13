import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Archive,
  Ban,
  Boxes,
  Eye,
  Image as ImageIcon,
  Package,
  PackageCheck,
  PackageMinus,
  PackageX,
  PauseCircle,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  SlidersHorizontal,
  ClipboardList
} from "lucide-react";
import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { api, patch, post, uploadProductImage } from "../lib/api";
import { baht, number } from "../lib/format";
import { countsTowardProductLimit, getProductImageUrl, getProductSummary, getStockBadge, getStockState, PRODUCT_STATUS_LABELS, stockOf, validateProductImageFile, type ProductForSummary, type ProductStatus, type StockState } from "../lib/products";

type ProductFilter = "MANAGED" | ProductStatus;
type StockFilter = "ALL" | StockState;

type Product = ProductForSummary & {
  description?: string;
};

type Business = {
  subscription?: { plan: { name: string; productLimit: number } };
};

const statusFilters: Array<{ value: ProductFilter; label: string }> = [
  { value: "MANAGED", label: "ใช้งานอยู่" },
  { value: "ACTIVE", label: "เปิดขาย" },
  { value: "PAUSED", label: "หยุดขาย" },
  { value: "DISCONTINUED", label: "ปิดขาย" },
  { value: "ARCHIVED", label: "เก็บประวัติ" }
];

const stockFilters: Array<{ value: StockFilter; label: string }> = [
  { value: "ALL", label: "ทั้งหมด" },
  { value: "OK", label: "ปกติ" },
  { value: "LOW", label: "ใกล้หมด" },
  { value: "OUT", label: "หมดสต็อก" }
];

const formFields = [
  { name: "name", label: "ชื่อสินค้า", type: "text", placeholder: "เช่น น้ำดื่ม 600ml", required: true },
  { name: "sku", label: "SKU", type: "text", placeholder: "เช่น DRINK-001", required: true },
  { name: "barcode", label: "Barcode", type: "text", placeholder: "สแกนหรือพิมพ์เลขบาร์โค้ด" },
  { name: "categoryName", label: "หมวดหมู่", type: "text", placeholder: "เช่น เครื่องดื่ม" },
  { name: "brandName", label: "แบรนด์", type: "text", placeholder: "เช่น Zentory" },
  { name: "unit", label: "หน่วยนับ", type: "text", placeholder: "ชิ้น", defaultValue: "ชิ้น" },
  { name: "costPrice", label: "ราคาทุน", type: "number", placeholder: "0.00", step: "0.01", required: true },
  { name: "salePrice", label: "ราคาขาย", type: "number", placeholder: "0.00", step: "0.01", required: true },
  { name: "minStock", label: "จุดแจ้งเตือน", type: "number", placeholder: "0", defaultValue: "0", step: "1", required: true },
  { name: "initialStock", label: "สต็อกเริ่มต้น", type: "number", placeholder: "0", defaultValue: "0", step: "1" }
] as const;

function textValue(form: FormData, name: string) {
  const value = String(form.get(name) ?? "").trim();
  return value || undefined;
}

function numberValue(form: FormData, name: string) {
  const value = Number(form.get(name));
  return Number.isFinite(value) ? value : NaN;
}

function ProductImageThumb({ product, className = "h-14 w-14" }: { product: Pick<ProductForSummary, "imagePath" | "name">; className?: string }) {
  const imageUrl = getProductImageUrl(product);
  if (imageUrl) {
    return <img src={imageUrl} alt={product.name} className={`${className} rounded-md border border-stone-200 object-cover`} />;
  }
  return (
    <span className={`${className} grid place-items-center rounded-md border border-dashed border-stone-300 bg-stone-50 text-stone-400`}>
      <ImageIcon size={22} />
    </span>
  );
}

export function ProductsPage() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<ProductFilter>("MANAGED");
  const [stockFilter, setStockFilter] = useState<StockFilter>("ALL");
  const [message, setMessage] = useState("");
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const business = useQuery({ queryKey: ["business"], queryFn: () => api<Business>("/businesses/current") });
  const allProducts = useQuery({ queryKey: ["products", "managed-summary"], queryFn: () => api<Product[]>("/products") });
  const query = useQuery({
    queryKey: ["products", "list", q, filter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (filter !== "MANAGED") params.set("status", filter);
      const qs = params.toString();
      return api<Product[]>(`/products${qs ? `?${qs}` : ""}`);
    }
  });
  const statusMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "pause" | "discontinue" | "archive" | "reactivate" }) => patch(`/products/${id}/${action}`, {}),
    onSuccess: () => {
      setMessage("อัปเดตสถานะสินค้าแล้ว");
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["stock-report"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error) => setMessage(error.message)
  });

  const summary = useMemo(() => getProductSummary(allProducts.data ?? []), [allProducts.data]);
  const productLimit = business.data?.subscription?.plan.productLimit;
  const usedProductCount = allProducts.data?.filter(countsTowardProductLimit).length ?? 0;
  const list = useMemo(() => {
    const products = query.data ?? [];
    if (stockFilter === "ALL") return products;
    return products.filter((product) => getStockState(product) === stockFilter);
  }, [query.data, stockFilter]);
  const hasFilters = q.trim() !== "" || filter !== "MANAGED" || stockFilter !== "ALL";
  const hasProducts = (allProducts.data?.length ?? 0) > 0;

  function clearFilters() {
    setQ("");
    setFilter("MANAGED");
    setStockFilter("ALL");
  }

  function openProduct(product: Product) {
    if (!product.id) return;
    navigate(`/app/products/${product.id}`);
  }

  function changeStatus(product: Product, action: "pause" | "discontinue" | "archive" | "reactivate") {
    const stock = stockOf(product);
    const prompts = {
      pause: `หยุดขายชั่วคราว "${product.name}" ใช่ไหม? สินค้าจะไม่แสดงใน POS แต่ยังจัดการสต็อกได้`,
      discontinue:
        stock > 0
          ? `ปิดขายถาวร "${product.name}" ใช่ไหม? ยังมีสต็อกเหลือ ${number(stock)} ${product.unit} และสินค้ายังนับในแพ็กเกจจนกว่าจะเคลียร์สต็อก`
          : `ปิดขายถาวร "${product.name}" ใช่ไหม? สินค้านี้ไม่มีสต็อกแล้ว และสามารถเก็บเข้าประวัติได้ภายหลัง`,
      archive: `เก็บ "${product.name}" เข้าประวัติใช่ไหม? ต้องไม่มีสต็อกคงเหลือก่อนเก็บ`,
      reactivate: product.status === "ARCHIVED" ? `กู้คืน "${product.name}" กลับมาเป็นสถานะหยุดขายใช่ไหม?` : `เปิดขาย "${product.name}" อีกครั้งใช่ไหม?`
    };
    if (!window.confirm(prompts[action])) return;
    statusMutation.mutate({ id: product.id, action });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black text-ink">สินค้า</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-stone-600">จัดการข้อมูลสินค้า SKU บาร์โค้ด ราคา สถานะ และจุดแจ้งเตือนสต็อก</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/app/inventory/receipts">
            <Button variant="secondary" icon={<Boxes size={18} />}>รับสินค้าเข้า</Button>
          </Link>
          <Link to="/app/inventory/adjustments">
            <Button variant="secondary" icon={<SlidersHorizontal size={18} />}>ปรับสต็อก</Button>
          </Link>
          <Link to="/app/inventory/movements">
            <Button variant="secondary" icon={<ClipboardList size={18} />}>ดูประวัติสต็อก</Button>
          </Link>
          <Link to="/app/products/new">
            <Button icon={<Plus size={18} />}>เพิ่มสินค้า</Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard icon={<PackageCheck size={19} />} label="สินค้าที่จัดการ" value={`${number(summary.totalManaged)} รายการ`} />
        <MetricCard icon={<Package size={19} />} label="เปิดขาย" value={`${number(summary.active)} รายการ`} />
        <MetricCard icon={<PackageMinus size={19} />} label="ใกล้หมด" value={`${number(summary.lowStock)} รายการ`} tone="warning" />
        <MetricCard icon={<PackageX size={19} />} label="หมดสต็อก" value={`${number(summary.outOfStock)} รายการ`} tone="danger" />
      </div>

      <Card className="bg-stone-50">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-bold text-ink">มูลค่าสต็อกโดยประมาณ {baht(summary.stockValue)}</p>
            <p className="mt-1 text-sm text-stone-600">คำนวณจากราคาทุนของสินค้าที่คงเหลือ</p>
            {productLimit !== undefined ? (
              <p className="mt-1 text-sm text-stone-600">ใช้สินค้าในแพ็กเกจแล้ว {number(usedProductCount)} / {number(productLimit)} รายการ</p>
            ) : (
              <p className="mt-1 text-sm text-stone-600">นับจากสินค้าที่ใช้งานอยู่ ไม่รวมรายการที่เก็บประวัติแล้ว</p>
            )}
          </div>
          <Link to="/app/settings">
            <Button type="button" variant="secondary">ดูแพ็กเกจ</Button>
          </Link>
        </div>
      </Card>

      <Card className="space-y-3">
        <div className="grid gap-3 lg:grid-cols-[minmax(280px,1fr)_auto]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
            <input
              className="field field-with-left-icon"
              placeholder="ค้นหาชื่อสินค้า SKU บาร์โค้ด หมวดหมู่ หรือแบรนด์"
              value={q}
              onChange={(event) => setQ(event.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {statusFilters.map((item) => (
              <Button key={item.value} type="button" variant={filter === item.value ? "primary" : "secondary"} onClick={() => setFilter(item.value)}>
                {item.label}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-stone-500">สถานะสต็อก</span>
          {stockFilters.map((item) => (
            <Button key={item.value} type="button" variant={stockFilter === item.value ? "primary" : "secondary"} onClick={() => setStockFilter(item.value)}>
              {item.label}
            </Button>
          ))}
          {hasFilters ? <Button type="button" variant="ghost" onClick={clearFilters}>ล้างตัวกรอง</Button> : null}
        </div>
        {message ? <p className="rounded-md bg-teal-50 p-3 text-sm font-semibold text-leaf">{message}</p> : null}
      </Card>

      {query.isLoading ? <Card>กำลังโหลดสินค้า...</Card> : null}
      {query.error ? <Card className="text-red-700">โหลดสินค้าไม่สำเร็จ: {query.error.message}</Card> : null}

      {!query.isLoading && !query.error && list.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white shadow-sm">
          <table className="w-full min-w-[1040px] text-left text-sm">
            <thead className="bg-stone-50 text-stone-500">
              <tr>
                <th className="p-3">สินค้า</th>
                <th className="p-3">SKU / Barcode</th>
                <th className="p-3">คงเหลือ</th>
                <th className="p-3">สถานะ</th>
                <th className="p-3">ราคาทุน</th>
                <th className="p-3">ราคาขาย</th>
                <th className="p-3">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {list.map((product) => {
                const stock = stockOf(product);
                const stockBadge = getStockBadge(product);
                const lifecycle = PRODUCT_STATUS_LABELS[product.status];
                return (
                  <tr
                    key={product.id}
                    className="cursor-pointer border-t border-stone-100 align-top hover:bg-stone-50"
                    role={product.id ? "link" : undefined}
                    tabIndex={product.id ? 0 : undefined}
                    onClick={() => openProduct(product)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openProduct(product);
                      }
                    }}
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        <ProductImageThumb product={product} />
                        <div className="min-w-0">
                          <p className="font-bold text-ink">{product.name}</p>
                          <p className="mt-1 text-xs text-stone-500">{product.category?.name ?? "ไม่จัดหมวด"} / {product.brand?.name ?? "ไม่มีแบรนด์"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-3">
                      <p className="font-semibold">{product.sku}</p>
                      <p className="mt-1 text-xs text-stone-500">{product.barcode ?? "ไม่มีบาร์โค้ด"}</p>
                    </td>
                    <td className="p-3">
                      <p className="font-semibold">คงเหลือ {number(stock)} {product.unit}</p>
                      <p className="mt-1 text-xs text-stone-500">จุดแจ้งเตือน {number(product.minStock)}</p>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1.5">
                        <span className={`rounded px-2 py-1 text-xs font-bold ${lifecycle.className}`}>{lifecycle.label}</span>
                        <span className={`rounded px-2 py-1 text-xs font-bold ${stockBadge.className}`}>{stockBadge.label}</span>
                      </div>
                    </td>
                    <td className="p-3">{baht(product.costPrice)}</td>
                    <td className="p-3 font-semibold">{baht(product.salePrice)}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
                        <Link to={`/app/products/${product.id}`}><Button variant="ghost" icon={<Eye size={16} />}>ดู</Button></Link>
                        {product.status !== "ARCHIVED" ? <Link to={`/app/products/${product.id}/edit`}><Button variant="ghost" icon={<Pencil size={16} />}>แก้ไข</Button></Link> : null}
                        {product.status === "ACTIVE" ? <Button variant="ghost" icon={<PauseCircle size={16} />} disabled={statusMutation.isPending} onClick={() => changeStatus(product, "pause")}>หยุดขายชั่วคราว</Button> : null}
                        {product.status === "ACTIVE" || product.status === "PAUSED" ? <Button variant="ghost" icon={<Ban size={16} />} disabled={statusMutation.isPending} onClick={() => changeStatus(product, "discontinue")}>ปิดขายถาวร</Button> : null}
                        {product.status === "PAUSED" || product.status === "DISCONTINUED" ? <Button variant="ghost" icon={<RotateCcw size={16} />} disabled={statusMutation.isPending} onClick={() => changeStatus(product, "reactivate")}>เปิดขาย</Button> : null}
                        {product.status === "ARCHIVED" ? <Button variant="ghost" icon={<RotateCcw size={16} />} disabled={statusMutation.isPending} onClick={() => changeStatus(product, "reactivate")}>กู้คืน</Button> : null}
                        {product.status === "DISCONTINUED" ? <Button variant="ghost" icon={<Archive size={16} />} disabled={statusMutation.isPending} onClick={() => changeStatus(product, "archive")}>เก็บประวัติ</Button> : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {!query.isLoading && !query.error && list.length === 0 ? (
        <Card className="text-center">
          <PackageX className="mx-auto text-stone-400" size={36} />
          <p className="mt-3 font-bold text-ink">{hasProducts ? "ไม่พบสินค้าที่ตรงกับเงื่อนไข" : "ยังไม่มีสินค้า"}</p>
          <p className="mt-1 text-sm text-stone-500">{hasProducts ? "ลองล้างตัวกรองหรือเปลี่ยนคำค้นหา" : "เริ่มต้นด้วยการเพิ่มสินค้าชิ้นแรกของร้าน"}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {hasProducts && hasFilters ? <Button type="button" variant="secondary" onClick={clearFilters}>ล้างตัวกรอง</Button> : null}
            <Link to="/app/products/new" className="inline-flex">
              <Button icon={<Plus size={18} />}>เพิ่มสินค้าใหม่</Button>
            </Link>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function MetricCard({ icon, label, value, tone = "default" }: { icon: ReactNode; label: string; value: string; tone?: "default" | "warning" | "danger" }) {
  const toneClass = tone === "danger" ? "bg-red-50 text-red-700" : tone === "warning" ? "bg-amber-50 text-amber-700" : "bg-teal-50 text-leaf";
  return (
    <Card className="flex items-center gap-3">
      <span className={`grid h-10 w-10 place-items-center rounded-md ${toneClass}`}>{icon}</span>
      <span>
        <span className="block text-sm font-semibold text-stone-500">{label}</span>
        <span className="block text-xl font-black text-ink">{value}</span>
      </span>
    </Card>
  );
}

export function ProductFormPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");

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
    setImagePreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return file ? URL.createObjectURL(file) : "";
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const name = textValue(form, "name");
    const sku = textValue(form, "sku");
    const costPrice = numberValue(form, "costPrice");
    const salePrice = numberValue(form, "salePrice");
    const minStock = numberValue(form, "minStock");
    const initialStock = numberValue(form, "initialStock");

    if (!name || !sku) {
      setError("กรุณากรอกชื่อสินค้าและ SKU");
      return;
    }
    if ([costPrice, salePrice, minStock, initialStock].some((value) => !Number.isFinite(value) || value < 0)) {
      setError("ราคา จุดแจ้งเตือน และสต็อกเริ่มต้นต้องเป็นตัวเลข 0 ขึ้นไป");
      return;
    }
    if (!Number.isInteger(minStock) || !Number.isInteger(initialStock)) {
      setError("จุดแจ้งเตือนและสต็อกเริ่มต้นต้องเป็นจำนวนเต็ม");
      return;
    }

    try {
      setIsSubmitting(true);
      const product = await post<Product>("/products", {
        name,
        sku,
        barcode: textValue(form, "barcode"),
        categoryName: textValue(form, "categoryName"),
        brandName: textValue(form, "brandName"),
        unit: textValue(form, "unit") ?? "ชิ้น",
        description: textValue(form, "description"),
        costPrice,
        salePrice,
        minStock,
        initialStock
      });
      if (selectedImage) {
        await uploadProductImage<Product>(product.id, selectedImage);
      }
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["stock-report"] });
      navigate(`/app/products/${product.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกสินค้าไม่สำเร็จ");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black text-ink">เพิ่มสินค้าใหม่</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-stone-600">บันทึกข้อมูลขายและสต็อกเริ่มต้นในครั้งเดียว ระบบจะสร้างประวัติรับเข้าให้อัตโนมัติเมื่อมีสต็อกเริ่มต้น</p>
        </div>
        <Button type="button" variant="secondary" onClick={() => navigate("/app/products")}>กลับหน้าสินค้า</Button>
      </div>

      <form onSubmit={submit} className="mt-6 grid gap-4 md:grid-cols-2">
        <label className="block md:col-span-2">
          <span className="text-sm font-semibold text-ink">รูปหลักสินค้า</span>
          <div className="mt-2 flex flex-wrap items-center gap-4 rounded-md border border-dashed border-stone-300 bg-stone-50 p-4">
            {imagePreview ? (
              <img src={imagePreview} alt="ตัวอย่างรูปสินค้า" className="h-28 w-28 rounded-md border border-stone-200 object-cover" />
            ) : (
              <ProductImageThumb product={{ name: "สินค้า", imagePath: null }} className="h-28 w-28" />
            )}
            <div className="space-y-2">
              <input className="field max-w-sm bg-white" type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseImage} />
              <p className="text-xs text-stone-500">รองรับ JPG, PNG, WebP ขนาดไม่เกิน 5MB</p>
            </div>
          </div>
        </label>
        {formFields.map((field) => (
          <label key={field.name} className="block">
            <span className="text-sm font-semibold text-ink">{field.label}</span>
            <input
              className="field mt-1"
              name={field.name}
              type={field.type}
              min={field.type === "number" ? 0 : undefined}
              step={"step" in field ? field.step : undefined}
              required={"required" in field ? field.required : false}
              placeholder={field.placeholder}
              defaultValue={"defaultValue" in field ? field.defaultValue : ""}
            />
          </label>
        ))}
        <label className="block md:col-span-2">
          <span className="text-sm font-semibold text-ink">รายละเอียดสินค้า / หมายเหตุ</span>
          <textarea className="field mt-1 min-h-28" name="description" placeholder="เช่น สี รุ่น เงื่อนไขการขาย หรือหมายเหตุของล็อตนี้" />
        </label>
        {error ? <p className="flex items-center gap-2 rounded-md bg-red-50 p-3 text-sm text-red-700 md:col-span-2"><AlertCircle size={16} />{error}</p> : null}
        <div className="flex flex-wrap gap-3 md:col-span-2">
          <Button disabled={isSubmitting} icon={<Save size={18} />}>{isSubmitting ? "กำลังบันทึก..." : "บันทึกสินค้า"}</Button>
          <Button type="button" variant="secondary" onClick={() => navigate("/app/products")}>ยกเลิก</Button>
        </div>
      </form>
    </Card>
  );
}
