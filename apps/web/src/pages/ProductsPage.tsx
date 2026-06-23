import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Archive,
  Ban,
  Boxes,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  ClipboardList,
  Eye,
  FileSpreadsheet,
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
  ScanLine,
  Search,
  SlidersHorizontal,
  Tags,
  X
} from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { BarcodeScanner } from "../components/BarcodeScanner";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Dropdown } from "../components/Dropdown";
import { api, patch, post, uploadProductImage } from "../lib/api";
import { branchScopedPath } from "../lib/branch-scope";
import { baht, number } from "../lib/format";
import { canManageProductMaster, hasSessionPermission } from "../lib/permissions";
import { getBalanceWarehouseName, getProductDisplayName, getProductImageUrl, getProductStockLocationSummary, getProductSummary, getStockBadge, PRODUCT_STATUS_LABELS, stockInWarehouse, stockOf, validateProductImageFile, type ProductForSummary, type ProductStatus, type StockState } from "../lib/products";
import { useAuth } from "../state/auth";
import { useWorkingBranch } from "../state/working-branch";

type ProductFilter = "MANAGED" | ProductStatus;
type StockFilter = "ALL" | StockState;
type CategoryFilter = "ALL" | "UNCATEGORIZED" | string;
type WarehouseFilter = "ALL" | string;
type ProductSort = "DEFAULT" | "STOCK_ASC" | "STOCK_DESC" | "SALE_PRICE_ASC" | "SALE_PRICE_DESC" | "LOW_STOCK_FIRST";

type Product = ProductForSummary & {
  description?: string;
};

type ProductCreatePayload = {
  name: string;
  sku: string;
  barcode?: string;
  branchId?: string;
  initialStock?: number;
  categoryName?: string;
  brandName?: string;
  warehouseId: string;
  unit: string;
  description?: string;
  costPrice: number;
  salePrice: number;
  minStock: number;
  receiveNow?: {
    warehouseId: string;
    quantity: number;
    unitCost: number;
    supplier?: string;
    note?: string;
  };
};

type ProductCreateSummary = ProductCreatePayload & {
  warehouseName: string;
  warehouseBranchName?: string;
  imageName?: string;
};

type ProductVariantDraftRow = {
  id: string;
  color: string;
  size: string;
  sku: string;
  barcode: string;
  costPrice: number;
  salePrice: number;
  minStock: number;
  receiveQuantity: number;
  receiveUnitCost: number;
};

type ProductVariantsCreatePayload = {
  name: string;
  skuPrefix: string;
  branchId?: string;
  warehouseId: string;
  colors: string[];
  sizes: string[];
  categoryName?: string;
  brandName?: string;
  unit: string;
  description?: string;
  costPrice: number;
  salePrice: number;
  minStock: number;
  receiveSupplier?: string;
  receiveNote?: string;
  variants: Array<Omit<ProductVariantDraftRow, "id" | "barcode" | "color" | "size"> & { color?: string; size?: string; barcode?: string }>;
};

type ProductVariantsCreateSummary = ProductVariantsCreatePayload & {
  warehouseName: string;
  warehouseBranchName?: string;
  imageName?: string;
};

type ProductVariantGroupResponse = {
  id: string;
  name: string;
  products: Product[];
};

type ProductImportRow = ProductCreatePayload & {
  rowNumber: number;
};

type ProductImportIssue = {
  rowNumber: number;
  message: string;
};

type ProductImportPreview = {
  fileName: string;
  warehouseName: string;
  rows: ProductImportRow[];
  issues: ProductImportIssue[];
};

type Category = {
  id: string;
  name: string;
  _count?: { products: number };
};

type Warehouse = {
  id: string;
  branchId?: string;
  name: string;
  code?: string;
  isDefault?: boolean;
  status?: "ACTIVE" | "INACTIVE";
  branch?: { name: string };
};

