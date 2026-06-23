import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ChevronDown, History, Search } from "lucide-react";
import { Card } from "../components/Card";
import { api } from "../lib/api";
import { thaiDate } from "../lib/format";

type AuditLogItem = {
  id: string;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  createdAt: string;
  user?: { name: string; email: string } | null;
};

type AuditLogPageData = {
  items: AuditLogItem[];
  nextCursor?: string | null;
};

type BranchOption = { id: string; name: string; code?: string | null };
type WarehouseOption = { id: string; name: string; code?: string | null; branch?: BranchOption | null };
type ProductOption = { id: string; name: string; sku: string };
type CategoryOption = { id: string; name: string };
type AuditLookups = {
  branches: Map<string, BranchOption>;
  warehouses: Map<string, WarehouseOption>;
  products: Map<string, ProductOption>;
  categories: Map<string, CategoryOption>;
};

export function AuditLogPage() {
  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState("ALL");
  const [actionFilter, setActionFilter] = useState("ALL");
  const query = useQuery({ queryKey: ["audit-logs"], queryFn: () => api<AuditLogPageData>("/audit-logs?limit=100") });
  const branches = useQuery({ queryKey: ["audit-log-branches"], queryFn: () => api<BranchOption[]>("/branches") });
  const warehouses = useQuery({ queryKey: ["audit-log-warehouses"], queryFn: () => api<WarehouseOption[]>("/warehouses?scope=business") });
  const products = useQuery({ queryKey: ["audit-log-products"], queryFn: () => api<ProductOption[]>("/products?status=ACTIVE,PAUSED,DISCONTINUED,ARCHIVED") });
  const categories = useQuery({ queryKey: ["audit-log-categories"], queryFn: () => api<CategoryOption[]>("/categories") });
  const items = query.data?.items ?? [];
  const lookups = useMemo<AuditLookups>(() => ({
    branches: new Map((branches.data ?? []).map((branch) => [branch.id, branch])),
    warehouses: new Map((warehouses.data ?? []).map((warehouse) => [warehouse.id, warehouse])),
    products: new Map((products.data ?? []).map((product) => [product.id, product])),
    categories: new Map((categories.data ?? []).map((category) => [category.id, category]))
  }), [branches.data, categories.data, products.data, warehouses.data]);
  const filteredItems = useMemo(() => filterAuditLogs(items, { search, entity: entityFilter, action: actionFilter }, lookups), [items, search, entityFilter, actionFilter, lookups]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-black">Audit Log</h1>
        <p className="text-stone-600">ประวัติการแก้ไขข้อมูลและกิจกรรมสำคัญของร้าน</p>
      </div>
      {query.isLoading ? <Card>กำลังโหลด audit log...</Card> : null}
      {query.error ? <Card className="text-red-700">โหลด audit log ไม่สำเร็จ: {query.error.message}</Card> : null}
      <Card className="grid gap-3 lg:grid-cols-[1fr_12rem_14rem]">
        <label className="field-icon-wrap">
          <Search className="field-icon" size={17} />
          <input className="field field-with-left-icon" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหาชื่อสินค้า SKU ผู้ทำรายการ หรือรายละเอียด" />
        </label>
        <select className="field" value={entityFilter} onChange={(event) => setEntityFilter(event.target.value)}>
          <option value="ALL">ทุกประเภทข้อมูล</option>
          <option value="Product">สินค้า</option>
          <option value="StockAdjustment">ปรับสต็อก</option>
          <option value="Sale">การขาย</option>
          <option value="Branch">สาขา</option>
          <option value="Warehouse">คลัง</option>
        </select>
        <select className="field" value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}>
          <option value="ALL">ทุกกิจกรรม</option>
          <option value="product.update">แก้ไขข้อมูลสินค้า</option>
          <option value="product.bulk_category_update">เปลี่ยนหมวดหมู่สินค้า</option>
          <option value="product.reactivate">เปิดใช้งานสินค้า</option>
          <option value="product.pause">พักขายสินค้า</option>
          <option value="product.archive">เก็บสินค้า</option>
          <option value="product.restore">กู้คืนสินค้า</option>
          <option value="stock_adjustment.request">ขอปรับสต็อก</option>
          <option value="stock_adjustment.apply">ปรับสต็อกทันที</option>
          <option value="stock_adjustment.approve">อนุมัติปรับสต็อก</option>
          <option value="stock_adjustment.reject">ปฏิเสธปรับสต็อก</option>
        </select>
      </Card>
      <Card className="space-y-3">
        {items.length === 0 && !query.isLoading ? <p className="rounded-md border border-dashed border-stone-300 p-5 text-center font-semibold text-stone-500">ยังไม่มี audit log</p> : null}
        {items.length > 0 && filteredItems.length === 0 ? <p className="rounded-md border border-dashed border-stone-300 p-5 text-center font-semibold text-stone-500">ไม่พบ audit log ที่ตรงกับตัวกรอง</p> : null}
        {filteredItems.map((item) => (
          <AuditLogRow key={item.id} item={item} lookups={lookups} />
        ))}
      </Card>
    </div>
  );
}

