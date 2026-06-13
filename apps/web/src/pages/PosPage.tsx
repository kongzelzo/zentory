import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Minus, Plus, ScanLine, ShoppingCart, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { api, post } from "../lib/api";
import { baht, number } from "../lib/format";
import { canAddToCart, findExactScannedProduct, getCartLineStockState, getCheckoutIssue, getSaleTotals, sanitizeCartQuantity, stockOf } from "../lib/pos";

type Product = {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  salePrice: string;
  balances: Array<{ quantity: number }>;
};

type Sale = { id: string; receiptNo: string };
type PaymentMethod = "CASH" | "TRANSFER";
type CartItem = Product & { quantity: number };

export function PosPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [message, setMessage] = useState("");
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const products = useQuery({ queryKey: ["products", "pos-active"], queryFn: () => api<Product[]>("/products?status=ACTIVE") });
  const queryClient = useQueryClient();
  const saleMutation = useMutation({
    mutationFn: () => post<Sale>("/sales", { discount, paymentMethod, items: cart.map((item) => ({ productId: item.id, quantity: item.quantity })) }),
    onSuccess: (sale) => {
      setCart([]);
      setDiscount(0);
      setMessage(`ขายสำเร็จ เลขใบเสร็จ ${sale.receiptNo}`);
      setLastSale(sale);
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["movements"] });
      queryClient.invalidateQueries({ queryKey: ["stock-report"] });
    },
    onError: (error) => {
      setLastSale(null);
      setMessage(error.message === "Insufficient stock" ? "สต็อกไม่พอสำหรับการขายรายการนี้" : error.message);
    }
  });
  const filtered = useMemo(() => {
    const value = search.trim().toLowerCase();
    return (products.data ?? []).filter((product) => !value || [product.name, product.sku, product.barcode].some((field) => field?.toLowerCase().includes(value))).slice(0, 20);
  }, [products.data, search]);
  const exactProduct = useMemo(() => findExactScannedProduct(products.data ?? [], search), [products.data, search]);
  const checkoutIssue = getCheckoutIssue(cart);
  const { subtotal, total } = getSaleTotals(cart, discount);

  function add(product: Product) {
    setMessage("");
    setLastSale(null);
    setCart((items) => {
      const current = items.find((item) => item.id === product.id);
      const currentQty = current?.quantity ?? 0;
      const availability = canAddToCart(product, currentQty);
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
      const next = sanitizeCartQuantity(nextQuantity, stockOf(item));
      return { ...item, quantity: next };
    }));
  }

  function remove(productId: string) {
    setCart((items) => items.filter((item) => item.id !== productId));
  }

  function checkout() {
    const issue = getCheckoutIssue(cart);
    if (issue === "empty-cart") {
      setMessage("กรุณาเลือกสินค้าอย่างน้อย 1 รายการ");
      return;
    }
    if (issue === "stock-exceeded") {
      setMessage("จำนวนสินค้าในตะกร้าไม่ถูกต้อง");
      return;
    }
    saleMutation.mutate();
  }

  function addExactMatch() {
    if (!exactProduct) return;
    add(exactProduct);
    setSearch("");
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (exactProduct) addExactMatch();
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
      <section className="space-y-4">
        <div>
          <h1 className="text-3xl font-black">ขายสินค้าหน้าร้าน / POS</h1>
          <p className="text-stone-600">ค้นหาสินค้า ใส่ตะกร้า เลือกวิธีชำระเงิน แล้วบันทึกขายเพื่อตัดสต็อก</p>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <input className="field" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={handleSearchKeyDown} placeholder="ยิง barcode หรือค้นหาชื่อสินค้า / SKU" autoFocus />
          <Button type="button" variant="secondary" icon={<ScanLine size={16} />} disabled={!exactProduct} onClick={addExactMatch}>เพิ่มจากรหัส</Button>
        </div>
        {search.trim() && exactProduct ? (
          <button type="button" className="flex w-full items-center justify-between rounded-md border border-leaf/30 bg-teal-50 px-4 py-3 text-left" onClick={addExactMatch}>
            <span>
              <span className="block text-sm font-black text-ink">พบตรงรหัส: {exactProduct.name}</span>
              <span className="block text-xs font-semibold text-stone-600">{exactProduct.sku} / เหลือ {number(stockOf(exactProduct))}</span>
            </span>
            <Plus size={18} className="text-leaf" />
          </button>
        ) : null}
        {products.isLoading ? <Card>กำลังโหลดสินค้า...</Card> : null}
        {products.error ? <Card className="text-red-700">โหลดสินค้าไม่สำเร็จ: {products.error.message}</Card> : null}
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map((product) => {
            const stock = stockOf(product);
            return (
              <button key={product.id} className="rounded-lg border border-stone-200 bg-white p-4 text-left hover:border-leaf disabled:cursor-not-allowed disabled:opacity-50" onClick={() => add(product)} disabled={stock <= 0}>
                <p className="font-black">{product.name}</p>
                <p className="text-sm text-stone-500">{product.sku} / เหลือ {number(stock)}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <p className="font-black text-leaf">{baht(product.salePrice)}</p>
                  {stock <= 0 ? <span className="rounded bg-red-50 px-2 py-1 text-xs font-black text-red-700">หมดสต็อก</span> : stock <= 3 ? <span className="rounded bg-amber-50 px-2 py-1 text-xs font-black text-amber-700">เหลือน้อย</span> : null}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <Card className="h-fit">
        <h2 className="flex items-center gap-2 text-xl font-black"><ShoppingCart /> ตะกร้า</h2>
        <div className="mt-4 space-y-3">
          {cart.map((item) => (
            <div key={item.id} className="rounded-md border border-stone-200 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{item.name}</p>
                  <p className="text-sm text-stone-500">{baht(item.salePrice)} x {item.quantity} / เหลือ {number(stockOf(item))}</p>
                </div>
                <Button type="button" variant="ghost" icon={<Trash2 size={16} />} aria-label="ลบสินค้าออกจากตะกร้า" onClick={() => remove(item.id)} />
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Button type="button" variant="secondary" icon={<Minus size={16} />} aria-label="ลดจำนวน" onClick={() => changeQuantity(item.id, item.quantity - 1)} />
                <input
                  className="field w-24 text-center"
                  type="number"
                  min={0}
                  max={stockOf(item)}
                  value={item.quantity}
                  onChange={(event) => changeQuantity(item.id, event.target.value)}
                />
                <Button type="button" variant="secondary" icon={<Plus size={16} />} aria-label="เพิ่มจำนวน" onClick={() => changeQuantity(item.id, item.quantity + 1)} />
              </div>
              {getCartLineStockState(item, item.quantity) === "maxed" ? (
                <p className="mt-2 flex items-center gap-1 text-xs font-bold text-amber-700"><AlertTriangle size={14} /> จำนวนนี้เท่ากับสต็อกคงเหลือแล้ว</p>
              ) : null}
              {getCartLineStockState(item, item.quantity) === "over" ? (
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
        <Button className="mt-4 w-full" disabled={Boolean(checkoutIssue) || saleMutation.isPending} onClick={checkout}>{saleMutation.isPending ? "กำลังบันทึก..." : "บันทึกขาย"}</Button>
      </Card>
    </div>
  );
}
