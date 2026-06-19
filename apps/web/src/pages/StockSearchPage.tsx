import { useQuery } from "@tanstack/react-query";
import { ArrowRightLeft, Boxes, Eye, Image as ImageIcon, PackageSearch, Search, X } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { api } from "../lib/api";
import { number } from "../lib/format";
import { getProductImageUrl, getStockBadge, PRODUCT_STATUS_LABELS } from "../lib/products";
import { allLocations, buildTransferHref, stockedLocations, totalStock, type StockSearchProduct } from "../lib/stock-search";
import { useWorkingBranch } from "../state/working-branch";

type WarehouseOption = { id: string; branchId?: string; isDefault?: boolean; status?: "ACTIVE" | "INACTIVE"; branch?: { id: string; name: string } };

function productSearchPath(query: string) {
  const params = new URLSearchParams({ q: query.trim(), scope: "accessible" });
  return `/inventory/search?${params.toString()}`;
}

function ProductThumb({ product }: { product: StockSearchProduct }) {
  const imageUrl = getProductImageUrl(product);
  if (imageUrl) return <img src={imageUrl} alt={product.name} className="h-14 w-14 rounded-md border border-stone-200 object-cover" />;
  return (
    <span className="grid h-14 w-14 shrink-0 place-items-center rounded-md border border-dashed border-stone-300 bg-stone-50 text-stone-400">
      <ImageIcon size={22} />
    </span>
  );
}