function AuditLogRow({ item, lookups }: { item: AuditLogItem; lookups: AuditLookups }) {
  const actor = item.user?.name ?? item.user?.email ?? "ระบบ";
  const safeBefore = sanitizeAuditPayload(item.entity, item.before);
  const safeAfter = sanitizeAuditPayload(item.entity, item.after);
  const changes = auditChanges(safeBefore, safeAfter);
  const target = auditTarget({ ...item, before: safeBefore, after: safeAfter }, lookups);

  return (
    <article className="grid gap-3 rounded-md border border-stone-200 bg-white p-4 md:grid-cols-[2.5rem_1fr]">
      <span className="grid h-10 w-10 place-items-center rounded-md bg-teal-50 text-leaf">
        <History size={18} />
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-stone-100 px-2 py-0.5 text-xs font-black text-stone-700">{entityLabel(item.entity)}</span>
          <span className="font-black text-ink">{actionLabel(item.action)}</span>
          <span className="text-sm font-semibold text-stone-500">{thaiDate(item.createdAt)}</span>
        </div>
        <p className="mt-1 text-sm text-stone-600">
          {actor} {actionLabel(item.action)}
          {item.entityId ? <span className="font-mono text-xs text-stone-500"> #{shortId(item.entityId)}</span> : null}
        </p>
        {target ? (
          <div className="mt-3 rounded-md bg-stone-50 p-3">
            <p className="font-black text-ink">{target.name}</p>
            {target.meta ? <p className="mt-1 text-sm font-semibold text-stone-500">{target.meta}</p> : null}
          </div>
        ) : null}
        <ChangeSummary changes={changes} lookups={lookups} actor={actor} />
        <AuditDetails changes={changes} lookups={lookups} actor={actor} before={safeBefore} after={safeAfter} />
      </div>
    </article>
  );
}

function ChangeSummary({ changes, lookups, actor }: { changes: AuditChange[]; lookups: AuditLookups; actor: string }) {
  if (changes.length === 0) return <p className="mt-3 rounded-md bg-stone-50 p-3 text-sm font-semibold text-stone-500">ไม่มีรายละเอียดการเปลี่ยนแปลง</p>;
  const stockChange = changes.find((change) => change.field === "stockOnHand");
  const statusChange = changes.find((change) => change.field === "status" && !isEmptyAuditValue(change.before));
  const quantity = changes.find((change) => change.field === "quantity");
  const reason = changes.find((change) => change.field === "reason");
  const fallback = changes.slice(0, 3).map((change) =>
    isEmptyAuditValue(change.before)
      ? `${fieldLabel(change.field)}: ${formatAuditValue(change.field, change.after, lookups, actor)}`
      : `${fieldLabel(change.field)} ${formatAuditValue(change.field, change.before, lookups, actor)} -> ${formatAuditValue(change.field, change.after, lookups, actor)}`
  );
  if (!stockChange && !statusChange && !quantity && !reason) {
    return <p className="mt-3 rounded-md bg-stone-50 p-3 text-sm font-semibold text-stone-700">{fallback.join(" · ")}</p>;
  }
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md bg-stone-50 p-3 text-sm font-semibold text-stone-700">
      {stockChange ? <StockChangeBadge before={stockChange.before} after={stockChange.after} lookups={lookups} actor={actor} /> : null}
      {statusChange ? <StatusChangeBadge before={statusChange.before} after={statusChange.after} lookups={lookups} actor={actor} /> : null}
      {quantity ? <QuantityBadge value={quantity.after} /> : null}
      {reason ? <span className="min-w-0 break-words">เหตุผล: {formatAuditValue("reason", reason.after, lookups, actor)}</span> : null}
    </div>
  );
}