const statusFilters: Array<{ value: ProductFilter; label: string }> = [
  { value: "MANAGED", label: "ใช้งานทั้งหมด" },
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

const sortOptions: Array<{ value: ProductSort; label: string }> = [
  { value: "DEFAULT", label: "ล่าสุด" },
  { value: "LOW_STOCK_FIRST", label: "สินค้าใกล้หมดก่อน" },
  { value: "STOCK_ASC", label: "คงเหลือน้อยไปมาก" },
  { value: "STOCK_DESC", label: "คงเหลือมากไปน้อย" },
  { value: "SALE_PRICE_ASC", label: "ราคาขายต่ำไปสูง" },
  { value: "SALE_PRICE_DESC", label: "ราคาขายสูงไปต่ำ" }
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
  { name: "minStock", label: "จุดแจ้งเตือน", type: "number", placeholder: "0", defaultValue: "0", step: "1", required: true }
] as const;

const identityFieldNames = ["name", "sku", "barcode", "categoryName", "brandName", "unit"] as const;
const pricingFieldNames = ["costPrice", "salePrice", "minStock"] as const;
const fieldByName = new Map(formFields.map((field) => [field.name, field]));

function downloadProductTemplate() {
  const rows = [
    ["name", "sku", "barcode", "unit", "categoryName", "brandName", "costPrice", "salePrice", "minStock", "initialStock"],
    ["น้ำดื่ม 600ml", "DRINK-001", "885000000001", "ชิ้น", "เครื่องดื่ม", "Demo", "5", "10", "12", "48"]
  ];
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "zentory-product-template.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const source = text.replace(/^\uFEFF/, "");

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (char === "\"") {
      if (inQuotes && next === "\"") {
        cell += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      row.push(cell.trim());
      cell = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }

  row.push(cell.trim());
  if (row.some((value) => value !== "")) rows.push(row);
  return rows;
}

function parseOptionalText(value: string | undefined) {
  const text = String(value ?? "").trim();
  return text || undefined;
}

function parseImportNumber(value: string | undefined, fallback = 0) {
  const text = String(value ?? "").trim();
  if (!text) return fallback;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function textValue(form: FormData, name: string) {
  const value = String(form.get(name) ?? "").trim();
  return value || undefined;
}

function numberValue(form: FormData, name: string) {
  const value = Number(form.get(name));
  return Number.isFinite(value) ? value : NaN;
}

function parseVariantValues(value: string) {
  const seen = new Set<string>();
  return value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function skuPart(value: string) {
  return value.trim().replace(/\s+/g, "-").replace(/[\\/]+/g, "-").replace(/-+/g, "-").toUpperCase();
}

function variantDraftKey(color: string, size: string) {
  return `${color.trim().toLowerCase()}\u0000${size.trim().toLowerCase()}`;
}

function variantDimensionOptions(values: string[]) {
  return values.length > 0 ? values : [""];
}

function buildVariantDraftRows(options: {
  colors: string[];
  sizes: string[];
  skuPrefix: string;
  costPrice: number;
  salePrice: number;
  minStock: number;
  previousRows: ProductVariantDraftRow[];
}) {
  const previousByKey = new Map(options.previousRows.map((row) => [variantDraftKey(row.color, row.size), row]));
  return variantDimensionOptions(options.colors).flatMap((color) => variantDimensionOptions(options.sizes).map((size) => {
    const previous = previousByKey.get(variantDraftKey(color, size));
    return previous ?? {
      id: crypto.randomUUID(),
      color,
      size,
      sku: [options.skuPrefix, color, size].map(skuPart).filter(Boolean).join("-"),
      barcode: "",
      costPrice: options.costPrice,
      salePrice: options.salePrice,
      minStock: options.minStock,
      receiveQuantity: 0,
      receiveUnitCost: options.costPrice
    };
  }));
}

function getSafeReturnTo(value: string | null) {
  if (!value || !value.startsWith("/app/") || value.startsWith("//")) return "";
  return value;
}

function addProductIdToPath(path: string, productId: string) {
  const [pathname, search = ""] = path.split("?");
  const params = new URLSearchParams(search);
  params.set("productId", productId);
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

function productWarehouseStock(product: Product, warehouseId: WarehouseFilter) {
  return warehouseId === "ALL" ? stockOf(product) : stockInWarehouse(product, warehouseId);
}

function productStockState(product: Product, warehouseId: WarehouseFilter): StockState {
  const stock = productWarehouseStock(product, warehouseId);
  if (stock <= 0) return "OUT";
  if (stock <= product.minStock) return "LOW";
  return "OK";
}

function lowStockPriority(product: Product, warehouseId: WarehouseFilter) {
  const stock = productWarehouseStock(product, warehouseId);
  if (stock <= 0) return -1_000_000 + stock;
  return stock - product.minStock;
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
  const importInputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<ProductFilter>("MANAGED");
  const [stockFilter, setStockFilter] = useState<StockFilter>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("ALL");
  const [warehouseFilter, setWarehouseFilter] = useState<WarehouseFilter>("ALL");
  const [sort, setSort] = useState<ProductSort>("DEFAULT");
  const [expandedStockProductIds, setExpandedStockProductIds] = useState<Set<string>>(() => new Set());
  const [message, setMessage] = useState("");
  const [productImportPreview, setProductImportPreview] = useState<ProductImportPreview | null>(null);
  const [isImportingProducts, setIsImportingProducts] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const session = useAuth((state) => state.session);
  const workingBranchId = useWorkingBranch((state) => state.workingBranchId);
  const canCreateProducts = canManageProductMaster(session);
  const canViewProducts = hasSessionPermission(session, "products.read");
  const canEditProducts = hasSessionPermission(session, "products.update");
  const categories = useQuery({
    queryKey: ["categories", workingBranchId],
    queryFn: () => api<Category[]>(branchScopedPath("/categories", workingBranchId)),
    enabled: canViewProducts
  });
  const warehouses = useQuery({ queryKey: ["warehouses", workingBranchId], queryFn: () => api<Warehouse[]>(branchScopedPath("/warehouses", workingBranchId)) });
  const allProducts = useQuery({ queryKey: ["products", "managed-summary", workingBranchId], queryFn: () => api<Product[]>(branchScopedPath("/products", workingBranchId)) });
  const query = useQuery({
    queryKey: ["products", "list", q, filter, workingBranchId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (filter !== "MANAGED") params.set("status", filter);
      const qs = params.toString();
      return api<Product[]>(branchScopedPath(`/products${qs ? `?${qs}` : ""}`, workingBranchId));
    }
  });
  const statusMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "pause" | "discontinue" | "archive" | "reactivate" }) => {
      const path = action === "archive" ? `/products/${id}/${action}` : branchScopedPath(`/products/${id}/${action}`, workingBranchId);
      return patch(path, {});
    },
    onSuccess: () => {
      setMessage("อัปเดตสถานะสินค้าแล้ว");
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["stock-report"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error) => setMessage(error.message)
  });

  const summary = useMemo(() => getProductSummary(allProducts.data ?? []), [allProducts.data]);
  const list = useMemo(() => {
    const products = query.data ?? [];
    const filtered = products.filter((product) => {
      const matchesStock = stockFilter === "ALL" || productStockState(product, warehouseFilter) === stockFilter;
      const matchesCategory =
        categoryFilter === "ALL" ||
        (categoryFilter === "UNCATEGORIZED" ? !product.category?.name : product.category?.name === categoryFilter);
      const matchesWarehouse = warehouseFilter === "ALL" || stockInWarehouse(product, warehouseFilter) > 0;
      return matchesStock && matchesCategory && matchesWarehouse;
    });
    if (sort === "DEFAULT") return filtered;
    return [...filtered].sort((left, right) => {
      if (sort === "STOCK_ASC") return productWarehouseStock(left, warehouseFilter) - productWarehouseStock(right, warehouseFilter);
      if (sort === "STOCK_DESC") return productWarehouseStock(right, warehouseFilter) - productWarehouseStock(left, warehouseFilter);
      if (sort === "SALE_PRICE_ASC") return Number(left.salePrice) - Number(right.salePrice);
      if (sort === "SALE_PRICE_DESC") return Number(right.salePrice) - Number(left.salePrice);
      const priority = lowStockPriority(left, warehouseFilter) - lowStockPriority(right, warehouseFilter);
      return priority || productWarehouseStock(left, warehouseFilter) - productWarehouseStock(right, warehouseFilter);
    });
  }, [categoryFilter, query.data, sort, stockFilter, warehouseFilter]);
  const categoryOptions = useMemo(() => {
    const productCategories = new Set((allProducts.data ?? []).map((product) => product.category?.name).filter(Boolean) as string[]);
    const rows = (categories.data ?? [])
      .filter((category) => productCategories.has(category.name))
      .map((category) => ({ value: category.name, label: category.name }));
    const hasUncategorized = (allProducts.data ?? []).some((product) => !product.category?.name);
    return [
      { value: "ALL", label: "ทุกหมวดหมู่" },
      ...rows,
      ...(hasUncategorized ? [{ value: "UNCATEGORIZED", label: "ไม่จัดหมวด" }] : [])
    ];
  }, [allProducts.data, categories.data]);
  const activeImportWarehouses = useMemo(() => {
    return (warehouses.data ?? [])
      .filter((warehouse) => warehouse.status !== "INACTIVE")
      .filter((warehouse) => !workingBranchId || !warehouse.branchId || warehouse.branchId === workingBranchId)
      .sort((left, right) => Number(Boolean(right.isDefault)) - Number(Boolean(left.isDefault)));
  }, [warehouses.data, workingBranchId]);
  const importWarehouse = activeImportWarehouses[0];
  const warehouseOptions = useMemo(() => {
    const rows = (warehouses.data ?? [])
      .filter((warehouse) => warehouse.status !== "INACTIVE")
      .map((warehouse) => ({
        value: warehouse.id,
        label: warehouse.branch?.name ? `${warehouse.name} / ${warehouse.branch.name}` : warehouse.name
      }));
    return [{ value: "ALL", label: "ทุกคลัง" }, ...rows];
  }, [warehouses.data]);
  const hasFilters = q.trim() !== "" || filter !== "MANAGED" || stockFilter !== "ALL" || categoryFilter !== "ALL" || warehouseFilter !== "ALL" || sort !== "DEFAULT";
  const activeFilterLabels = useMemo(() => {
    const labels: string[] = [];
    const query = q.trim();
    if (query) labels.push(`คำค้น: ${query}`);
    if (filter !== "MANAGED") labels.push(statusFilters.find((item) => item.value === filter)?.label ?? filter);
    if (stockFilter !== "ALL") labels.push(stockFilters.find((item) => item.value === stockFilter)?.label ?? stockFilter);
    if (categoryFilter !== "ALL") labels.push(categoryOptions.find((item) => item.value === categoryFilter)?.label ?? categoryFilter);
    if (warehouseFilter !== "ALL") labels.push(warehouseOptions.find((item) => item.value === warehouseFilter)?.label ?? warehouseFilter);
    if (sort !== "DEFAULT") labels.push(sortOptions.find((item) => item.value === sort)?.label ?? sort);
    return labels;
  }, [categoryFilter, categoryOptions, filter, q, sort, stockFilter, warehouseFilter, warehouseOptions]);
  const hasProducts = (allProducts.data?.length ?? 0) > 0;

  function clearFilters() {
    setQ("");
    setFilter("MANAGED");
    setStockFilter("ALL");
    setCategoryFilter("ALL");
    setWarehouseFilter("ALL");
    setSort("DEFAULT");
  }

  function openProduct(product: Product) {
    if (!product.id) return;
    navigate(`/app/products/${product.id}`);
  }

  function toggleStockBreakdown(productId: string) {
    setExpandedStockProductIds((current) => {
      const next = new Set(current);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  }

  function buildImportPreview(fileName: string, text: string): ProductImportPreview {
    const issues: ProductImportIssue[] = [];
    const rows = parseCsv(text);
    const [headerRow, ...dataRows] = rows;
    const headers = new Map((headerRow ?? []).map((header, index) => [header.trim(), index]));
    const requiredHeaders = ["name", "sku", "costPrice", "salePrice", "minStock"];
    const missingHeaders = requiredHeaders.filter((header) => !headers.has(header));
    const warehouseName = importWarehouse?.branch?.name ? `${importWarehouse.name} / ${importWarehouse.branch.name}` : importWarehouse?.name ?? "ยังไม่ได้เลือกคลัง";

    if (!headerRow || missingHeaders.length > 0) {
      return {
        fileName,
        warehouseName,
        rows: [],
        issues: [{ rowNumber: 1, message: `ไฟล์ต้องมีคอลัมน์ ${requiredHeaders.join(", ")}` }]
      };
    }

    if (!importWarehouse) {
      issues.push({ rowNumber: 1, message: "ยังไม่มีคลังที่พร้อมรับสินค้า กรุณาสร้างหรือเปิดใช้งานคลังก่อน" });
    }

    const existingSkus = new Set((allProducts.data ?? []).map((product) => product.sku.trim().toLowerCase()).filter(Boolean));
    const existingBarcodes = new Set((allProducts.data ?? []).map((product) => product.barcode?.trim().toLowerCase()).filter(Boolean) as string[]);
    const fileSkus = new Set<string>();
    const fileBarcodes = new Set<string>();
    const importRows: ProductImportRow[] = [];

    function value(row: string[], key: string) {
      const index = headers.get(key);
      return index === undefined ? "" : row[index] ?? "";
    }

    dataRows.forEach((row, index) => {
      const rowNumber = index + 2;
      const name = parseOptionalText(value(row, "name"));
      const sku = parseOptionalText(value(row, "sku"));
      const barcode = parseOptionalText(value(row, "barcode"));
      const costPrice = parseImportNumber(value(row, "costPrice"));
      const salePrice = parseImportNumber(value(row, "salePrice"));
      const minStock = parseImportNumber(value(row, "minStock"));
      const initialStock = parseImportNumber(value(row, "initialStock"), 0);
      const rowIssues: string[] = [];

      if (!name) rowIssues.push("ไม่มีชื่อสินค้า");
      if (!sku) rowIssues.push("ไม่มี SKU");
      if (!Number.isFinite(costPrice) || costPrice < 0) rowIssues.push("ราคาทุนไม่ถูกต้อง");
      if (!Number.isFinite(salePrice) || salePrice < 0) rowIssues.push("ราคาขายไม่ถูกต้อง");
      if (!Number.isInteger(minStock) || minStock < 0) rowIssues.push("จุดแจ้งเตือนต้องเป็นจำนวนเต็ม 0 ขึ้นไป");
      if (!Number.isInteger(initialStock) || initialStock < 0) rowIssues.push("สต็อกเริ่มต้นต้องเป็นจำนวนเต็ม 0 ขึ้นไป");

      const normalizedSku = sku?.toLowerCase();
      const normalizedBarcode = barcode?.toLowerCase();
      if (normalizedSku && existingSkus.has(normalizedSku)) rowIssues.push("SKU ซ้ำกับสินค้าในระบบ");
      if (normalizedSku && fileSkus.has(normalizedSku)) rowIssues.push("SKU ซ้ำในไฟล์");
      if (normalizedBarcode && existingBarcodes.has(normalizedBarcode)) rowIssues.push("Barcode ซ้ำกับสินค้าในระบบ");
      if (normalizedBarcode && fileBarcodes.has(normalizedBarcode)) rowIssues.push("Barcode ซ้ำในไฟล์");
      if (normalizedSku) fileSkus.add(normalizedSku);
      if (normalizedBarcode) fileBarcodes.add(normalizedBarcode);

      if (rowIssues.length > 0 || !name || !sku || !importWarehouse || !Number.isFinite(costPrice) || !Number.isFinite(salePrice) || !Number.isFinite(minStock) || !Number.isFinite(initialStock)) {
        issues.push({ rowNumber, message: rowIssues.join(", ") || "ข้อมูลแถวนี้ไม่ถูกต้อง" });
        return;
      }

      importRows.push({
        rowNumber,
        name,
        sku,
        barcode,
        branchId: workingBranchId || undefined,
        warehouseId: importWarehouse.id,
        unit: parseOptionalText(value(row, "unit")) ?? "ชิ้น",
        categoryName: parseOptionalText(value(row, "categoryName")),
        brandName: parseOptionalText(value(row, "brandName")),
        description: parseOptionalText(value(row, "description")),
        costPrice,
        salePrice,
        minStock,
        ...(initialStock > 0 ? { initialStock } : {})
      });
    });

    return { fileName, warehouseName, rows: importRows, issues };
  }

  async function chooseProductImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setMessage("");
    setProductImportPreview(null);
    try {
      const text = await file.text();
      const preview = buildImportPreview(file.name, text);
      setProductImportPreview(preview);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "อ่านไฟล์ไม่สำเร็จ");
    } finally {
      event.target.value = "";
    }
  }

  async function confirmProductImport() {
    if (!productImportPreview || productImportPreview.rows.length === 0) return;
    setIsImportingProducts(true);
    setMessage("");
    const failedRows: ProductImportRow[] = [];
    const failedIssues: ProductImportIssue[] = [];
    let successCount = 0;

    for (const importRow of productImportPreview.rows) {
      const { rowNumber, ...payload } = importRow;
      try {
        await post<Product>("/products", payload);
        successCount += 1;
      } catch (error) {
        failedRows.push(importRow);
        failedIssues.push({ rowNumber, message: error instanceof Error ? error.message : "บันทึกสินค้าไม่สำเร็จ" });
      }
    }

    queryClient.invalidateQueries({ queryKey: ["products"] });
    queryClient.invalidateQueries({ queryKey: ["categories"] });
    queryClient.invalidateQueries({ queryKey: ["stock-report"] });
    queryClient.invalidateQueries({ queryKey: ["inventory-balances"] });
    queryClient.invalidateQueries({ queryKey: ["movements"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    setIsImportingProducts(false);

    if (failedRows.length > 0) {
      setProductImportPreview({ ...productImportPreview, rows: failedRows, issues: failedIssues });
      setMessage(`นำเข้าสำเร็จ ${number(successCount)} รายการ และมี ${number(failedRows.length)} รายการที่ยังไม่สำเร็จ`);
      return;
    }

    setProductImportPreview(null);
    setMessage(`นำเข้าสินค้าเรียบร้อย ${number(successCount)} รายการ`);
  }

  function changeStatus(product: Product, action: "pause" | "discontinue" | "archive" | "reactivate") {
    const stock = stockOf(product);
    const branchText = workingBranchId ? "ในสาขานี้" : "ทั้งร้าน";
    const prompts = {
      pause: `หยุดขายชั่วคราว "${product.name}" ${branchText} ใช่ไหม? สินค้าจะไม่แสดงใน POS แต่ยังจัดการสต็อกได้`,
      discontinue:
        stock > 0
          ? `ปิดขายถาวร "${product.name}" ${branchText} ใช่ไหม? ยังมีสต็อกเหลือ ${number(stock)} ${product.unit} และสินค้ายังนับในแพ็กเกจจนกว่าจะเคลียร์สต็อก`
          : `ปิดขายถาวร "${product.name}" ${branchText} ใช่ไหม? สินค้านี้ไม่มีสต็อกแล้ว และสามารถเก็บเข้าประวัติได้ภายหลัง`,
      archive: `เก็บ "${product.name}" เข้าประวัติใช่ไหม? ต้องไม่มีสต็อกคงเหลือก่อนเก็บ`,
      reactivate: product.status === "ARCHIVED" ? `กู้คืน "${product.name}" กลับมาเป็นสถานะหยุดขายใช่ไหม?` : `เปิดขาย "${product.name}" ${branchText} อีกครั้งใช่ไหม?`
    };
    if (!window.confirm(prompts[action])) return;
    statusMutation.mutate({ id: product.id, action });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-ink">สินค้า</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-stone-600">จัดการข้อมูลสินค้า SKU บาร์โค้ด ราคา สถานะ และจุดแจ้งเตือนสต็อก</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canCreateProducts ? (
            <>
              <input ref={importInputRef} className="hidden" type="file" accept=".csv,text/csv" onChange={chooseProductImportFile} />
              <Button className="h-9 px-3" type="button" variant="secondary" icon={<FileSpreadsheet size={17} />} disabled={isImportingProducts} onClick={() => importInputRef.current?.click()}>
                นำเข้าจาก CSV
              </Button>
              <Button className="h-9 px-3" type="button" variant="secondary" icon={<FileSpreadsheet size={17} />} onClick={downloadProductTemplate}>
                ดาวน์โหลด template
              </Button>
            </>
          ) : null}
          <Link to="/app/inventory/receipts">
            <Button className="h-9 px-3" variant="secondary" icon={<Boxes size={17} />}>รับสินค้าเข้า</Button>
          </Link>
          <Link to="/app/inventory/adjustments">
            <Button className="h-9 px-3" variant="secondary" icon={<SlidersHorizontal size={17} />}>ปรับสต็อก</Button>
          </Link>
          <Link to="/app/inventory/movements">
            <Button className="h-9 px-3" variant="secondary" icon={<ClipboardList size={17} />}>ดูประวัติสต็อก</Button>
          </Link>
          {canViewProducts ? (
            <Link to="/app/categories">
              <Button className="h-9 px-3" variant="secondary" icon={<Tags size={17} />}>{canEditProducts ? "จัดการหมวดหมู่" : "ดูหมวดหมู่"}</Button>
            </Link>
          ) : null}
          {canCreateProducts ? (
            <Link to="/app/products/new">
              <Button className="h-9 px-3" icon={<Plus size={17} />}>เพิ่มสินค้า</Button>
            </Link>
          ) : null}
        </div>
      </div>

      {productImportPreview ? (
        <Card className="overflow-hidden p-0">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-200 p-4">
            <div>
              <h2 className="text-lg font-black text-ink">นำเข้าสินค้าจาก CSV</h2>
              <p className="mt-1 text-sm text-stone-600">
                {productImportPreview.fileName} / เข้าคลัง {productImportPreview.warehouseName}
              </p>
            </div>
            <button
              type="button"
              className="grid h-9 w-9 place-items-center rounded-md text-stone-500 hover:bg-stone-100"
              aria-label="ปิดตัวอย่างนำเข้าสินค้า"
              disabled={isImportingProducts}
              onClick={() => setProductImportPreview(null)}
            >
              <X size={18} />
            </button>
          </div>
          <div className="grid gap-4 p-4 lg:grid-cols-[1fr_320px]">
            <div className="min-w-0">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-md bg-teal-50 px-3 py-1.5 text-sm font-black text-leaf ring-1 ring-teal-100">
                  พร้อมนำเข้า {number(productImportPreview.rows.length)} รายการ
                </span>
                <span className={`rounded-md px-3 py-1.5 text-sm font-black ring-1 ${
                  productImportPreview.issues.length > 0 ? "bg-red-50 text-red-700 ring-red-100" : "bg-stone-50 text-stone-700 ring-stone-200"
                }`}>
                  ปัญหา {number(productImportPreview.issues.length)} แถว
                </span>
              </div>
              {productImportPreview.rows.length > 0 ? (
                <div className="mt-4 overflow-x-auto rounded-md border border-stone-200">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="bg-stone-50 text-stone-500">
                      <tr>
                        <th className="px-3 py-2">แถว</th>
                        <th className="px-3 py-2">สินค้า</th>
                        <th className="px-3 py-2">SKU</th>
                        <th className="px-3 py-2">หมวดหมู่</th>
                        <th className="px-3 py-2">ราคาขาย</th>
                        <th className="px-3 py-2">สต็อกเริ่มต้น</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productImportPreview.rows.slice(0, 8).map((row) => (
                        <tr key={`${row.rowNumber}-${row.sku}`} className="border-t border-stone-100">
                          <td className="px-3 py-2 font-semibold">{row.rowNumber}</td>
                          <td className="px-3 py-2">{row.name}</td>
                          <td className="px-3 py-2">{row.sku}</td>
                          <td className="px-3 py-2">{row.categoryName ?? "ไม่จัดหมวด"}</td>
                          <td className="px-3 py-2">{baht(row.salePrice)}</td>
                          <td className="px-3 py-2">{number(row.initialStock ?? 0)} {row.unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="mt-4 rounded-md border border-dashed border-stone-300 p-4 text-sm font-semibold text-stone-500">ยังไม่มีแถวที่พร้อมนำเข้า</div>
              )}
              {productImportPreview.rows.length > 8 ? (
                <p className="mt-2 text-xs font-semibold text-stone-500">แสดงตัวอย่าง 8 รายการแรกจาก {number(productImportPreview.rows.length)} รายการ</p>
              ) : null}
            </div>

            <div className="space-y-3">
              {productImportPreview.issues.length > 0 ? (
                <div className="rounded-md border border-red-100 bg-red-50 p-3">
                  <p className="font-black text-red-800">แถวที่ต้องแก้</p>
                  <div className="mt-2 max-h-56 space-y-2 overflow-y-auto pr-1">
                    {productImportPreview.issues.slice(0, 10).map((issue) => (
                      <p key={`${issue.rowNumber}-${issue.message}`} className="text-sm font-semibold text-red-700">
                        แถว {issue.rowNumber}: {issue.message}
                      </p>
                    ))}
                  </div>
                  {productImportPreview.issues.length > 10 ? (
                    <p className="mt-2 text-xs font-semibold text-red-700">และอีก {number(productImportPreview.issues.length - 10)} แถว</p>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-md border border-teal-100 bg-teal-50 p-3 text-sm font-semibold text-leaf">ไฟล์พร้อมนำเข้า</div>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="ghost" disabled={isImportingProducts} onClick={() => setProductImportPreview(null)}>ยกเลิก</Button>
                <Button type="button" icon={<Save size={16} />} disabled={isImportingProducts || productImportPreview.rows.length === 0} onClick={confirmProductImport}>
                  {isImportingProducts ? "กำลังนำเข้า..." : "ยืนยันนำเข้า"}
                </Button>
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard icon={<PackageCheck size={19} />} label="สินค้าที่จัดการ" value={`${number(summary.totalManaged)} รายการ`} />
        <MetricCard icon={<Package size={19} />} label="เปิดขาย" value={`${number(summary.active)} รายการ`} />
        <MetricCard icon={<PackageMinus size={19} />} label="ใกล้หมด" value={`${number(summary.lowStock)} รายการ`} tone="warning" />
        <MetricCard icon={<PackageX size={19} />} label="หมดสต็อก" value={`${number(summary.outOfStock)} รายการ`} tone="danger" />
      </div>

      <Card className="overflow-visible p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <SlidersHorizontal className="shrink-0 text-leaf" size={17} />
            <p className="font-bold text-ink">ค้นหาและกรองสินค้า</p>
            <span className="text-sm text-stone-500">{number(list.length)} รายการ</span>
          </div>
          {hasFilters ? (
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-bold text-leaf transition hover:bg-teal-50 hover:text-teal-800"
              onClick={clearFilters}
            >
              <X size={14} />
              ล้างตัวกรอง
            </button>
          ) : null}
        </div>

        <div className="mt-3 space-y-2.5">
          <div className="grid gap-2 xl:grid-cols-[minmax(300px,1fr)_minmax(0,1.15fr)]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
              <input
                className="field field-with-left-icon h-9 border-stone-300 bg-white py-0 text-sm"
                placeholder="ค้นหาชื่อสินค้า SKU บาร์โค้ด หมวดหมู่ หรือแบรนด์"
                value={q}
                onChange={(event) => setQ(event.target.value)}
              />
            </label>
            <div className="min-w-0 rounded-md border border-stone-200 bg-stone-50 p-0.5">
              <div className="flex max-w-full gap-1 overflow-x-auto">
                {statusFilters.map((item) => (
                  <FilterSegment key={item.value} selected={filter === item.value} onClick={() => setFilter(item.value)}>
                    {item.label}
                  </FilterSegment>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
            <FilterControl label="หมวดหมู่">
              <Dropdown
                className="w-full"
                buttonClassName="min-h-9 border-stone-300 bg-white py-0 text-sm"
                options={categoryOptions}
                value={categoryFilter}
                onValueChange={(value) => setCategoryFilter(value)}
                placeholder="เลือกหมวดหมู่"
              />
            </FilterControl>
            <FilterControl label="คลัง">
              <Dropdown
                className="w-full"
                buttonClassName="min-h-9 border-stone-300 bg-white py-0 text-sm"
                options={warehouseOptions}
                value={warehouseFilter}
                onValueChange={(value) => setWarehouseFilter(value)}
                placeholder={warehouses.isLoading ? "กำลังโหลดคลัง..." : "เลือกคลัง"}
              />
            </FilterControl>
            <FilterControl label="เรียงลำดับ">
              <Dropdown
                className="w-full"
                buttonClassName="min-h-9 border-stone-300 bg-white py-0 text-sm"
                options={sortOptions}
                value={sort}
                onValueChange={(value) => setSort(value as ProductSort)}
                placeholder="เรียงลำดับ"
              />
            </FilterControl>
            <div className="min-w-0 self-end rounded-md border border-stone-200 bg-stone-50 px-2 py-1.5">
              <div className="flex flex-wrap gap-1.5">
                {stockFilters.map((item) => (
                  <FilterPill key={item.value} selected={stockFilter === item.value} onClick={() => setStockFilter(item.value)}>
                    {item.label}
                  </FilterPill>
                ))}
              </div>
            </div>
          </div>

          {activeFilterLabels.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {activeFilterLabels.map((label) => (
                <span key={label} className="rounded-md bg-stone-50 px-2 py-1 text-xs font-semibold text-stone-600 ring-1 ring-stone-200">
                  {label}
                </span>
              ))}
            </div>
          ) : null}

          {message ? <p className="rounded-md bg-teal-50 p-3 text-sm font-semibold text-leaf">{message}</p> : null}
        </div>
      </Card>

      {query.isLoading ? <Card>กำลังโหลดสินค้า...</Card> : null}
      {query.error ? <Card className="text-red-700">โหลดสินค้าไม่สำเร็จ: {query.error.message}</Card> : null}

      {!query.isLoading && !query.error && list.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white shadow-sm">
          <table className="w-full min-w-[1040px] text-left text-sm">
            <thead className="bg-stone-50 text-stone-500">
              <tr>
                <th className="px-3 py-2.5">สินค้า</th>
                <th className="px-3 py-2.5">SKU / Barcode</th>
                <th className="px-3 py-2.5">คงเหลือ</th>
                <th className="px-3 py-2.5">สถานะ</th>
                <th className="px-3 py-2.5">ราคาทุน</th>
                <th className="px-3 py-2.5">ราคาขาย</th>
                <th className="px-3 py-2.5">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {list.map((product) => {
                const stock = stockOf(product);
                const stockBadge = getStockBadge(product);
                const lifecycle = PRODUCT_STATUS_LABELS[product.status];
                const stockedBalances = product.balances.filter((balance) => balance.quantity > 0);
                const canExpandStock = stockedBalances.length > 1;
                const isStockExpanded = expandedStockProductIds.has(product.id);
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
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-3">
                        <ProductImageThumb product={product} className="h-12 w-12" />
                        <div className="min-w-0">
                          <p className="font-bold text-ink">{getProductDisplayName(product)}</p>
                          <p className="mt-1 text-xs text-stone-500">{product.category?.name ?? "ไม่จัดหมวด"} / {product.brand?.name ?? "ไม่มีแบรนด์"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-semibold">{product.sku}</p>
                      <p className="mt-1 text-xs text-stone-500">{product.barcode ?? "ไม่มีบาร์โค้ด"}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-semibold">คงเหลือ {number(stock)} {product.unit}</p>
                      <div onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
                        {canExpandStock ? (
                          <button
                            type="button"
                            className="mt-1 inline-flex max-w-[280px] items-start gap-1 text-left text-xs font-semibold text-leaf hover:text-teal-800"
                            aria-expanded={isStockExpanded}
                            onClick={() => toggleStockBreakdown(product.id)}
                          >
                            <span className="mt-0.5 shrink-0">
                              {isStockExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </span>
                            <span>คลัง: {getProductStockLocationSummary(product)}</span>
                          </button>
                        ) : (
                          <p className="mt-1 max-w-[260px] text-xs text-stone-500">คลัง: {getProductStockLocationSummary(product)}</p>
                        )}
                        {canExpandStock && isStockExpanded ? (
                          <div className="mt-2 w-full max-w-[300px] overflow-hidden rounded-md border border-stone-200 bg-stone-50">
                            {stockedBalances.map((balance, index) => (
                              <div
                                key={`${balance.warehouseId ?? balance.warehouse?.id ?? balance.warehouse?.name ?? balance.branch?.name ?? "warehouse"}-${index}`}
                                className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-b border-stone-200 px-2.5 py-2 text-xs last:border-0"
                              >
                                <span className="min-w-0 truncate font-semibold text-ink">{getBalanceWarehouseName(balance)}</span>
                                <span className="shrink-0 text-stone-700">{number(balance.quantity)} {product.unit}</span>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-stone-500">จุดแจ้งเตือน {number(product.minStock)}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1.5">
                        <span className={`rounded px-2 py-1 text-xs font-bold ${lifecycle.className}`}>{lifecycle.label}</span>
                        <span className={`rounded px-2 py-1 text-xs font-bold ${stockBadge.className}`}>{stockBadge.label}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">{baht(product.costPrice)}</td>
                    <td className="px-3 py-2.5 font-semibold">{baht(product.salePrice)}</td>
                    <td className="px-3 py-2.5">
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
            {canCreateProducts ? (
              <Link to="/app/products/new" className="inline-flex">
                <Button icon={<Plus size={18} />}>เพิ่มสินค้าใหม่</Button>
              </Link>
            ) : null}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function FilterSegment({ selected, children, onClick }: { selected: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={`h-8 shrink-0 rounded-md px-2 text-xs font-bold transition ${
        selected ? "bg-white text-leaf shadow-sm ring-1 ring-stone-200" : "text-stone-600 hover:bg-white hover:text-ink"
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function FilterPill({ selected, children, onClick }: { selected: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={`h-8 rounded-full px-3 text-xs font-bold transition ${
        selected ? "bg-leaf text-white shadow-sm" : "bg-stone-100 text-stone-700 hover:bg-stone-200"
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function FilterControl({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="block min-w-0">
      <span className="mb-1.5 block text-xs font-bold uppercase text-stone-500">{label}</span>
      {children}
    </div>
  );
}

function MetricCard({ icon, label, value, tone = "default" }: { icon: ReactNode; label: string; value: string; tone?: "default" | "warning" | "danger" }) {
  const toneClass = tone === "danger" ? "bg-red-50 text-red-700" : tone === "warning" ? "bg-amber-50 text-amber-700" : "bg-teal-50 text-leaf";
  return (
    <Card className="flex items-center gap-3 p-4">
      <span className={`grid h-9 w-9 place-items-center rounded-md ${toneClass}`}>{icon}</span>
      <span>
        <span className="block text-sm font-semibold text-stone-500">{label}</span>
        <span className="block text-lg font-black text-ink">{value}</span>
      </span>
    </Card>
  );
}

export function ProductFormPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const formRef = useRef<HTMLFormElement>(null);
  const session = useAuth((state) => state.session);
  const workingBranchId = useWorkingBranch((state) => state.workingBranchId);
  const canCreateProducts = canManageProductMaster(session);
  const returnTo = getSafeReturnTo(searchParams.get("returnTo"));
  const fallbackPath = returnTo || "/app/products";
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [selectedCategoryName, setSelectedCategoryName] = useState("");
  const [isCategoryFormOpen, setIsCategoryFormOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [barcodeValue, setBarcodeValue] = useState("");
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [costPriceInput, setCostPriceInput] = useState("");
  const [isReceivePanelOpen, setIsReceivePanelOpen] = useState(false);
  const [productWarehouseId, setProductWarehouseId] = useState("");
  const [receiveQuantity, setReceiveQuantity] = useState(1);
  const [receiveUnitCost, setReceiveUnitCost] = useState("");
  const [isReceiveUnitCostTouched, setIsReceiveUnitCostTouched] = useState(false);
  const [isVariantMode, setIsVariantMode] = useState(false);
  const [variantColorsInput, setVariantColorsInput] = useState("");
  const [variantSizesInput, setVariantSizesInput] = useState("");
  const [variantRows, setVariantRows] = useState<ProductVariantDraftRow[]>([]);
  const [pendingProduct, setPendingProduct] = useState<ProductCreateSummary | null>(null);
  const [pendingVariantGroup, setPendingVariantGroup] = useState<ProductVariantsCreateSummary | null>(null);
  const [createdProduct, setCreatedProduct] = useState<Product | null>(null);
  const [createdProductSummary, setCreatedProductSummary] = useState<ProductCreateSummary | null>(null);
  const [createdVariantGroup, setCreatedVariantGroup] = useState<ProductVariantGroupResponse | null>(null);
  const categories = useQuery({ queryKey: ["categories", workingBranchId], queryFn: () => api<Category[]>(branchScopedPath("/categories", workingBranchId)) });
  const warehouses = useQuery({ queryKey: ["warehouses", workingBranchId], queryFn: () => api<Warehouse[]>(branchScopedPath("/warehouses", workingBranchId)) });
  const canReceiveProducts = hasSessionPermission(session, "inventory.receive");
  const productCategoryOptions = useMemo(() => [
    { value: "", label: "ไม่จัดหมวด" },
    ...(categories.data ?? []).map((category) => ({ value: category.name, label: category.name }))
  ], [categories.data]);
  const activeWarehouses = useMemo(() => {
    return (warehouses.data ?? [])
      .filter((warehouse) => warehouse.status !== "INACTIVE")
      .filter((warehouse) => !workingBranchId || !warehouse.branchId || warehouse.branchId === workingBranchId)
      .sort((left, right) => Number(Boolean(right.isDefault)) - Number(Boolean(left.isDefault)));
  }, [warehouses.data, workingBranchId]);
  const productWarehouseOptions = useMemo(() => {
    return [
      { value: "", label: warehouses.isLoading ? "กำลังโหลดคลัง..." : "เลือกคลังสำหรับสินค้า" },
      ...activeWarehouses.map((warehouse) => ({
        value: warehouse.id,
        label: warehouse.branch?.name ? `${warehouse.name} (${warehouse.code ?? "-"}) / ${warehouse.branch.name}` : warehouse.code ? `${warehouse.name} (${warehouse.code})` : warehouse.name
      }))
    ];
  }, [activeWarehouses, warehouses.isLoading]);
  const selectedProductWarehouse = activeWarehouses.find((warehouse) => warehouse.id === productWarehouseId);
  const createCategoryMutation = useMutation({
    mutationFn: (name: string) => post<Category>("/categories", { name, color: "#2563eb" }),
    onSuccess: (category) => {
      setSelectedCategoryName(category.name);
      setNewCategoryName("");
      setIsCategoryFormOpen(false);
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (err) => setError(err.message)
  });

  useEffect(() => {
    if (productWarehouseId) return;
    const warehouse = activeWarehouses[0];
    if (warehouse) setProductWarehouseId(warehouse.id);
  }, [activeWarehouses, productWarehouseId]);

  useEffect(() => {
    if (isReceiveUnitCostTouched) return;
    setReceiveUnitCost(costPriceInput);
  }, [costPriceInput, isReceiveUnitCostTouched]);

  function buildProductSummary(payload: ProductCreatePayload): ProductCreateSummary {
    const warehouse = activeWarehouses.find((item) => item.id === payload.warehouseId);
    return {
      ...payload,
      warehouseName: warehouse?.name ?? "คลังสินค้า",
      warehouseBranchName: warehouse?.branch?.name,
      imageName: selectedImage?.name
    };
  }

  function buildVariantRowsFromForm(form: FormData, previousRows = variantRows) {
    const skuPrefix = textValue(form, "sku") ?? "";
    const costPrice = numberValue(form, "costPrice");
    const salePrice = numberValue(form, "salePrice");
    const minStock = numberValue(form, "minStock");
    const colors = parseVariantValues(variantColorsInput);
    const sizes = parseVariantValues(variantSizesInput);
    if (!skuPrefix || (colors.length === 0 && sizes.length === 0) || !Number.isFinite(costPrice) || !Number.isFinite(salePrice) || !Number.isFinite(minStock)) return [];
    return buildVariantDraftRows({ colors, sizes, skuPrefix, costPrice, salePrice, minStock, previousRows });
  }

  function refreshVariantRows() {
    const form = formRef.current ? new FormData(formRef.current) : undefined;
    if (!form) return;
    const rows = buildVariantRowsFromForm(form);
    if (rows.length === 0) {
      setError("กรุณากรอก SKU prefix, สีหรือไซส์, ราคา และจุดแจ้งเตือนก่อนสร้างตาราง");
      return;
    }
    setError("");
    setVariantRows(rows);
  }

  function updateVariantRow(rowId: string, patch: Partial<ProductVariantDraftRow>) {
    setVariantRows((rows) => rows.map((row) => row.id === rowId ? { ...row, ...patch } : row));
  }

  function buildVariantGroupSummary(payload: ProductVariantsCreatePayload): ProductVariantsCreateSummary {
    const warehouse = activeWarehouses.find((item) => item.id === payload.warehouseId);
    return {
      ...payload,
      warehouseName: warehouse?.name ?? "คลังสินค้า",
      warehouseBranchName: warehouse?.branch?.name,
      imageName: selectedImage?.name
    };
  }

  if (!canCreateProducts) {
    return (
      <Card className="max-w-2xl">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-red-50 text-red-700">
            <AlertCircle size={20} />
          </span>
          <div>
            <h1 className="text-xl font-black text-ink">ไม่มีสิทธิ์เพิ่มสินค้า</h1>
            <p className="mt-2 text-sm leading-6 text-stone-600">เฉพาะเจ้าของร้านเท่านั้นที่เพิ่มหรือแก้ข้อมูลหลักของสินค้าได้</p>
            <Button type="button" className="mt-4" variant="secondary" onClick={() => navigate(fallbackPath)}>{returnTo ? "กลับหน้าก่อนหน้า" : "กลับหน้าสินค้า"}</Button>
          </div>
        </div>
      </Card>
    );
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

    if (!name || !sku) {
      setError(isVariantMode ? "กรุณากรอกชื่อสินค้าและ SKU prefix" : "กรุณากรอกชื่อสินค้าและ SKU");
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
    if (!productWarehouseId) {
      setError("กรุณาเลือกคลังสำหรับสินค้า");
      return;
    }
    const shouldReceiveNow = isReceivePanelOpen && canReceiveProducts;
    const receiveQuantityValue = Number(receiveQuantity);
    const receiveUnitCostValue = receiveUnitCost.trim() === "" ? costPrice : Number(receiveUnitCost);
    if (shouldReceiveNow) {
      if (!Number.isInteger(receiveQuantityValue) || receiveQuantityValue < 1) {
        setError("จำนวนรับเข้าต้องเป็นจำนวนเต็ม 1 ขึ้นไป");
        return;
      }
      if (!Number.isFinite(receiveUnitCostValue) || receiveUnitCostValue < 0) {
        setError("ต้นทุนรับเข้าต้องเป็นตัวเลข 0 ขึ้นไป");
        return;
      }
    }

    if (isVariantMode) {
      const colors = parseVariantValues(variantColorsInput);
      const sizes = parseVariantValues(variantSizesInput);
      if (colors.length === 0 && sizes.length === 0) {
        setError("กรุณาระบุสีหรือไซส์อย่างน้อย 1 ค่า");
        return;
      }
      const rows = buildVariantRowsFromForm(form);
      if (rows.length !== variantDimensionOptions(colors).length * variantDimensionOptions(sizes).length) {
        setError("กรุณาสร้างตาราง variant ให้ครบก่อนบันทึก");
        return;
      }
      const skus = rows.map((row) => row.sku.trim()).filter(Boolean);
      const skuSet = new Set(skus.map((item) => item.toLowerCase()));
      const barcodes = rows.map((row) => row.barcode.trim()).filter(Boolean);
      const barcodeSet = new Set(barcodes.map((item) => item.toLowerCase()));
      if (skus.length !== rows.length) {
        setError("ทุก variant ต้องมี SKU");
        return;
      }
      if (skuSet.size !== skus.length) {
        setError("มี SKU ซ้ำในตาราง variant");
        return;
      }
      if (barcodeSet.size !== barcodes.length) {
        setError("มี barcode ซ้ำในตาราง variant");
        return;
      }
      const invalidRow = rows.find((row) => {
        const receiveQuantityOk = Number.isInteger(row.receiveQuantity) && row.receiveQuantity >= 0;
        return [row.costPrice, row.salePrice, row.minStock, row.receiveUnitCost].some((value) => !Number.isFinite(value) || value < 0) || !Number.isInteger(row.minStock) || !receiveQuantityOk;
      });
      if (invalidRow) {
        setError("ราคา จุดแจ้งเตือน จำนวนรับเข้า และต้นทุนรับเข้าของแต่ละ variant ต้องถูกต้อง");
        return;
      }
      const payload: ProductVariantsCreatePayload = {
        name,
        skuPrefix: sku,
        colors,
        sizes,
        categoryName: textValue(form, "categoryName"),
        brandName: textValue(form, "brandName"),
        warehouseId: productWarehouseId,
        unit: textValue(form, "unit") ?? "ชิ้น",
        description: textValue(form, "description"),
        costPrice,
        salePrice,
        minStock,
        receiveSupplier: shouldReceiveNow ? textValue(form, "receiveSupplier") : undefined,
        receiveNote: shouldReceiveNow ? textValue(form, "receiveNote") : undefined,
        variants: rows.map(({ id: _id, barcode, receiveQuantity: rowReceiveQuantity, color, size, ...row }) => ({
          ...row,
          color: color.trim() || undefined,
          size: size.trim() || undefined,
          barcode: barcode.trim() || undefined,
          receiveQuantity: shouldReceiveNow ? rowReceiveQuantity : 0
        }))
      };
      setVariantRows(rows);
      setCreatedProduct(null);
      setCreatedProductSummary(null);
      setCreatedVariantGroup(null);
      setPendingVariantGroup(buildVariantGroupSummary(payload));
      return;
    }

    const payload: ProductCreatePayload = {
      name,
      sku,
      barcode: textValue(form, "barcode"),
      categoryName: textValue(form, "categoryName"),
      brandName: textValue(form, "brandName"),
      warehouseId: productWarehouseId,
      unit: textValue(form, "unit") ?? "ชิ้น",
      description: textValue(form, "description"),
      costPrice,
      salePrice,
      minStock,
      ...(shouldReceiveNow ? {
        receiveNow: {
          warehouseId: productWarehouseId,
          quantity: receiveQuantityValue,
          unitCost: receiveUnitCostValue,
          supplier: textValue(form, "receiveSupplier"),
          note: textValue(form, "receiveNote")
        }
      } : {})
    };
    setCreatedProduct(null);
    setCreatedProductSummary(null);
    setPendingProduct(buildProductSummary(payload));
  }

  async function confirmCreateProduct() {
    if (!pendingProduct) return;
    const { warehouseName: _warehouseName, warehouseBranchName: _warehouseBranchName, imageName: _imageName, ...payload } = pendingProduct;
    const shouldReceiveNow = Boolean(payload.receiveNow);
    setError("");
    setIsSubmitting(true);
    try {
      const product = await post<Product>("/products", payload);
      if (selectedImage) {
        try {
          await uploadProductImage<Product>(product.id, selectedImage);
        } catch (imageError) {
          const savedMessage = shouldReceiveNow ? "บันทึกสินค้าและรับเข้าแล้ว" : "บันทึกสินค้าแล้ว";
          setPendingProduct(null);
          setError(imageError instanceof Error ? `${savedMessage} แต่รูปสินค้าอัปโหลดไม่สำเร็จ: ${imageError.message}` : `${savedMessage} แต่รูปสินค้าอัปโหลดไม่สำเร็จ`);
          queryClient.invalidateQueries({ queryKey: ["products"] });
          queryClient.invalidateQueries({ queryKey: ["stock-report"] });
          queryClient.invalidateQueries({ queryKey: ["inventory-balances"] });
          queryClient.invalidateQueries({ queryKey: ["movements"] });
          queryClient.invalidateQueries({ queryKey: ["dashboard"] });
          return;
        }
      }
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["stock-report"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-balances"] });
      queryClient.invalidateQueries({ queryKey: ["movements"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setPendingProduct(null);
      setCreatedProduct(product);
      setCreatedProductSummary(pendingProduct);
    } catch (err) {
      setPendingProduct(null);
      setError(err instanceof Error ? err.message : "บันทึกสินค้าไม่สำเร็จ");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function confirmCreateVariantGroup() {
    if (!pendingVariantGroup) return;
    const { warehouseName: _warehouseName, warehouseBranchName: _warehouseBranchName, imageName: _imageName, ...payload } = pendingVariantGroup;
    setError("");
    setIsSubmitting(true);
    try {
      const group = await post<ProductVariantGroupResponse>("/products/variants", payload);
      if (selectedImage) {
        const uploads = group.products.map((product) => uploadProductImage<Product>(product.id, selectedImage));
        await Promise.all(uploads);
      }
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["stock-report"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-balances"] });
      queryClient.invalidateQueries({ queryKey: ["movements"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setPendingVariantGroup(null);
      setCreatedVariantGroup(group);
    } catch (err) {
      setPendingVariantGroup(null);
      setError(err instanceof Error ? err.message : "บันทึกสินค้าแบบหลายสี/ไซส์ไม่สำเร็จ");
    } finally {
      setIsSubmitting(false);
    }
  }

  function createCategory() {
    setError("");
    const name = newCategoryName.trim();
    if (!name) {
      setError("กรุณากรอกชื่อหมวดหมู่");
      return;
    }
    const existingCategory = (categories.data ?? []).find((category) => category.name.toLowerCase() === name.toLowerCase());
    if (existingCategory) {
      setSelectedCategoryName(existingCategory.name);
      setNewCategoryName("");
      setIsCategoryFormOpen(false);
      return;
    }
    createCategoryMutation.mutate(name);
  }

  function renderCategoryField() {
    return (
      <div className="grid gap-2">
        <span className="text-sm font-semibold text-ink">หมวดหมู่</span>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <Dropdown
            name="categoryName"
            options={productCategoryOptions}
            value={selectedCategoryName}
            onValueChange={setSelectedCategoryName}
            disabled={categories.isLoading || createCategoryMutation.isPending}
            placeholder={categories.isLoading ? "กำลังโหลดหมวดหมู่..." : "เลือกหมวดหมู่"}
          />
          <Button
            type="button"
            variant="secondary"
            icon={isCategoryFormOpen ? <X size={16} /> : <Plus size={16} />}
            onClick={() => {
              setError("");
              setIsCategoryFormOpen((current) => !current);
            }}
          >
            {isCategoryFormOpen ? "ยกเลิก" : "สร้างใหม่"}
          </Button>
        </div>
        {isCategoryFormOpen ? (
          <div className="grid gap-2 rounded-md border border-stone-200 bg-stone-50 p-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <input
              className="field bg-white"
              value={newCategoryName}
              onChange={(event) => setNewCategoryName(event.target.value)}
              placeholder="ชื่อหมวดหมู่ใหม่ เช่น เครื่องดื่ม"
              autoFocus
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  createCategory();
                }
              }}
            />
            <Button type="button" icon={<Save size={16} />} disabled={createCategoryMutation.isPending} onClick={createCategory}>
              {createCategoryMutation.isPending ? "กำลังสร้าง..." : "สร้างและเลือก"}
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  function renderField(name: (typeof formFields)[number]["name"]) {
    if (name === "categoryName") return renderCategoryField();
    const field = fieldByName.get(name);
    if (!field) return null;
    if (name === "sku" && isVariantMode) {
      return (
        <label key={field.name} className="grid gap-1">
          <span className="text-sm font-semibold text-ink">SKU prefix *</span>
          <input
            className="field"
            name={field.name}
            type={field.type}
            required
            placeholder="เช่น TSHIRT-A"
            defaultValue=""
          />
        </label>
      );
    }
    if (name === "barcode") {
      if (isVariantMode) return null;
      return (
        <label key={field.name} className="grid gap-1">
          <span className="text-sm font-semibold text-ink">{field.label}</span>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <input
              className="field"
              name={field.name}
              type={field.type}
              placeholder={field.placeholder}
              value={barcodeValue}
              onChange={(event) => setBarcodeValue(event.target.value)}
            />
            <Button type="button" variant="secondary" icon={<ScanLine size={16} />} onClick={() => setIsScannerOpen(true)}>
              สแกน
            </Button>
          </div>
        </label>
      );
    }
    if (name === "costPrice") {
      return (
        <label key={field.name} className="grid gap-1">
          <span className="text-sm font-semibold text-ink">{field.label}</span>
          <input
            className="field"
            name={field.name}
            type={field.type}
            min={0}
            step={"step" in field ? field.step : undefined}
            required={"required" in field ? field.required : false}
            placeholder={field.placeholder}
            value={costPriceInput}
            onChange={(event) => setCostPriceInput(event.target.value)}
          />
        </label>
      );
    }
    return (
      <label key={field.name} className="grid gap-1">
        <span className="text-sm font-semibold text-ink">{field.label}</span>
        <input
          className="field"
          name={field.name}
          type={field.type}
          min={field.type === "number" ? 0 : undefined}
          step={"step" in field ? field.step : undefined}
          required={"required" in field ? field.required : false}
          placeholder={field.placeholder}
          defaultValue={"defaultValue" in field ? field.defaultValue : ""}
        />
      </label>
    );
  }

  const hasVariantColorRows = variantRows.some((row) => row.color.trim());
  const hasVariantSizeRows = variantRows.some((row) => row.size.trim());
  const pendingVariantHasColor = Boolean(pendingVariantGroup?.variants.some((row) => row.color?.trim()));
  const pendingVariantHasSize = Boolean(pendingVariantGroup?.variants.some((row) => row.size?.trim()));

  return (
    <div className="max-w-6xl space-y-5">
      <BarcodeScanner
        open={isScannerOpen}
        title="สแกนบาร์โค้ดสินค้า"
        onDetected={(code) => {
          setBarcodeValue(code);
          setError("");
        }}
        onClose={() => setIsScannerOpen(false)}
      />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black text-ink">เพิ่มสินค้าใหม่</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-stone-600">สร้างข้อมูลสินค้าไว้ล่วงหน้า ส่วนของเข้าคลังให้บันทึกเป็นใบรับเข้าเพื่อเก็บประวัติครบถ้วน</p>
        </div>
        <Button type="button" variant="secondary" onClick={() => navigate(fallbackPath)}>{returnTo ? "กลับหน้าก่อนหน้า" : "กลับหน้าสินค้า"}</Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <Card>
          <form ref={formRef} onSubmit={submit} className="space-y-6">
            <section className="space-y-4">
              <div>
                <h2 className="text-lg font-black text-ink">ข้อมูลหลัก</h2>
                <p className="mt-1 text-sm text-stone-600">กรอกเฉพาะข้อมูลที่ใช้ระบุตัวสินค้าและค้นหาในร้าน</p>
              </div>
              <div className="inline-flex rounded-md border border-stone-200 bg-stone-50 p-1">
                <button
                  type="button"
                  className={`rounded px-3 py-2 text-sm font-bold transition ${!isVariantMode ? "bg-white text-ink shadow-sm" : "text-stone-600 hover:text-ink"}`}
                  onClick={() => setIsVariantMode(false)}
                >
                  สินค้าเดี่ยว
                </button>
                <button
                  type="button"
                  className={`rounded px-3 py-2 text-sm font-bold transition ${isVariantMode ? "bg-white text-ink shadow-sm" : "text-stone-600 hover:text-ink"}`}
                  onClick={() => setIsVariantMode(true)}
                >
                  หลายตัวเลือก
                </button>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {identityFieldNames.map(renderField)}
              </div>
            </section>

            <section className="space-y-4 border-t border-stone-200 pt-5">
              <div>
                <h2 className="text-lg font-black text-ink">คลังสำหรับสินค้า</h2>
                <p className="mt-1 text-sm text-stone-600">เลือกว่าข้อมูลสินค้านี้จะเริ่มอยู่ในคลังไหน แม้ยังไม่รับของเข้า ระบบจะผูกสินค้าไว้กับคลังนี้ก่อน</p>
              </div>
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(220px,280px)]">
                <label className="grid gap-1">
                  <span className="text-sm font-semibold text-ink">คลังสินค้า</span>
                  <Dropdown
                    value={productWarehouseId}
                    onValueChange={setProductWarehouseId}
                    disabled={warehouses.isLoading}
                    required
                    placeholder="เลือกคลังสำหรับสินค้า"
                    options={productWarehouseOptions}
                  />
                </label>
                <div className="rounded-md border border-stone-200 bg-stone-50 p-3 text-sm">
                  <p className="font-bold text-ink">{selectedProductWarehouse?.name ?? "ยังไม่ได้เลือกคลัง"}</p>
                  <p className="mt-1 text-stone-500">
                    {selectedProductWarehouse?.branch?.name ?? "เลือกคลังเพื่อระบุสาขา"}
                  </p>
                  <p className="mt-2 text-xs font-semibold text-stone-500">ถ้าเปิดรับของเข้าเลย ของจะเข้าคลังนี้</p>
                </div>
              </div>
            </section>

            <section className="space-y-4 border-t border-stone-200 pt-5">
              <div>
                <h2 className="text-lg font-black text-ink">ราคาและการแจ้งเตือน</h2>
                <p className="mt-1 text-sm text-stone-600">จุดแจ้งเตือนใช้เตือนเมื่อยอดคงเหลือในคลังต่ำกว่าที่กำหนด</p>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                {pricingFieldNames.map(renderField)}
              </div>
            </section>

            {isVariantMode ? (
              <section className="space-y-4 border-t border-stone-200 pt-5">
                <div>
                  <h2 className="text-lg font-black text-ink">สี / ไซส์</h2>
                  <p className="mt-1 text-sm text-stone-600">กรอกเฉพาะมิติที่สินค้านี้ใช้ แยกหลายค่าด้วย comma หรือขึ้นบรรทัดใหม่</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-1">
                    <span className="text-sm font-semibold text-ink">สี</span>
                    <textarea className="field min-h-24" value={variantColorsInput} onChange={(event) => setVariantColorsInput(event.target.value)} placeholder="ดำ, ขาว, น้ำเงิน" />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-sm font-semibold text-ink">ไซส์</span>
                    <textarea className="field min-h-24" value={variantSizesInput} onChange={(event) => setVariantSizesInput(event.target.value)} placeholder="S, M, L, XL" />
                  </label>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="button" variant="secondary" icon={<SlidersHorizontal size={16} />} onClick={refreshVariantRows}>
                    สร้างตารางตัวเลือก
                  </Button>
                  {variantRows.length > 0 ? <span className="text-sm font-semibold text-stone-500">{number(variantRows.length)} variants</span> : null}
                </div>
                {variantRows.length > 0 ? (
                  <div className="overflow-x-auto rounded-md border border-stone-200">
                    <table className="min-w-[980px] w-full text-left text-sm">
                      <thead className="bg-stone-50 text-xs uppercase text-stone-500">
                        <tr>
                          {hasVariantColorRows ? <th className="px-3 py-2">สี</th> : null}
                          {hasVariantSizeRows ? <th className="px-3 py-2">ไซส์</th> : null}
                          <th className="px-3 py-2">SKU</th>
                          <th className="px-3 py-2">Barcode</th>
                          <th className="px-3 py-2">ทุน</th>
                          <th className="px-3 py-2">ขาย</th>
                          <th className="px-3 py-2">แจ้งเตือน</th>
                          {canReceiveProducts && isReceivePanelOpen ? <th className="px-3 py-2">รับเข้า</th> : null}
                          {canReceiveProducts && isReceivePanelOpen ? <th className="px-3 py-2">ทุนรับเข้า</th> : null}
                        </tr>
                      </thead>
                      <tbody>
                        {variantRows.map((row) => (
                          <tr key={row.id} className="border-t border-stone-100">
                            {hasVariantColorRows ? <td className="px-3 py-2 font-semibold text-ink">{row.color}</td> : null}
                            {hasVariantSizeRows ? <td className="px-3 py-2 font-semibold text-ink">{row.size}</td> : null}
                            <td className="px-3 py-2">
                              <input className="field min-w-44" value={row.sku} onChange={(event) => updateVariantRow(row.id, { sku: event.target.value })} />
                            </td>
                            <td className="px-3 py-2">
                              <input className="field min-w-40" value={row.barcode} onChange={(event) => updateVariantRow(row.id, { barcode: event.target.value })} placeholder="ไม่บังคับ" />
                            </td>
                            <td className="px-3 py-2">
                              <input className="field w-28" type="number" min={0} step="0.01" value={row.costPrice} onChange={(event) => updateVariantRow(row.id, { costPrice: Number(event.target.value) })} />
                            </td>
                            <td className="px-3 py-2">
                              <input className="field w-28" type="number" min={0} step="0.01" value={row.salePrice} onChange={(event) => updateVariantRow(row.id, { salePrice: Number(event.target.value) })} />
                            </td>
                            <td className="px-3 py-2">
                              <input className="field w-24" type="number" min={0} step={1} value={row.minStock} onChange={(event) => updateVariantRow(row.id, { minStock: Math.max(0, Math.trunc(Number(event.target.value) || 0)) })} />
                            </td>
                            {canReceiveProducts && isReceivePanelOpen ? (
                              <td className="px-3 py-2">
                                <input className="field w-24" type="number" min={0} step={1} value={row.receiveQuantity} onChange={(event) => updateVariantRow(row.id, { receiveQuantity: Math.max(0, Math.trunc(Number(event.target.value) || 0)) })} />
                              </td>
                            ) : null}
                            {canReceiveProducts && isReceivePanelOpen ? (
                              <td className="px-3 py-2">
                                <input className="field w-28" type="number" min={0} step="0.01" value={row.receiveUnitCost} onChange={(event) => updateVariantRow(row.id, { receiveUnitCost: Number(event.target.value) })} />
                              </td>
                            ) : null}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </section>
            ) : null}

            <section className="space-y-4 border-t border-stone-200 pt-5">
              <div>
                <h2 className="text-lg font-black text-ink">รูปและรายละเอียด</h2>
              </div>
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-ink">รูปหลักสินค้า</span>
                <div className="flex flex-wrap items-center gap-4 rounded-md border border-dashed border-stone-300 bg-stone-50 p-4">
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
              <label className="grid gap-1">
                <span className="text-sm font-semibold text-ink">รายละเอียดสินค้า / หมายเหตุ</span>
                <textarea className="field min-h-28" name="description" placeholder="เช่น สี รุ่น เงื่อนไขการขาย หรือรายละเอียดที่ทีมควรรู้" />
              </label>
            </section>

            {canReceiveProducts ? (
              <section className="space-y-4 border-t border-stone-200 pt-5">
                <div className={`rounded-md border p-4 shadow-sm transition ${
                  isReceivePanelOpen ? "border-teal-300 bg-teal-50" : "border-emerald-200 bg-emerald-50"
                }`}>
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-white text-leaf shadow-sm ring-1 ring-emerald-100">
                        <PackageCheck size={22} />
                      </span>
                      <div className="min-w-0">
                        <h2 className="text-lg font-black text-ink">รับของเข้าเลย</h2>
                        <p className="mt-1 text-sm leading-6 text-stone-700">สินค้าเข้าพร้อมกัน? เปิดช่องนี้เพื่อบันทึกใบรับเข้าและประวัติสต็อกเข้าคลังที่เลือกไว้ในครั้งเดียว</p>
                      </div>
                    </div>
                    <Button
                      className="w-full justify-center sm:w-auto"
                      type="button"
                      variant={isReceivePanelOpen ? "secondary" : undefined}
                      icon={isReceivePanelOpen ? <ChevronDown size={18} /> : <PackageCheck size={18} />}
                      aria-expanded={isReceivePanelOpen}
                      onClick={() => {
                        setError("");
                        setIsReceivePanelOpen((current) => !current);
                      }}
                    >
                      {isReceivePanelOpen ? "ซ่อนช่องรับเข้า" : "รับของเข้าเลย"}
                    </Button>
                  </div>
                </div>
                {isReceivePanelOpen ? (
                  <div className="grid gap-4 rounded-md border border-teal-100 bg-teal-50/40 p-4 md:grid-cols-2">
                    <div className="rounded-md border border-teal-100 bg-white p-3 text-sm md:col-span-2">
                      <p className="font-bold text-ink">รับเข้า: {selectedProductWarehouse?.name ?? "ยังไม่ได้เลือกคลัง"}</p>
                      <p className="mt-1 text-stone-500">{selectedProductWarehouse?.branch?.name ?? "เลือกคลังสำหรับสินค้าก่อนบันทึก"}</p>
                    </div>
                    <label className="grid gap-1">
                      <span className="text-sm font-semibold text-ink">จำนวนรับเข้า</span>
                      <input
                        className="field"
                        type="number"
                        min={1}
                        step={1}
                        value={receiveQuantity}
                        onChange={(event) => setReceiveQuantity(Math.max(0, Math.floor(Number(event.target.value) || 0)))}
                      />
                    </label>
                    <label className="grid gap-1">
                      <span className="text-sm font-semibold text-ink">ต้นทุนรับเข้าต่อหน่วย</span>
                      <input
                        className="field"
                        type="number"
                        min={0}
                        step="0.01"
                        value={receiveUnitCost}
                        placeholder={costPriceInput || "0.00"}
                        onChange={(event) => {
                          setIsReceiveUnitCostTouched(true);
                          setReceiveUnitCost(event.target.value);
                        }}
                      />
                    </label>
                    <label className="grid gap-1">
                      <span className="text-sm font-semibold text-ink">ซัพพลายเออร์</span>
                      <input className="field" name="receiveSupplier" placeholder="เช่น บริษัท/ร้านค้าที่ส่งสินค้า" />
                    </label>
                    <label className="grid gap-1 md:col-span-2">
                      <span className="text-sm font-semibold text-ink">หมายเหตุ / เลขเอกสาร</span>
                      <input className="field" name="receiveNote" placeholder="เช่น เลขใบส่งของ หรือรายละเอียดเพิ่มเติม" />
                    </label>
                  </div>
                ) : null}
              </section>
            ) : null}

            {error ? <p className="flex items-center gap-2 rounded-md bg-red-50 p-3 text-sm text-red-700"><AlertCircle size={16} />{error}</p> : null}
            <div className="flex flex-wrap gap-3 border-t border-stone-200 pt-5">
              <Button disabled={isSubmitting} icon={<Save size={18} />}>{isSubmitting ? "กำลังบันทึก..." : returnTo ? "บันทึกแล้วกลับหน้าก่อนหน้า" : "บันทึกสินค้า"}</Button>
              <Button type="button" variant="ghost" onClick={() => navigate(fallbackPath)}>ยกเลิก</Button>
            </div>
          </form>
        </Card>

        <div className="space-y-4">
          <Card>
            <div className="flex items-center gap-2">
              <PackageCheck size={18} className="text-leaf" />
              <h2 className="font-black text-ink">เพิ่มสินค้าเต็มรูปแบบ</h2>
            </div>
            <p className="mt-3 text-sm leading-6 text-stone-600">กรอกข้อมูลสินค้าให้ครบก่อน แล้วค่อยรับสินค้าเข้าเพื่อเก็บประวัติสต็อกอย่างเป็นระบบ</p>
          </Card>
          <Card>
            <div className="flex items-center gap-2">
              <Boxes size={18} className="text-leaf" />
              <h2 className="font-black text-ink">ต้องใส่สต็อกต่อ?</h2>
            </div>
            <p className="mt-3 text-sm leading-6 text-stone-600">กด “รับของเข้าเลย” ในฟอร์มเพื่อเปิดช่องรับเข้าคลังทันที ระบบจะสร้างใบรับเข้าและประวัติสต็อกพร้อมกับสินค้า</p>
          </Card>
        </div>
      </div>

      {pendingVariantGroup ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4" role="dialog" aria-modal="true" aria-labelledby="variant-confirm-title" onMouseDown={() => !isSubmitting && setPendingVariantGroup(null)}>
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b border-stone-200 p-5">
              <div>
                <p className="text-xs font-black uppercase text-teal-700">ยืนยันสร้างสินค้าแบบหลายตัวเลือก</p>
                <h2 id="variant-confirm-title" className="mt-1 text-2xl font-black text-ink">{pendingVariantGroup.name}</h2>
                <p className="mt-1 text-sm leading-6 text-stone-600">ระบบจะสร้าง {number(pendingVariantGroup.variants.length)} SKU ในกลุ่มเดียวกัน</p>
              </div>
              <button
                type="button"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-stone-200 text-stone-600 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="ปิดหน้าต่างยืนยันสร้าง variant"
                disabled={isSubmitting}
                onClick={() => setPendingVariantGroup(null)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="overflow-y-auto p-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-md bg-stone-50 p-3">
                  <p className="text-xs font-bold text-stone-500">SKU prefix</p>
                  <p className="mt-1 font-black text-ink">{pendingVariantGroup.skuPrefix}</p>
                </div>
                <div className="rounded-md bg-stone-50 p-3">
                  <p className="text-xs font-bold text-stone-500">คลังสินค้า</p>
                  <p className="mt-1 font-black text-ink">{pendingVariantGroup.warehouseName}</p>
                </div>
                <div className="rounded-md bg-stone-50 p-3">
                  <p className="text-xs font-bold text-stone-500">รับเข้ารวม</p>
                  <p className="mt-1 font-black text-ink">{number(pendingVariantGroup.variants.reduce((sum, row) => sum + row.receiveQuantity, 0))}</p>
                </div>
              </div>
              <div className="mt-4 max-h-80 overflow-y-auto rounded-md border border-stone-200">
                <table className="w-full table-fixed text-left text-sm">
                  <thead className="bg-stone-50 text-xs uppercase text-stone-500">
                    <tr>
                      {pendingVariantHasColor ? <th className="px-3 py-2">สี</th> : null}
                      {pendingVariantHasSize ? <th className="px-3 py-2">ไซส์</th> : null}
                      <th className="px-3 py-2">SKU</th>
                      <th className="px-3 py-2">Barcode</th>
                      <th className="px-3 py-2">ขาย</th>
                      <th className="px-3 py-2">รับเข้า</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingVariantGroup.variants.map((row) => (
                      <tr key={`${row.color ?? ""}-${row.size ?? ""}-${row.sku}`} className="border-t border-stone-100">
                        {pendingVariantHasColor ? (
                          <td className="px-3 py-2 font-semibold text-ink">
                            <span className="block truncate" title={row.color ?? ""}>{row.color}</span>
                          </td>
                        ) : null}
                        {pendingVariantHasSize ? (
                          <td className="px-3 py-2 font-semibold text-ink">
                            <span className="block truncate" title={row.size ?? ""}>{row.size}</span>
                          </td>
                        ) : null}
                        <td className="px-3 py-2">
                          <span className="block truncate font-semibold text-stone-700" title={row.sku}>{row.sku}</span>
                        </td>
                        <td className="px-3 py-2">
                          <span className="block truncate" title={row.barcode ?? "-"}>{row.barcode ?? "-"}</span>
                        </td>
                        <td className="px-3 py-2 font-semibold text-ink">{baht(row.salePrice)}</td>
                        <td className="px-3 py-2">
                          <span className="block truncate">{number(row.receiveQuantity)} {pendingVariantGroup.unit}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-stone-200 bg-stone-50 p-4">
              <Button type="button" variant="ghost" disabled={isSubmitting} onClick={() => setPendingVariantGroup(null)}>กลับไปแก้ไข</Button>
              <Button type="button" icon={<Save size={16} />} disabled={isSubmitting} onClick={confirmCreateVariantGroup}>
                {isSubmitting ? "กำลังบันทึก..." : "ยืนยันสร้าง variants"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingProduct ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4" role="dialog" aria-modal="true" aria-labelledby="product-confirm-title" onMouseDown={() => !isSubmitting && setPendingProduct(null)}>
          <div className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b border-stone-200 p-5">
              <div>
                <p className="text-xs font-black uppercase text-teal-700">ยืนยันสร้างสินค้า</p>
                <h2 id="product-confirm-title" className="mt-1 text-2xl font-black text-ink">ตรวจข้อมูลก่อนบันทึก</h2>
                <p className="mt-1 text-sm leading-6 text-stone-600">ระบบจะสร้างสินค้าใหม่ และรับเข้าสต็อกด้วยถ้าเปิดรายการรับเข้าไว้</p>
              </div>
              <button
                type="button"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-stone-200 text-stone-600 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="ปิดหน้าต่างยืนยันสร้างสินค้า"
                disabled={isSubmitting}
                onClick={() => setPendingProduct(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="overflow-y-auto p-5">
              <div className="flex gap-4 rounded-md border border-stone-200 p-4">
                {imagePreview ? (
                  <img src={imagePreview} alt="ตัวอย่างรูปสินค้า" className="h-16 w-16 shrink-0 rounded-md border border-stone-200 object-cover" />
                ) : (
                  <ProductImageThumb product={{ name: pendingProduct.name, imagePath: null }} className="h-16 w-16 shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="truncate text-lg font-black text-ink">{pendingProduct.name}</p>
                  <p className="mt-1 text-sm text-stone-500">SKU {pendingProduct.sku}</p>
                  <p className="mt-1 text-sm text-stone-500">{pendingProduct.categoryName ?? "ไม่จัดหมวด"} / {pendingProduct.unit}</p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-md bg-stone-50 p-3">
                  <p className="text-xs font-bold text-stone-500">ราคาทุน</p>
                  <p className="mt-1 font-black text-ink">{baht(pendingProduct.costPrice)}</p>
                </div>
                <div className="rounded-md bg-stone-50 p-3">
                  <p className="text-xs font-bold text-stone-500">ราคาขาย</p>
                  <p className="mt-1 font-black text-ink">{baht(pendingProduct.salePrice)}</p>
                </div>
                <div className="rounded-md bg-stone-50 p-3">
                  <p className="text-xs font-bold text-stone-500">จุดแจ้งเตือน</p>
                  <p className="mt-1 font-black text-ink">{number(pendingProduct.minStock)}</p>
                </div>
              </div>

              <div className="mt-4 rounded-md border border-stone-200 bg-stone-50 p-3 text-sm">
                <p><span className="font-bold text-stone-600">คลังสินค้า:</span> {pendingProduct.warehouseName}</p>
                {pendingProduct.warehouseBranchName ? <p className="mt-1"><span className="font-bold text-stone-600">สาขา:</span> {pendingProduct.warehouseBranchName}</p> : null}
                {pendingProduct.barcode ? <p className="mt-1"><span className="font-bold text-stone-600">Barcode:</span> {pendingProduct.barcode}</p> : null}
                {pendingProduct.brandName ? <p className="mt-1"><span className="font-bold text-stone-600">แบรนด์:</span> {pendingProduct.brandName}</p> : null}
                {pendingProduct.imageName ? <p className="mt-1"><span className="font-bold text-stone-600">รูปสินค้า:</span> {pendingProduct.imageName}</p> : null}
              </div>

              {pendingProduct.receiveNow ? (
                <div className="mt-4 rounded-md border border-teal-100 bg-teal-50/60 p-3 text-sm">
                  <p className="font-black text-ink">รับของเข้าเลย</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    <div>
                      <p className="text-xs font-bold text-stone-500">จำนวน</p>
                      <p className="mt-1 font-black text-ink">{number(pendingProduct.receiveNow.quantity)} {pendingProduct.unit}</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-stone-500">ต้นทุนต่อหน่วย</p>
                      <p className="mt-1 font-black text-ink">{baht(pendingProduct.receiveNow.unitCost)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-stone-500">ต้นทุนรวม</p>
                      <p className="mt-1 font-black text-ink">{baht(pendingProduct.receiveNow.quantity * pendingProduct.receiveNow.unitCost)}</p>
                    </div>
                  </div>
                  {pendingProduct.receiveNow.supplier ? <p className="mt-2"><span className="font-bold text-stone-600">ซัพพลายเออร์:</span> {pendingProduct.receiveNow.supplier}</p> : null}
                  {pendingProduct.receiveNow.note ? <p className="mt-1"><span className="font-bold text-stone-600">หมายเหตุ:</span> {pendingProduct.receiveNow.note}</p> : null}
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-stone-200 bg-stone-50 p-4">
              <Button type="button" variant="ghost" disabled={isSubmitting} onClick={() => setPendingProduct(null)}>กลับไปแก้ไข</Button>
              <Button type="button" icon={<Save size={16} />} disabled={isSubmitting} onClick={confirmCreateProduct}>
                {isSubmitting ? "กำลังบันทึก..." : "ยืนยันสร้างสินค้า"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {createdVariantGroup ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4" role="dialog" aria-modal="true" aria-labelledby="variant-success-title" onMouseDown={() => setCreatedVariantGroup(null)}>
          <div className="w-full max-w-md overflow-hidden rounded-lg bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="p-6 text-center">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-emerald-700">
                <CircleCheck size={30} />
              </span>
              <h2 id="variant-success-title" className="mt-4 text-2xl font-black text-ink">สร้าง variants เรียบร้อย</h2>
              <p className="mt-2 text-sm leading-6 text-stone-600">{createdVariantGroup.name} ถูกสร้างทั้งหมด {number(createdVariantGroup.products.length)} SKU แล้ว</p>
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-stone-200 bg-stone-50 p-4">
              <Button type="button" variant="secondary" onClick={() => setCreatedVariantGroup(null)}>สร้างอีกสินค้า</Button>
              <Button
                type="button"
                icon={<Eye size={16} />}
                onClick={() => {
                  const firstProduct = createdVariantGroup.products[0];
                  if (firstProduct) navigate(`/app/products/${firstProduct.id}`);
                  else navigate("/app/products");
                }}
              >
                ดู SKU แรก
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {createdProduct && createdProductSummary ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4" role="dialog" aria-modal="true" aria-labelledby="product-success-title" onMouseDown={() => setCreatedProduct(null)}>
          <div className="w-full max-w-md overflow-hidden rounded-lg bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="p-6 text-center">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-emerald-700">
                <CircleCheck size={30} />
              </span>
              <h2 id="product-success-title" className="mt-4 text-2xl font-black text-ink">สร้างสินค้าเรียบร้อย</h2>
              <p className="mt-2 text-sm leading-6 text-stone-600">{createdProduct.name} ถูกเพิ่มใน {createdProductSummary.warehouseName} แล้ว</p>

              <div className="mt-5 grid grid-cols-3 gap-2 text-sm">
                <div className="rounded-md bg-stone-50 p-3">
                  <p className="text-xs font-bold text-stone-500">ราคาขาย</p>
                  <p className="mt-1 text-lg font-black text-ink">{baht(createdProductSummary.salePrice)}</p>
                </div>
                <div className="rounded-md bg-stone-50 p-3">
                  <p className="text-xs font-bold text-stone-500">รับเข้า</p>
                  <p className="mt-1 text-lg font-black text-ink">{createdProductSummary.receiveNow ? number(createdProductSummary.receiveNow.quantity) : "0"}</p>
                </div>
                <div className="rounded-md bg-stone-50 p-3">
                  <p className="text-xs font-bold text-stone-500">แจ้งเตือน</p>
                  <p className="mt-1 text-lg font-black text-ink">{number(createdProductSummary.minStock)}</p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-stone-200 bg-stone-50 p-4">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setCreatedProduct(null);
                  setCreatedProductSummary(null);
                }}
              >
                สร้างอีกสินค้า
              </Button>
              <Button
                type="button"
                icon={<Eye size={16} />}
                onClick={() => {
                  if (returnTo) navigate(addProductIdToPath(returnTo, createdProduct.id));
                  else navigate(`/app/products/${createdProduct.id}`);
                }}
              >
                {returnTo ? "กลับหน้าก่อนหน้า" : "ดูสินค้า"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