function LocationRows({ product, workingBranchId, destinationWarehouseId }: { product: StockSearchProduct; workingBranchId?: string; destinationWarehouseId?: string }) {
  const stocked = stockedLocations(product);
  const rows = stocked.length > 0 ? stocked : allLocations(product);
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-stone-300 p-4 text-sm font-semibold text-stone-500">
        พบสินค้าในระบบ แต่ยังไม่มีรายการสต็อกในคลัง
      </div>
    );
  }

  return (
    <div className="table-shell">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="bg-stone-50 text-stone-500">
          <tr>
            <th className="p-3">สาขา</th>
            <th className="p-3">คลัง</th>
            <th className="p-3 text-right">คงเหลือ</th>
            <th className="p-3 text-right">จัดการ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((balance, index) => {
            const warehouseId = balance.warehouse?.id ?? balance.warehouseId ?? "";
            const branchId = balance.warehouse?.branch?.id;
            const branchName = balance.warehouse?.branch?.name ?? "ไม่ระบุสาขา";
            const warehouseName = balance.warehouse?.name ?? "ไม่ระบุคลัง";
            const isWorkingBranch = Boolean(workingBranchId && branchId === workingBranchId);
            const canRequest = Boolean(warehouseId && balance.quantity > 0);
            return (
              <tr key={`${warehouseId}-${index}`} className="border-t border-stone-100">
                <td className="p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink">{branchName}</span>
                    {branchId ? (
                      <span className={`rounded px-2 py-0.5 text-xs font-bold ${isWorkingBranch ? "bg-teal-50 text-teal-700" : "bg-amber-50 text-amber-800"}`}>
                        {isWorkingBranch ? "สาขาทำงาน" : "สาขาอื่น"}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="p-3 text-stone-600">{warehouseName}</td>
                <td className={`p-3 text-right font-black ${balance.quantity > 0 ? "text-leaf" : "text-stone-400"}`}>
                  {number(balance.quantity)} {product.unit}
                </td>
                <td className="p-3">
                  <div className="flex justify-end gap-2">
                    <Link to={`/app/products/${product.id}`}>
                      <Button className="h-9 px-3" variant="ghost" icon={<Eye size={16} />}>ดูสินค้า</Button>
                    </Link>
                    {canRequest ? (
                      <Link to={buildTransferHref(product.id, warehouseId, destinationWarehouseId)}>
                        <Button className="h-9 px-3" variant="secondary" icon={<ArrowRightLeft size={16} />}>
                          {isWorkingBranch ? "โอนสินค้า" : "ขอสินค้า"}
                        </Button>
                      </Link>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StockSearchResult({ product, workingBranchId, destinationWarehouseId }: { product: StockSearchProduct; workingBranchId?: string; destinationWarehouseId?: string }) {
  const stock = totalStock(product);
  const stockBadge = getStockBadge(product);
  const statusBadge = PRODUCT_STATUS_LABELS[product.status];
  const locationCount = stockedLocations(product).length;

  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 gap-3">
          <ProductThumb product={product} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-black text-ink">{product.name}</h2>
              <span className={`rounded px-2 py-1 text-xs font-bold ${statusBadge.className}`}>{statusBadge.label}</span>
              <span className={`rounded px-2 py-1 text-xs font-bold ${stockBadge.className}`}>{stockBadge.label}</span>
            </div>
            <p className="mt-1 text-sm font-semibold text-stone-500">
              SKU {product.sku}{product.barcode ? ` / Barcode ${product.barcode}` : ""}
            </p>
            <p className="mt-1 text-xs text-stone-500">
              {[product.category?.name, product.brand?.name].filter(Boolean).join(" • ") || "ไม่ระบุหมวดหมู่/แบรนด์"}
            </p>
          </div>
        </div>
        <div className="grid min-w-[220px] grid-cols-2 gap-2 text-right">
          <div className="rounded-md bg-teal-50 p-3">
            <p className="text-xs font-bold text-teal-700">รวมทั้งร้าน</p>
            <p className="mt-1 text-xl font-black text-leaf">{number(stock)} {product.unit}</p>
          </div>
          <div className="rounded-md bg-stone-50 p-3">
            <p className="text-xs font-bold text-stone-500">จุดแจ้งเตือน</p>
            <p className="mt-1 text-xl font-black text-ink">{number(product.minStock)} {product.unit}</p>
          </div>
        </div>
      </div>

      {stock <= 0 ? (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          สินค้านี้มีในระบบ แต่ยังไม่พบสต็อกคงเหลือในคลัง
        </div>
      ) : stock <= product.minStock ? (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
          สต็อกเหลือต่ำกว่าหรือเท่ากับจุดแจ้งเตือน และพบของอยู่ {number(locationCount)} คลัง
        </div>
      ) : null}

      <LocationRows product={product} workingBranchId={workingBranchId} destinationWarehouseId={destinationWarehouseId} />
    </Card>
  );
}

export function StockSearchPage() {
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const trimmedQuery = query.trim();
  const canSearch = draft.trim().length >= 2;
  const workingBranchId = useWorkingBranch((state) => state.workingBranchId);
  const warehouses = useQuery({ queryKey: ["warehouses", "stock-search", "business"], queryFn: () => api<WarehouseOption[]>("/warehouses?scope=business") });
  const destinationWarehouseId = useMemo(() => {
    const active = (warehouses.data ?? []).filter((warehouse) => (warehouse.status ?? "ACTIVE") === "ACTIVE");
    const workingWarehouses = active.filter((warehouse) => (warehouse.branchId ?? warehouse.branch?.id) === workingBranchId);
    return (workingWarehouses.find((warehouse) => warehouse.isDefault) ?? workingWarehouses[0])?.id;
  }, [warehouses.data, workingBranchId]);
  const search = useQuery({
    queryKey: ["inventory-search", trimmedQuery, "accessible"],
    queryFn: () => api<StockSearchProduct[]>(productSearchPath(trimmedQuery)),
    enabled: trimmedQuery.length >= 2
  });
  const results = useMemo(() => search.data ?? [], [search.data]);
  const totalProducts = results.length;
  const totalLocations = results.reduce((sum, product) => sum + stockedLocations(product).length, 0);
  const totalUnits = results.reduce((sum, product) => sum + totalStock(product), 0);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSearch) return;
    setQuery(draft.trim());
  }

  function clear() {
    setDraft("");
    setQuery("");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-ink">ค้นหาสต็อก</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-stone-600">เช็คสินค้าทุกสาขาที่เข้าถึงได้ ดูว่าสาขาไหนมีของ และขอสินค้าเข้ากระบวนการโอน</p>
        </div>
        <Link to="/app/inventory/movements">
          <Button className="h-9 px-3" variant="secondary" icon={<Boxes size={17} />}>ประวัติสต็อก</Button>
        </Link>
      </div>

      <Card className="space-y-4 p-4">
        <form className="flex flex-col gap-3 md:flex-row" onSubmit={submit}>
          <div className="field-icon-wrap flex-1">
            <Search className="field-icon" size={18} />
            <input
              className="field field-with-both-icons h-11"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="ชื่อสินค้า, SKU, Barcode, หมวดหมู่ หรือแบรนด์"
              autoFocus
            />
            {draft ? (
              <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-ink" onClick={clear} aria-label="ล้างคำค้นหา">
                <X size={18} />
              </button>
            ) : null}
          </div>
          <Button className="h-11 md:w-32" type="submit" icon={<PackageSearch size={17} />} disabled={!canSearch || search.isFetching}>
            ค้นหา
          </Button>
        </form>

        {trimmedQuery ? (
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-md bg-stone-50 p-3">
              <p className="text-xs font-bold text-stone-500">สินค้าที่พบ</p>
              <p className="mt-1 text-xl font-black text-ink">{number(totalProducts)} รายการ</p>
            </div>
            <div className="rounded-md bg-stone-50 p-3">
              <p className="text-xs font-bold text-stone-500">คลังที่มีของ</p>
              <p className="mt-1 text-xl font-black text-ink">{number(totalLocations)} คลัง</p>
            </div>
            <div className="rounded-md bg-stone-50 p-3">
              <p className="text-xs font-bold text-stone-500">ยอดรวมที่เจอ</p>
              <p className="mt-1 text-xl font-black text-ink">{number(totalUnits)} ชิ้น</p>
            </div>
          </div>
        ) : null}
      </Card>

      {!trimmedQuery ? (
        <Card className="flex min-h-56 flex-col items-center justify-center p-8 text-center">
          <PackageSearch className="text-leaf" size={34} />
          <h2 className="mt-3 text-xl font-black text-ink">เริ่มจากค้นหาสินค้า</h2>
          <p className="mt-2 max-w-lg text-sm text-stone-500">พิมพ์อย่างน้อย 2 ตัวอักษร หรือยิง Barcode/SKU เพื่อดูว่าสินค้าอยู่สาขาและคลังไหน</p>
        </Card>
      ) : search.isLoading || search.isFetching ? (
        <Card className="p-6 text-center text-sm font-semibold text-stone-500">กำลังค้นหาสต็อก...</Card>
      ) : search.error ? (
        <Card className="p-6 text-center text-sm font-semibold text-red-700">ค้นหาไม่สำเร็จ: {search.error.message}</Card>
      ) : results.length === 0 ? (
        <Card className="flex min-h-56 flex-col items-center justify-center p-8 text-center">
          <PackageSearch className="text-stone-400" size={34} />
          <h2 className="mt-3 text-xl font-black text-ink">ไม่พบสินค้าในระบบร้าน</h2>
          <p className="mt-2 max-w-lg text-sm text-stone-500">ลองค้นหาด้วยชื่ออื่น, SKU, Barcode, หมวดหมู่ หรือแบรนด์</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {results.map((product) => <StockSearchResult key={product.id} product={product} workingBranchId={workingBranchId} destinationWarehouseId={destinationWarehouseId} />)}
        </div>
      )}
    </div>
  );
}
