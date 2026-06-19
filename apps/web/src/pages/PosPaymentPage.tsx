import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Banknote, CheckCircle2, ImageIcon, QrCode } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { post } from "../lib/api";
import { baht, number } from "../lib/format";
import { clearPosPaymentDraft, loadPosPaymentDraft } from "../lib/pos-payment-draft";
import { getProductImageUrl } from "../lib/products";
import { useAuth } from "../state/auth";

type Sale = { id: string; receiptNo: string };

function PaymentProductImage({ product }: { product: { imagePath?: string | null; name: string } }) {
  const imageUrl = getProductImageUrl(product);
  if (imageUrl) return <img src={imageUrl} alt={product.name} className="h-16 w-16 shrink-0 rounded-md border border-stone-200 object-cover" />;
  return (
    <span className="grid h-16 w-16 shrink-0 place-items-center rounded-md border border-dashed border-stone-300 bg-stone-50 text-stone-400">
      <ImageIcon size={22} />
    </span>
  );
}

export function PosPaymentPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const businessName = useAuth((state) => state.session?.business?.name);
  const draft = loadPosPaymentDraft();
  const subtotal = (draft?.items ?? []).reduce((sum, item) => sum + Number(item.salePrice) * item.quantity, 0);
  const total = Math.max(0, subtotal - (draft?.discount ?? 0));
  const isCashPayment = draft?.paymentMethod === "CASH";
  const saleMutation = useMutation({
    mutationFn: () => {
      if (!draft) throw new Error("ไม่พบรายการชำระเงิน");
      return post<Sale>("/sales", {
        branchId: draft.branchId || undefined,
        warehouseId: draft.warehouseId || undefined,
        discount: draft.discount,
        paymentMethod: draft.paymentMethod,
        items: draft.items.map((item) => ({ productId: item.productId, quantity: item.quantity }))
      });
    },
    onSuccess: (sale) => {
      clearPosPaymentDraft();
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["movements"] });
      queryClient.invalidateQueries({ queryKey: ["stock-report"] });
      navigate(`/app/sales/${sale.id}`);
    }
  });
  const canConfirmPayment = !saleMutation.isPending;

  if (!draft) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#f8f7f2] p-6">
        <div className="grid max-w-xl gap-4 rounded-lg border border-stone-200 bg-white p-6 text-center shadow-sm">
          <QrCode className="mx-auto text-stone-400" size={56} />
          <div>
            <h1 className="text-2xl font-black">ไม่พบรายการชำระเงิน</h1>
            <p className="mt-1 text-stone-600">กลับไปเลือกสินค้าใน POS เพื่อสร้างรายการชำระเงินใหม่</p>
          </div>
          <Link to="/app/pos">
            <Button className="w-full" type="button" icon={<ArrowLeft size={16} />}>กลับไป POS</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (isCashPayment) {
    const itemCount = draft.items.reduce((sum, item) => sum + item.quantity, 0);
    return (
      <div className="grid min-h-screen place-items-center bg-[#f8f7f2] p-4 text-ink sm:p-6">
        <main className="w-full max-w-3xl rounded-lg border border-stone-200 bg-white p-5 shadow-sm sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 pb-5">
            <div>
              <p className="text-sm font-black uppercase text-leaf">{businessName ?? "Zentory"}</p>
              <h1 className="mt-2 flex items-center gap-2 text-3xl font-black sm:text-4xl"><Banknote /> รับเงินสด</h1>
            </div>
            <span className="rounded-md bg-emerald-50 px-3 py-1 text-sm font-black text-emerald-700">ยืนยันการขาย</span>
          </div>

          <section className="py-8 text-center">
            <p className="text-base font-bold text-stone-500">ยอดที่ต้องรับจากลูกค้า</p>
            <p className="mt-2 text-6xl font-black tracking-normal text-ink sm:text-7xl">{baht(total)}</p>
            <p className="mx-auto mt-4 max-w-xl text-lg font-semibold leading-8 text-stone-600">
              เมื่อรับเงินสดจากลูกค้าเรียบร้อยแล้ว ให้กดยืนยันเพื่อบันทึกขายและตัดสต็อกทันที
            </p>
          </section>

          <section className="rounded-lg border border-stone-200 bg-stone-50 p-4">
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <p className="text-stone-500">จำนวนสินค้า</p>
              <p className="font-black sm:text-right">{number(itemCount)} ชิ้น</p>
              <p className="text-stone-500">รวมสินค้า</p>
              <p className="font-black sm:text-right">{baht(subtotal)}</p>
              <p className="text-stone-500">ส่วนลด</p>
              <p className="font-black sm:text-right">{baht(draft.discount)}</p>
            </div>
          </section>

          <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_1.6fr]">
            <Link to="/app/pos">
              <Button className="h-14 w-full" type="button" variant="secondary" icon={<ArrowLeft size={18} />} disabled={saleMutation.isPending}>กลับไปแก้รายการ</Button>
            </Link>
            <Button className="h-14 w-full text-base" type="button" icon={<CheckCircle2 size={20} />} disabled={!canConfirmPayment} onClick={() => saleMutation.mutate()}>
              {saleMutation.isPending ? "กำลังบันทึก..." : "รับเงินแล้ว ยืนยันการขาย"}
            </Button>
          </div>
          {saleMutation.error ? <p className="mt-4 rounded-md bg-red-50 p-3 text-sm font-semibold text-red-700">{saleMutation.error.message}</p> : null}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f7f2] p-4 text-ink sm:p-6 lg:p-8">
      <main className="mx-auto grid min-h-[calc(100vh-8rem)] max-w-7xl gap-5 xl:grid-cols-[minmax(0,1fr)_520px]">
        <section className="flex min-h-0 flex-col rounded-lg border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="border-b border-stone-200 pb-4">
            <p className="text-sm font-black uppercase text-leaf">{businessName ?? "Zentory"}</p>
            <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
              <h1 className="text-3xl font-black sm:text-4xl">รายการที่ซื้อ</h1>
              <span className="rounded-md bg-stone-100 px-3 py-1 text-sm font-black text-stone-700">{number(draft.items.reduce((sum, item) => sum + item.quantity, 0))} ชิ้น</span>
            </div>
          </div>
          <div className="min-h-0 flex-1 divide-y divide-stone-100 overflow-auto">
            {draft.items.map((item) => (
              <div key={item.productId} className="flex items-start gap-3 py-4">
                <PaymentProductImage product={item} />
                <div className="min-w-0 flex-1">
                  <p className="break-words text-lg font-black text-ink">{item.name}</p>
                  <p className="mt-1 text-sm font-semibold text-stone-600">{baht(item.salePrice)} x {number(item.quantity)}</p>
                </div>
                <p className="shrink-0 text-right text-lg font-black">{baht(Number(item.salePrice) * item.quantity)}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-2 border-t border-stone-200 pt-4">
            <p className="flex justify-between"><span>รวม</span><b>{baht(subtotal)}</b></p>
            <p className="flex justify-between"><span>ส่วนลด</span><b>{baht(draft.discount)}</b></p>
            <p className="flex justify-between text-4xl font-black text-ink"><span>สุทธิ</span><span>{baht(total)}</span></p>
          </div>
        </section>

        <aside className="flex flex-col rounded-lg border border-stone-200 bg-white p-5 text-center shadow-sm sm:p-6">
          <div className="flex items-center justify-between gap-3 text-left">
            <h2 className="flex items-center gap-2 text-2xl font-black"><QrCode /> สแกนจ่าย</h2>
            <span className="rounded-md bg-teal-50 px-3 py-1 text-sm font-black text-leaf">โอน</span>
          </div>
          <div className="mt-5 rounded-lg bg-ink p-4 text-white">
            <p className="text-sm font-semibold text-white/70">ยอดที่ต้องชำระ</p>
            <p className="text-5xl font-black">{baht(total)}</p>
          </div>
          <div className="mt-5 grid flex-1 place-items-center rounded-lg border border-stone-200 bg-stone-50 p-4">
            {draft.paymentQrImage ? (
              <img src={draft.paymentQrImage} alt="QR จ่ายเงิน" className="aspect-square w-full max-w-96 rounded-md bg-white object-contain p-3 shadow-sm" />
            ) : (
              <div className="grid aspect-square w-full max-w-96 place-items-center rounded-md border border-dashed border-stone-300 bg-white p-6 text-center text-stone-500">
                <QrCode size={112} />
                <p className="mt-3 text-sm font-bold">ยังไม่ได้ใส่ QR</p>
              </div>
            )}
          </div>
          <p className="mt-4 text-lg font-bold text-stone-700">สแกน QR แล้วชำระเงินตามยอดด้านบน</p>
        </aside>
      </main>

      <footer className="mx-auto mt-4 flex max-w-7xl flex-wrap items-center justify-between gap-3 rounded-lg border border-stone-200 bg-white/95 p-3 shadow-sm">
        <p className="text-sm font-semibold text-stone-500">สำหรับพนักงาน</p>
        <div className="flex flex-wrap gap-2">
          <Link to="/app/pos">
            <Button type="button" variant="secondary" icon={<ArrowLeft size={16} />} disabled={saleMutation.isPending}>กลับไปแก้รายการ</Button>
          </Link>
          <Button type="button" icon={<CheckCircle2 size={18} />} disabled={!canConfirmPayment} onClick={() => saleMutation.mutate()}>
            {saleMutation.isPending ? "กำลังบันทึก..." : "ยืนยันว่าจ่ายเงินแล้ว"}
          </Button>
        </div>
        {saleMutation.error ? <p className="basis-full rounded-md bg-red-50 p-3 text-sm font-semibold text-red-700">{saleMutation.error.message}</p> : null}
      </footer>
    </div>
  );
}
