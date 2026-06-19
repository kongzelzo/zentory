import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ImageIcon, Minus, Plus, ScanLine, ShoppingCart, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BarcodeScanner } from "../components/BarcodeScanner";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Dropdown } from "../components/Dropdown";
import { api } from "../lib/api";
import { branchScopedPath } from "../lib/branch-scope";
import { baht, number } from "../lib/format";
import { canAddToCart, findExactScannedProduct, getCartLineStockState, getCheckoutIssue, getPreferredWarehouseId, getSaleTotals, sanitizeCartQuantity, stockOf } from "../lib/pos";
import { savePosPaymentDraft } from "../lib/pos-payment-draft";
import { getProductDisplayName, getProductImageUrl } from "../lib/products";
import { loadBranchPosSettings } from "../lib/pos-settings";
import { getActiveWarehouses, getSingleActiveWarehouse, shouldShowWarehouseSelector, warehouseDisplayName } from "../lib/warehouses";
import { useWorkingBranch } from "../state/working-branch";

type Product = {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  variantColor?: string | null;
  variantSize?: string | null;
  category?: { name: string };
  imagePath?: string | null;
  salePrice: string;
  balances: Array<{ warehouseId?: string; quantity: number }>;
};

type Category = {
  id: string;
  name: string;
};

type Sale = { id: string; receiptNo: string };
type BranchOption = { id: string };
type WarehouseOption = { id: string; name: string; code: string; type?: "MAIN_WAREHOUSE" | "STORE_FRONT" | "BRANCH_WAREHOUSE" | "SECONDARY_WAREHOUSE"; status?: string; isDefault?: boolean };
type PaymentMethod = "CASH" | "TRANSFER";
type CartItem = Product & { quantity: number };

function PosProductImage({ product, className = "h-20 w-20" }: { product: Pick<Product, "imagePath" | "name">; className?: string }) {
  const imageUrl = getProductImageUrl(product);
  if (imageUrl) {
    return <img src={imageUrl} alt={product.name} className={`${className} shrink-0 rounded-md border border-stone-200 object-cover`} />;
  }
  return (
    <span className={`${className} grid shrink-0 place-items-center rounded-md border border-dashed border-stone-300 bg-stone-50 text-stone-400`}>
      <ImageIcon size={22} />
    </span>
  );
}

