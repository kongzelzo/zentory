import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { api, post } from "../lib/api";
import { baht } from "../lib/format";

type ProductOption = { id: string; name: string; sku: string; costPrice: string };
type ReceiptRow = { id: string; productId: string; quantity: number; unitCost: number };

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
  queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  queryClient.invalidateQueries({ queryKey: ["stock-report"] });
}

export function InventoryReceiptPage() {
  const products = useQuery({ queryKey: ["products", "receipt"], queryFn: () => api<ProductOption[]>("/products?status=ACTIVE,PAUSED") });
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const requestedProductId = searchParams.get("productId") ?? "";
  const appliedProductIdRef = useRef("");
  const [supplier, setSupplier] = useState("");
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<ReceiptRow[]>([newReceiptRow()]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const productMap = useMemo(() => new Map((products.data ?? []).map((product) => [product.id, product])), [products.data]);
  const totalCost = rows.reduce((sum, row) => sum + row.quantity * row.unitCost, 0);

  useEffect(() => {
    if (!requestedProductId || appliedProductIdRef.current === requestedProductId) return;
    const product = productMap.get(requestedProductId);
    if (!product) return;
    setRows([newReceiptRow(product)]);
    appliedProductIdRef.current = requestedProductId;
  }, [productMap, requestedProductId]);

  const mutation = useMutation({
    mutationFn: (body: unknown) => post("/inventory/receipts", body),
    onSuccess: () => {
      setMessage("รับสินค้าเข้าเรียบร้อย");
      setError("");
      setSupplier("");
      setNote("");
      setRows([newReceiptRow(products.data?.[0])]);
      refreshCoreQueries(queryClient);
    },
    onError: (err) => {
      setMessage("");
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
    setRows((current) => [...current, newReceiptRow(products.data?.[0])]);
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
    if (!items.length || items.some((item) => !item.productId || !Number.isInteger(item.quantity) || item.quantity < 1 || !Number.isFinite(item.unitCost) || item.unitCost < 0)) {
      setError("กรุณาเลือกสินค้า และกรอกจำนวน/ต้นทุนให้ถูกต้อง");
      return;
    }
    mutation.mutate({ supplier: supplier.trim() || undefined, note: note.trim() || undefined, items });
  }

  return (
    <Card className="max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black">รับสินค้าเข้า</h1>
          <p className="mt-1 text-sm text-stone-600">ใช้เพิ่มสต็อกจากสินค้าที่มีอยู่แล้ว ระบบจะสร้าง stock movement แบบรับเข้าให้ตรวจย้อนหลังได้</p>
        </div>
        <Link to="/app/products/new"><Button variant="secondary" icon={<Plus size={16} />}>สร้างสินค้าใหม่</Button></Link>
      </div>

      <form onSubmit={submit} className="mt-6 space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <input className="field" value={supplier} onChange={(event) => setSupplier(event.target.value)} placeholder="ซัพพลายเออร์" />
          <input className="field" value={note} onChange={(event) => setNote(event.target.value)} placeholder="หมายเหตุ" />
        </div>

        <div className="space-y-3">
          {rows.map((row, index) => (
            <div key={row.id} className="grid gap-3 rounded-md border border-stone-200 p-3 md:grid-cols-[1fr_120px_160px_44px]">
              <select className="field" value={row.productId} required onChange={(event) => updateRow(row.id, { productId: event.target.value })}>
                <option value="">เลือกสินค้า</option>
                {(products.data ?? []).map((product) => (
                  <option key={product.id} value={product.id}>{product.name} ({product.sku})</option>
                ))}
              </select>
              <input
                className="field"
                type="number"
                min={1}
                step={1}
                value={row.quantity}
                aria-label={`จำนวนรายการที่ ${index + 1}`}
                onChange={(event) => updateRow(row.id, { quantity: Math.max(1, Math.floor(Number(event.target.value) || 1)) })}
              />
              <input
                className="field"
                type="number"
                min={0}
                step="0.01"
                value={row.unitCost}
                aria-label={`ต้นทุนต่อหน่วยรายการที่ ${index + 1}`}
                onChange={(event) => updateRow(row.id, { unitCost: Math.max(0, Number(event.target.value) || 0) })}
              />
              <Button type="button" variant="ghost" icon={<Trash2 size={16} />} aria-label="ลบแถว" disabled={rows.length === 1} onClick={() => removeRow(row.id)} />
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 pt-4">
          <Button type="button" variant="secondary" icon={<Plus size={16} />} onClick={addRow}>เพิ่มรายการ</Button>
          <p className="text-xl font-black">รวมต้นทุนรับเข้า {baht(totalCost)}</p>
        </div>

        {message ? <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p> : null}
        {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        <Button disabled={mutation.isPending || products.isLoading}>{mutation.isPending ? "กำลังรับเข้า..." : "ยืนยันรับเข้า"}</Button>
      </form>
    </Card>
  );
}

export function InventoryAdjustmentPage() {
  const products = useQuery({ queryKey: ["products", "adjustment"], queryFn: () => api<ProductOption[]>("/products") });
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const mutation = useMutation({
    mutationFn: (body: unknown) => post("/inventory/adjustments", body),
    onSuccess: () => {
      setMessage("ปรับสต็อกเรียบร้อย");
      refreshCoreQueries(queryClient);
    },
    onError: (error) => setMessage(error.message)
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const quantity = Math.trunc(Number(form.get("quantity")));
    if (!Number.isFinite(quantity) || quantity === 0) {
      setMessage("จำนวนที่ปรับต้องไม่เป็น 0");
      return;
    }
    mutation.mutate({ productId: form.get("productId"), quantity, reason: String(form.get("reason") ?? "").trim() });
  }

  return (
    <Card className="max-w-3xl">
      <h1 className="text-3xl font-black">ปรับสต็อก</h1>
      <p className="mt-1 text-sm text-stone-600">ใช้เมื่อยอดนับจริงไม่ตรงกับระบบ เช่น สินค้าเสียหาย หรือปรับยอดจากการตรวจนับ</p>
      <form onSubmit={submit} className="mt-6 grid gap-4 md:grid-cols-2">
        <select className="field md:col-span-2" name="productId" required>
          <option value="">เลือกสินค้า</option>
          {(products.data ?? []).map((product) => (
            <option key={product.id} value={product.id}>{product.name} ({product.sku})</option>
          ))}
        </select>
        <input className="field" name="quantity" type="number" step={1} placeholder="จำนวน เช่น 5 หรือ -2" required />
        <input className="field" name="reason" placeholder="เหตุผล เช่น นับจริงไม่ตรง / สินค้าเสียหาย" required />
        {message ? <p className="rounded-md bg-stone-100 p-3 text-sm md:col-span-2">{message}</p> : null}
        <Button className="md:col-span-2" disabled={mutation.isPending}>{mutation.isPending ? "กำลังบันทึก..." : "บันทึกการปรับ"}</Button>
      </form>
    </Card>
  );
}