function StockChangeBadge({ before, after, lookups, actor }: { before: unknown; after: unknown; lookups: AuditLookups; actor: string }) {
  const beforeNumber = Number(before ?? 0);
  const afterNumber = Number(after ?? 0);
  const delta = afterNumber - beforeNumber;
  const tone = delta < 0 ? "red" : delta > 0 ? "green" : "stone";
  const toneClass = {
    red: "bg-red-50 text-red-700 ring-red-100",
    green: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    stone: "bg-stone-100 text-stone-700 ring-stone-200"
  }[tone];
  const deltaText = delta > 0 ? `+${delta}` : String(delta);
  return (
    <span className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-black ring-1 ${toneClass}`}>
      สต็อกคงเหลือ {formatAuditValue("stockOnHand", before, lookups, actor)} {"->"} {formatAuditValue("stockOnHand", after, lookups, actor)}
      <span>({deltaText})</span>
    </span>
  );
}

function QuantityBadge({ value }: { value: unknown }) {
  const quantity = Number(value ?? 0);
  const tone = quantity < 0 ? "bg-red-50 text-red-700 ring-red-100" : quantity > 0 ? "bg-emerald-50 text-emerald-700 ring-emerald-100" : "bg-stone-100 text-stone-700 ring-stone-200";
  const label = quantity > 0 ? `+${quantity}` : String(quantity);
  return <span className={`inline-flex rounded px-2 py-1 text-xs font-black ring-1 ${tone}`}>จำนวนที่ปรับ {label}</span>;
}

function StatusChangeBadge({ before, after, lookups, actor }: { before: unknown; after: unknown; lookups: AuditLookups; actor: string }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1 text-xs font-black">
      สถานะ
      <StatusBadge value={before} lookups={lookups} actor={actor} />
      <span className="text-stone-400">{"->"}</span>
      <StatusBadge value={after} lookups={lookups} actor={actor} />
    </span>
  );
}

function StatusBadge({ value, lookups, actor }: { value: unknown; lookups: AuditLookups; actor: string }) {
  return (
    <span className={auditValueBadgeClass("status", value) ?? "inline-flex rounded bg-stone-100 px-2 py-1 text-xs font-black text-stone-700 ring-1 ring-stone-200"}>
      {formatAuditValue("status", value, lookups, actor)}
    </span>
  );
}

function AuditDetails({ changes, lookups, actor, before, after }: { changes: AuditChange[]; lookups: AuditLookups; actor: string; before: unknown; after: unknown }) {
  if (changes.length === 0 && !before && !after) return null;
  return (
    <details className="group mt-3 rounded-md bg-stone-50 px-3 py-2 text-sm text-stone-600">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-black text-stone-600">
        <ChevronDown size={16} className="transition group-open:rotate-180" />
        ดูรายละเอียด
      </summary>
      <div className="mt-3 space-y-3">
        <ChangeList changes={changes} lookups={lookups} actor={actor} />
        <RawDetails before={before} after={after} />
      </div>
    </details>
  );
}

function ChangeList({ changes, lookups, actor }: { changes: AuditChange[]; lookups: AuditLookups; actor: string }) {
  if (changes.length === 0) return <p className="mt-3 rounded-md bg-stone-50 p-3 text-sm font-semibold text-stone-500">ไม่มีรายละเอียดการเปลี่ยนแปลง</p>;
  const beforeAfterChanges = changes.filter((change) => !isEmptyAuditValue(change.before));
  const detailChanges = changes.filter((change) => isEmptyAuditValue(change.before));
  return (
    <div className="mt-3 space-y-3">
      {beforeAfterChanges.length > 0 ? <BeforeAfterTable changes={beforeAfterChanges} lookups={lookups} actor={actor} /> : null}
      {detailChanges.length > 0 ? <DetailTable changes={detailChanges} lookups={lookups} actor={actor} /> : null}
    </div>
  );
}

function BeforeAfterTable({ changes, lookups, actor }: { changes: AuditChange[]; lookups: AuditLookups; actor: string }) {
  return (
    <div className="overflow-hidden rounded-md border border-stone-200">
      <div className="hidden grid-cols-[1fr_1.2fr_1.2fr] gap-3 bg-stone-50 px-3 py-2 text-xs font-black text-stone-500 md:grid">
        <span>รายการ</span>
        <span>ก่อน</span>
        <span>หลัง</span>
      </div>
      <div className="divide-y divide-stone-100">
        {changes.map((change) => (
          <div key={change.field} className="grid gap-2 px-3 py-3 text-sm md:grid-cols-[1fr_1.2fr_1.2fr] md:gap-3">
            <div className="font-black text-ink">{fieldLabel(change.field)}</div>
            <ValueCell field={change.field} label="ก่อน" value={change.before} tone="muted" lookups={lookups} actor={actor} />
            <ValueCell field={change.field} label="หลัง" value={change.after} tone="strong" lookups={lookups} actor={actor} />
          </div>
        ))}
      </div>
    </div>
  );
}

function DetailTable({ changes, lookups, actor }: { changes: AuditChange[]; lookups: AuditLookups; actor: string }) {
  return (
    <div className="overflow-hidden rounded-md border border-stone-200">
      <div className="hidden grid-cols-[1fr_2.4fr] gap-3 bg-stone-50 px-3 py-2 text-xs font-black text-stone-500 md:grid">
        <span>รายละเอียด</span>
        <span>ค่า</span>
      </div>
      <div className="divide-y divide-stone-100">
        {changes.map((change) => (
          <div key={change.field} className="grid gap-2 px-3 py-3 text-sm md:grid-cols-[1fr_2.4fr] md:gap-3">
            <div className="font-black text-ink">{fieldLabel(change.field)}</div>
            <ValueCell field={change.field} label="ค่า" value={change.after} tone="strong" lookups={lookups} actor={actor} />
          </div>
        ))}
      </div>
    </div>
  );
}

function isEmptyAuditValue(value: unknown) {
  return value === undefined || value === null || value === "";
}

function ValueCell({ field, label, value, tone, lookups, actor }: { field: string; label: string; value: unknown; tone: "muted" | "strong"; lookups: AuditLookups; actor: string }) {
  const badgeClass = auditValueBadgeClass(field, value);
  return (
    <div className={tone === "strong" ? "font-semibold text-ink" : "text-stone-600"}>
      <span className="mr-2 text-xs font-black text-stone-400 md:hidden">{label}</span>
      <span className={badgeClass ?? "break-words"}>{formatAuditValue(field, value, lookups, actor)}</span>
    </div>
  );
}

function RawDetails({ before, after }: { before: unknown; after: unknown }) {
  if (!before && !after) return null;
  return (
    <details className="group rounded-md bg-white px-3 py-2 text-sm text-stone-600 ring-1 ring-stone-200">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-black text-stone-600">
        <ChevronDown size={16} className="transition group-open:rotate-180" />
        ดูข้อมูลดิบ
      </summary>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <JsonBlock label="ก่อน" value={before} />
        <JsonBlock label="หลัง" value={after} />
      </div>
    </details>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="min-w-0 rounded-md bg-white p-3 ring-1 ring-stone-200">
      <p className="mb-2 text-xs font-black text-stone-500">{label}</p>
      <pre className="max-h-44 overflow-auto whitespace-pre-wrap break-words text-xs text-stone-700">{value ? JSON.stringify(value, null, 2) : "-"}</pre>
    </div>
  );
}

type AuditRecord = Record<string, unknown>;
type AuditChange = { field: string; before: unknown; after: unknown };

function auditChanges(before: unknown, after: unknown): AuditChange[] {
  const beforeRecord = toRecord(before);
  const afterRecord = toRecord(after);
  const fields = [...new Set([...Object.keys(beforeRecord), ...Object.keys(afterRecord)])].filter((field) => shouldShowAuditField(field, beforeRecord, afterRecord));
  return fields
    .filter((field) => !sameValue(beforeRecord[field], afterRecord[field]))
    .map((field) => ({ field, before: beforeRecord[field], after: afterRecord[field] }));
}

function shouldShowAuditField(field: string, beforeRecord: AuditRecord, afterRecord: AuditRecord) {
  if (hiddenAuditFields.has(field)) return false;
  if (field === "branchId" && (beforeRecord.branchName || afterRecord.branchName)) return false;
  if (field === "warehouseId" && (beforeRecord.warehouseName || afterRecord.warehouseName)) return false;
  if (field === "productId" && (beforeRecord.productName || afterRecord.productName)) return false;
  if (field === "categoryId" && (beforeRecord.categoryName || afterRecord.categoryName)) return false;
  if (field === "brandId" && (beforeRecord.brandName || afterRecord.brandName)) return false;
  if (field === "reviewedById" && (beforeRecord.reviewedByName || afterRecord.reviewedByName || beforeRecord.reviewedByEmail || afterRecord.reviewedByEmail)) return false;
  if (field === "reviewedByEmail" && (beforeRecord.reviewedByName || afterRecord.reviewedByName)) return false;
  return true;
}

function sanitizeAuditPayload(entity: string, payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const allowedFields = auditPayloadFields[entity] ?? auditPayloadFields.default;
  return Object.fromEntries(
    Object.entries(payload as AuditRecord)
      .filter(([field]) => allowedFields.has(field))
      .map(([field, value]) => [field, sanitizeAuditValue(value)])
  );
}

function sanitizeAuditValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(sanitizeAuditValue);
  if (typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as AuditRecord)
      .filter(([field]) => !sensitiveAuditFields.test(field))
      .map(([field, entry]) => [field, sanitizeAuditValue(entry)])
  );
}

function toRecord(value: unknown): AuditRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AuditRecord : {};
}

function sameValue(left: unknown, right: unknown) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function formatAuditValue(field: string, value: unknown, lookups: AuditLookups, actor = "ระบบ"): string {
  if (value === undefined || value === null || value === "") return "-";
  if (typeof value === "boolean") return value ? "ใช่" : "ไม่ใช่";
  if (typeof value === "number") return new Intl.NumberFormat("th-TH").format(value);
  if (typeof value === "string") return lookupAuditValue(field, value, lookups, actor) ?? valueLabel(value);
  if (Array.isArray(value)) return value.length === 0 ? "-" : value.map((item) => formatAuditValue(field, item, lookups, actor)).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function lookupAuditValue(field: string, value: string, lookups: AuditLookups, actor: string) {
  if (field === "branchId") {
    const branch = lookups.branches.get(value);
    return branch ? `${branch.name}${branch.code ? ` (${branch.code})` : ""}` : shortId(value);
  }
  if (field === "warehouseId") {
    const warehouse = lookups.warehouses.get(value);
    return warehouse ? `${warehouse.name}${warehouse.code ? ` (${warehouse.code})` : ""}` : shortId(value);
  }
  if (field === "productId") {
    const product = lookups.products.get(value);
    return product ? `${product.name} (${product.sku})` : shortId(value);
  }
  if (field === "categoryId") {
    const category = lookups.categories.get(value);
    return category?.name ?? shortId(value);
  }
  if (field === "adjustmentMode") return valueLabel(value);
  if (field === "reviewedById") return actor;
  return undefined;
}

function auditValueBadgeClass(field: string, value: unknown) {
  if (typeof value !== "string" || field !== "status") return undefined;
  const classes: Record<string, string> = {
    ACTIVE: "inline-flex rounded bg-emerald-50 px-2 py-0.5 text-xs font-black text-emerald-700 ring-1 ring-emerald-100",
    PAUSED: "inline-flex rounded bg-amber-50 px-2 py-0.5 text-xs font-black text-amber-700 ring-1 ring-amber-100",
    DISCONTINUED: "inline-flex rounded bg-stone-100 px-2 py-0.5 text-xs font-black text-stone-700 ring-1 ring-stone-200",
    ARCHIVED: "inline-flex rounded bg-slate-100 px-2 py-0.5 text-xs font-black text-slate-700 ring-1 ring-slate-200",
    APPROVED: "inline-flex rounded bg-emerald-50 px-2 py-0.5 text-xs font-black text-emerald-700 ring-1 ring-emerald-100",
    PENDING: "inline-flex rounded bg-sky-50 px-2 py-0.5 text-xs font-black text-sky-700 ring-1 ring-sky-100",
    REJECTED: "inline-flex rounded bg-red-50 px-2 py-0.5 text-xs font-black text-red-700 ring-1 ring-red-100"
  };
  return classes[value];
}

function valueLabel(value: string) {
  const labels: Record<string, string> = {
    ACTIVE: "เปิดใช้งาน",
    PAUSED: "พักขาย",
    DISCONTINUED: "เลิกขาย",
    ARCHIVED: "เก็บถาวร",
    APPROVED: "อนุมัติแล้ว",
    PENDING: "รออนุมัติ",
    REJECTED: "ปฏิเสธ",
    INCREASE: "เพิ่มสต็อก",
    DECREASE: "ลดสต็อก",
    SET_ACTUAL: "ตั้งยอดจริง",
    SET_TO: "ตั้งยอดคงเหลือ"
  };
  if (labels[value]) return labels[value];
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return thaiDate(value);
  return value;
}

function actionLabel(action: string) {
  const labels: Record<string, string> = {
    "product.update": "แก้ไขข้อมูลสินค้า",
    "product.bulk_category_update": "เปลี่ยนหมวดหมู่สินค้า",
    "product.reactivate": "เปิดใช้งานสินค้า",
    "product.archive": "เก็บสินค้า",
    "product.pause": "พักขายสินค้า",
    "product.restore": "กู้คืนสินค้า",
    "stock_adjustment.request": "ขอปรับสต็อก",
    "stock_adjustment.apply": "ปรับสต็อกทันที",
    "stock_adjustment.approve": "อนุมัติปรับสต็อก",
    "stock_adjustment.reject": "ปฏิเสธปรับสต็อก"
  };
  return labels[action] ?? action;
}

function entityLabel(entity: string) {
  const labels: Record<string, string> = {
    Product: "สินค้า",
    StockAdjustment: "ปรับสต็อก",
    Sale: "การขาย",
    Branch: "สาขา",
    Warehouse: "คลัง"
  };
  return labels[entity] ?? entity;
}

function fieldLabel(field: string) {
  const labels: Record<string, string> = {
    name: "ชื่อ",
    sku: "SKU",
    barcode: "Barcode",
    description: "รายละเอียด",
    unit: "หน่วย",
    costPrice: "ต้นทุน",
    salePrice: "ราคาขาย",
    minStock: "จุดแจ้งเตือน",
    categoryId: "หมวดหมู่",
    categoryName: "หมวดหมู่",
    brandId: "แบรนด์",
    brandName: "แบรนด์",
    status: "สถานะ",
    documentNo: "เลขที่เอกสาร",
    warehouseId: "คลัง",
    warehouseName: "คลัง",
    branchId: "สาขา",
    branchName: "สาขา",
    productId: "สินค้า",
    productName: "สินค้า",
    productSku: "SKU",
    quantity: "จำนวนที่ปรับ",
    stockOnHand: "สต็อกคงเหลือ",
    adjustmentMode: "วิธีปรับ",
    targetQuantity: "ยอดที่ต้องการ",
    reason: "เหตุผล",
    reviewedById: "ผู้อนุมัติ",
    reviewedByName: "ผู้อนุมัติ",
    reviewedByEmail: "อีเมลผู้อนุมัติ",
    reviewedAt: "เวลาอนุมัติ",
    rejectionReason: "เหตุผลที่ปฏิเสธ"
  };
  return labels[field] ?? field;
}

function shortId(value: string) {
  return value.length > 12 ? `${value.slice(0, 8)}...` : value;
}

function auditTarget(item: AuditLogItem, lookups: AuditLookups) {
  const before = toRecord(item.before);
  const after = toRecord(item.after);
  const productId = stringValue(after.productId) ?? stringValue(before.productId);
  const product = productId ? lookups.products.get(productId) : undefined;
  const name = stringValue(after.productName) ?? stringValue(before.productName) ?? stringValue(after.name) ?? stringValue(before.name) ?? product?.name;
  const sku = stringValue(after.productSku) ?? stringValue(before.productSku) ?? stringValue(after.sku) ?? stringValue(before.sku) ?? product?.sku;
  const documentNo = stringValue(after.documentNo) ?? stringValue(before.documentNo);
  if (item.entity === "Product" && name) return { name, meta: sku ? `SKU: ${sku}` : undefined };
  if (item.entity === "StockAdjustment" && documentNo) {
    const reason = stringValue(after.reason) ?? stringValue(before.reason);
    return { name: documentNo, meta: reason ? `เหตุผล: ${reason}` : undefined };
  }
  if (name) return { name, meta: sku ? `SKU: ${sku}` : undefined };
  return undefined;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function filterAuditLogs(items: AuditLogItem[], filters: { search: string; entity: string; action: string }, lookups: AuditLookups) {
  const query = filters.search.trim().toLocaleLowerCase();
  return items.filter((item) => {
    if (filters.entity !== "ALL" && item.entity !== filters.entity) return false;
    if (filters.action !== "ALL" && item.action !== filters.action) return false;
    if (!query) return true;
    return auditSearchText(item, lookups).toLocaleLowerCase().includes(query);
  });
}

function auditSearchText(item: AuditLogItem, lookups: AuditLookups) {
  const safeBefore = sanitizeAuditPayload(item.entity, item.before);
  const safeAfter = sanitizeAuditPayload(item.entity, item.after);
  const target = auditTarget({ ...item, before: safeBefore, after: safeAfter }, lookups);
  const changes = auditChanges(safeBefore, safeAfter)
    .map((change) => [fieldLabel(change.field), formatAuditValue(change.field, change.before, lookups), formatAuditValue(change.field, change.after, lookups)].join(" "))
    .join(" ");
  return [
    actionLabel(item.action),
    entityLabel(item.entity),
    item.user?.name,
    item.user?.email,
    item.entityId,
    target?.name,
    target?.meta,
    changes
  ].filter(Boolean).join(" ");
}

const hiddenAuditFields = new Set(["id", "createdAt", "updatedAt"]);
const auditPayloadFields: Record<string, Set<string>> = {
  Product: new Set(["name", "sku", "barcode", "description", "unit", "costPrice", "salePrice", "minStock", "categoryId", "categoryName", "brandId", "brandName", "status"]),
  StockAdjustment: new Set(["documentNo", "status", "warehouseId", "warehouseName", "branchId", "branchName", "productId", "productName", "productSku", "quantity", "stockOnHand", "adjustmentMode", "targetQuantity", "reason", "reviewedById", "reviewedByName", "reviewedByEmail", "reviewedAt", "rejectionReason"]),
  Branch: new Set(["name", "code", "status"]),
  Warehouse: new Set(["name", "code", "status", "type", "branchId"]),
  Sale: new Set(["receiptNo", "status", "total", "branchId", "warehouseId"]),
  default: new Set(["name", "code", "status", "action", "entity", "entityId", "reason"])
};
const sensitiveAuditFields = /(password|token|secret|key|signature|authorization|cookie|card|cvv|otp|session|hash|reset|magic|raw|payload|headers|ipAddress|ip)/i;