export function PosPage() {
  const navigate = useNavigate();
  const cartRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const workingBranchId = useWorkingBranch((state) => state.workingBranchId);
  const [branchId, setBranchId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [message, setMessage] = useState("");
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const products = useQuery({
    queryKey: ["products", "pos-active", branchId],
    queryFn: () => api<Product[]>(branchScopedPath("/products?status=ACTIVE", branchId)),
    enabled: Boolean(branchId)
  });
  const categories = useQuery({ queryKey: ["categories", branchId], queryFn: () => api<Category[]>(branchScopedPath("/categories", branchId)), enabled: Boolean(branchId) });
  const branches = useQuery({ queryKey: ["branches"], queryFn: () => api<BranchOption[]>("/branches") });
  const warehouses = useQuery({
    queryKey: ["warehouses", branchId],
    queryFn: () => api<WarehouseOption[]>(`/warehouses?branchId=${encodeURIComponent(branchId)}`),
    enabled: Boolean(branchId)
  });
  const filtered = useMemo(() => {
    const value = search.trim().toLowerCase();
    return (products.data ?? [])
      .filter((product) => categoryFilter === "ALL" || (categoryFilter === "UNCATEGORIZED" ? !product.category?.name : product.category?.name === categoryFilter))
      .filter((product) => !value || [product.name, product.variantColor, product.variantSize, product.sku, product.barcode].some((field) => field?.toLowerCase().includes(value)))
      .slice(0, 20);
  }, [categoryFilter, products.data, search]);
  const categoryOptions = useMemo(() => {
    const activeCategoryNames = new Set((products.data ?? []).map((product) => product.category?.name).filter(Boolean) as string[]);
    const rows = (categories.data ?? []).filter((category) => activeCategoryNames.has(category.name));
    const hasUncategorized = (products.data ?? []).some((product) => !product.category?.name);
    return [
      { value: "ALL", label: "ทั้งหมด" },
      ...rows.map((category) => ({ value: category.name, label: category.name })),
      ...(hasUncategorized ? [{ value: "UNCATEGORIZED", label: "ไม่จัดหมวด" }] : [])
    ];
  }, [categories.data, products.data]);
  const exactProduct = useMemo(() => findExactScannedProduct(products.data ?? [], search), [products.data, search]);
  const activeWarehouses = useMemo(() => getActiveWarehouses(warehouses.data ?? []), [warehouses.data]);
  const singleActiveWarehouse = useMemo(() => getSingleActiveWarehouse(warehouses.data ?? []), [warehouses.data]);
  const showWarehouseSelector = shouldShowWarehouseSelector(warehouses.data ?? []);
  const branchPosSettings = useMemo(() => loadBranchPosSettings(branchId), [branchId]);
  const locationIssue = !branchId || !warehouseId;
  const checkoutIssue = getCheckoutIssue(cart, warehouseId);
  const { subtotal, total } = getSaleTotals(cart, discount);

  useEffect(() => {
    if (!categoryOptions.some((category) => category.value === categoryFilter)) setCategoryFilter("ALL");
  }, [categoryFilter, categoryOptions]);

  useEffect(() => {
    const nextBranchId = workingBranchId || branches.data?.[0]?.id || "";
    if (!nextBranchId || nextBranchId === branchId) return;
    setLastSale(null);
    setSearch("");
    setMessage(cart.length > 0 ? "ล้างตะกร้าแล้ว เพราะเปลี่ยนสาขาขาย" : "");
    setCart((items) => items.length > 0 ? [] : items);
    setBranchId(nextBranchId);
    setWarehouseId("");
  }, [branchId, branches.data, cart.length, workingBranchId]);

  useEffect(() => {
    setPaymentMethod(branchPosSettings.defaultPaymentMethod);
  }, [branchPosSettings.defaultPaymentMethod]);

  useEffect(() => {
    if (!branchId || !warehouses.data) return;
    setWarehouseId(getPreferredWarehouseId(warehouses.data, warehouseId));
  }, [activeWarehouses, branchId, warehouseId, warehouses.data]);

  function add(product: Product) {
    if (!warehouseId) {
      setMessage("ระบบกำลังเตรียมข้อมูลสต็อกสำหรับการขาย");
      return;
    }
    setMessage("");
    setLastSale(null);
    setCart((items) => {
      const current = items.find((item) => item.id === product.id);
      const currentQty = current?.quantity ?? 0;
      const availability = canAddToCart(product, currentQty, warehouseId);
      if (!availability.ok) {
        setMessage(availability.reason === "out-of-stock" ? "สินค้านี้หมดสต็อกแล้ว" : "จำนวนในตะกร้าเท่ากับสต็อกคงเหลือแล้ว");
        return items;
      }
      if (current) return items.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      return [...items, { ...product, quantity: 1 }];
    });
  }

  function changeQuantity(productId: string, nextQuantity: string | number) {
    setCart((items) => items.map((item) => {
      if (item.id !== productId) return item;
      const next = sanitizeCartQuantity(nextQuantity, stockOf(item, warehouseId));
      return { ...item, quantity: next };
    }));
  }

  function remove(productId: string) {
    setCart((items) => items.filter((item) => item.id !== productId));
  }

  function checkout() {
    if (locationIssue) {
      setMessage("ระบบกำลังเตรียมข้อมูลสต็อกสำหรับการขาย");
      return;
    }
    const issue = getCheckoutIssue(cart, warehouseId);
    if (issue === "empty-cart") {
      setMessage("กรุณาเลือกสินค้าอย่างน้อย 1 รายการ");
      return;
    }
    if (issue === "stock-exceeded") {
      setMessage("จำนวนสินค้าในตะกร้าไม่ถูกต้อง");
      return;
    }
    savePosPaymentDraft({
      branchId,
      warehouseId,
      discount,
      paymentMethod,
      paymentQrImage: branchPosSettings.paymentQrImage,
      items: cart.map((item) => ({
        productId: item.id,
        name: getProductDisplayName(item),
        sku: item.sku,
        imagePath: item.imagePath,
        salePrice: item.salePrice,
        quantity: item.quantity
      }))
    });
    navigate("/app/pos/payment");
  }

  function addExactMatch() {
    if (!exactProduct || !warehouseId) return;
    add(exactProduct);
    setSearch("");
  }

  const handleBarcodeDetected = useCallback((code: string) => {
    const product = findExactScannedProduct(products.data ?? [], code);
    setSearch(code);
    if (!product) {
      setMessage(`ไม่พบสินค้า barcode/SKU: ${code}`);
      return;
    }
    add(product);
    setSearch("");
  }, [products.data, warehouseId]);

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (exactProduct) addExactMatch();
  }

  function scrollToCart() {
    cartRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="grid gap-5 pb-28 xl:grid-cols-[1fr_420px] xl:pb-0">
      <BarcodeScanner
        open={isScannerOpen}
        title="สแกนเพื่อขายสินค้า"
        closeOnDetected={false}
        onDetected={handleBarcodeDetected}
        onClose={() => setIsScannerOpen(false)}
      />
      <section className="space-y-4">
        <div>
          <h1 className="text-3xl font-black">ขายสินค้าหน้าร้าน / POS</h1>
          <p className="text-stone-600">ค้นหาสินค้า ใส่ตะกร้า เลือกวิธีชำระเงิน แล้วบันทึกขายเพื่อตัดสต็อก</p>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <input className="field" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={handleSearchKeyDown} placeholder="ยิง barcode หรือค้นหาชื่อสินค้า / SKU" autoFocus />
          <div className="grid gap-2 sm:grid-cols-2 md:flex">
            <Button type="button" variant="secondary" icon={<ScanLine size={16} />} disabled={products.isLoading} onClick={() => setIsScannerOpen(true)}>สแกนด้วยกล้อง</Button>
            <Button type="button" variant="secondary" icon={<Plus size={16} />} disabled={!exactProduct || !warehouseId} onClick={addExactMatch}>เพิ่มจากรหัส</Button>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:max-w-2xl">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-bold text-stone-700" htmlFor="pos-category-filter">หมวดหมู่</label>
            <Dropdown
              id="pos-category-filter"
              options={categoryOptions}
              value={categoryFilter}
              onValueChange={setCategoryFilter}
              disabled={products.isLoading || categories.isLoading}
              buttonClassName="h-11 min-h-11 bg-white"
            />
          </div>
          {showWarehouseSelector ? (
            <div className="flex flex-col gap-2">
              <label className="text-sm font-bold text-stone-700">คลังขาย</label>
              <Dropdown
                options={activeWarehouses.map((warehouse) => ({ value: warehouse.id, label: warehouseDisplayName(warehouse) }))}
                value={warehouseId}
                onValueChange={setWarehouseId}
                disabled={warehouses.isLoading}
                placeholder="เลือกคลังขาย"
                buttonClassName="h-11 min-h-11 bg-white"
              />
            </div>
          ) : singleActiveWarehouse ? (
            <div className="rounded-md border border-stone-200 bg-white px-3 py-2">
              <p className="text-xs font-bold text-stone-500">คลังขาย</p>
              <p className="mt-1 font-black text-ink">{warehouseDisplayName(singleActiveWarehouse)}</p>
            </div>
          ) : null}
        </div>
        {warehouses.error ? <Card className="text-red-700">โหลดคลังไม่สำเร็จ: {warehouses.error.message}</Card> : null}
        {branchId && !warehouses.isLoading && activeWarehouses.length === 0 ? <Card className="text-amber-700">ยังไม่พบคลังที่เปิดใช้งานสำหรับการขาย</Card> : null}
        {locationIssue && activeWarehouses.length > 0 ? <p className="text-sm font-semibold text-amber-700">กำลังเตรียมข้อมูลสต็อกสำหรับการขาย</p> : null}
        {search.trim() && exactProduct ? (
          <button type="button" className="flex w-full items-center justify-between rounded-md border border-leaf/30 bg-teal-50 px-4 py-3 text-left disabled:cursor-not-allowed disabled:opacity-50" onClick={addExactMatch} disabled={!warehouseId}>
            <span>
              <span className="block text-sm font-black text-ink">พบตรงรหัส: {getProductDisplayName(exactProduct)}</span>
              <span className="block text-xs font-semibold text-stone-600">{exactProduct.sku} / คงเหลือ {number(stockOf(exactProduct, warehouseId))}</span>
            </span>
            <Plus size={18} className="text-leaf" />
          </button>
        ) : null}
        {products.isLoading ? <Card>กำลังโหลดสินค้า...</Card> : null}
        {products.error ? <Card className="text-red-700">โหลดสินค้าไม่สำเร็จ: {products.error.message}</Card> : null}
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map((product) => {
            const stock = stockOf(product, warehouseId);
            return (
              <button key={product.id} className="rounded-lg border border-stone-200 bg-white p-4 text-left hover:border-leaf disabled:cursor-not-allowed disabled:opacity-50" onClick={() => add(product)} disabled={!warehouseId || stock <= 0}>
                <div className="flex gap-3">
                  <PosProductImage product={product} />
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-black">{getProductDisplayName(product)}</p>
                    <p className="text-sm text-stone-500">{product.sku} / {product.category?.name ?? "ไม่จัดหมวด"}</p>
                    <p className="text-sm text-stone-500">คงเหลือ {number(stock)}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <p className="font-black text-leaf">{baht(product.salePrice)}</p>
                      {stock <= 0 ? <span className="rounded bg-red-50 px-2 py-1 text-xs font-black text-red-700">หมดสต็อก</span> : stock <= 3 ? <span className="rounded bg-amber-50 px-2 py-1 text-xs font-black text-amber-700">เหลือน้อย</span> : null}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <div ref={cartRef} className="scroll-mt-24">
        <Card className="h-fit">
          <h2 className="flex items-center gap-2 text-xl font-black"><ShoppingCart /> ตะกร้า</h2>
          <div className="mt-4 space-y-3">
            {cart.map((item) => (
              <div key={item.id} className="rounded-md border border-stone-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 gap-3">
                    <PosProductImage product={item} className="h-14 w-14" />
                    <div className="min-w-0">
                      <p className="break-words font-semibold">{getProductDisplayName(item)}</p>
                      <p className="text-sm text-stone-500">{baht(item.salePrice)} x {item.quantity} / คงเหลือ {number(stockOf(item, warehouseId))}</p>
                    </div>
                  </div>
                  <Button type="button" variant="ghost" icon={<Trash2 size={16} />} aria-label="ลบสินค้าออกจากตะกร้า" onClick={() => remove(item.id)} />
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <Button type="button" variant="secondary" icon={<Minus size={16} />} aria-label="ลดจำนวน" onClick={() => changeQuantity(item.id, item.quantity - 1)} />
                  <input
                    className="field w-24 text-center"
                    type="number"
                    min={0}
                    max={stockOf(item, warehouseId)}
                    value={item.quantity}
                    onChange={(event) => changeQuantity(item.id, event.target.value)}
                  />
                  <Button type="button" variant="secondary" icon={<Plus size={16} />} aria-label="เพิ่มจำนวน" onClick={() => changeQuantity(item.id, item.quantity + 1)} />
                </div>
                {getCartLineStockState(item, item.quantity, warehouseId) === "maxed" ? (
                  <p className="mt-2 flex items-center gap-1 text-xs font-bold text-amber-700"><AlertTriangle size={14} /> จำนวนนี้เท่ากับสต็อกคงเหลือแล้ว</p>
                ) : null}
                {getCartLineStockState(item, item.quantity, warehouseId) === "over" ? (
                  <p className="mt-2 flex items-center gap-1 text-xs font-bold text-red-700"><AlertTriangle size={14} /> จำนวนเกินสต็อกคงเหลือ</p>
                ) : null}
              </div>
            ))}
            {cart.length === 0 ? <p className="text-sm text-stone-500">ยังไม่มีสินค้าในตะกร้า</p> : null}
          </div>

          <label className="mt-4 block">
            <span className="text-sm font-semibold">ส่วนลด</span>
            <input className="field mt-1" type="number" min={0} value={discount} onChange={(event) => setDiscount(Math.max(0, Number(event.target.value) || 0))} />
          </label>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button type="button" variant={paymentMethod === "CASH" ? "primary" : "secondary"} onClick={() => setPaymentMethod("CASH")}>เงินสด</Button>
            <Button type="button" variant={paymentMethod === "TRANSFER" ? "primary" : "secondary"} onClick={() => setPaymentMethod("TRANSFER")}>โอน</Button>
          </div>

          {paymentMethod === "TRANSFER" ? (
            <div className="mt-4 rounded-md border border-stone-200 bg-stone-50 p-3">
              <p className="text-sm font-bold text-ink">{branchPosSettings.paymentQrImage ? "พร้อมแสดง QR ตอนชำระเงิน" : "ยังไม่ได้ตั้ง QR รับโอน"}</p>
              <Link to="/app/branch-settings" className="mt-2 inline-flex text-sm font-bold text-leaf hover:text-teal-800">ไปตั้งค่า POS ของสาขา</Link>
            </div>
          ) : null}

          <div className="mt-5 border-t border-stone-200 pt-4">
            <p className="flex justify-between"><span>รวม</span><b>{baht(subtotal)}</b></p>
            <p className="flex justify-between text-2xl font-black"><span>สุทธิ</span><span>{baht(total)}</span></p>
          </div>
          {message ? <p className="mt-3 rounded-md bg-stone-100 p-3 text-sm">{message}</p> : null}
          {lastSale ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Link to={`/app/sales/${lastSale.id}`}><Button className="w-full" variant="secondary" icon={<CheckCircle2 size={16} />}>ดูใบขาย</Button></Link>
              <Button className="w-full" type="button" onClick={() => navigate(`/app/sales/${lastSale.id}`)}>ไปหน้าใบขาย</Button>
            </div>
          ) : null}
          <Button className="mt-4 w-full" disabled={locationIssue || Boolean(checkoutIssue)} onClick={checkout}>ไปหน้าชำระเงิน</Button>
        </Card>
      </div>
      {cart.length > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white/95 p-3 shadow-[0_-8px_24px_rgba(41,37,36,0.12)] backdrop-blur xl:hidden">
          <div className="mx-auto flex max-w-3xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-stone-500">ตะกร้า {number(cart.reduce((sum, item) => sum + item.quantity, 0))} ชิ้น</p>
              <p className="text-xl font-black text-ink">{baht(total)}</p>
            </div>
            <Button className="h-12 min-w-36 px-5" type="button" onClick={scrollToCart}>
              ไปที่ตะกร้า
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
