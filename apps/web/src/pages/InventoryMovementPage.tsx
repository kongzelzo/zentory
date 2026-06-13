import { useQuery } from "@tanstack/react-query";
import { Card } from "../components/Card";
import { api } from "../lib/api";
import { number, thaiDate } from "../lib/format";

type Movement = { id: string; type: string; quantity: number; balanceAfter?: number; reference?: string; createdAt: string; product: { name: string } };

const movementLabels: Record<string, string> = {
  RECEIVE_IN: "รับเข้า",
  ADJUSTMENT_IN: "ปรับเพิ่ม",
  ADJUSTMENT_OUT: "ปรับลด",
  SALE_OUT: "ขายออก"
};

export function InventoryMovementPage() {
  const movements = useQuery({ queryKey: ["movements"], queryFn: () => api<Movement[]>("/inventory/movements") });
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-black">ประวัติสต็อก</h1>
        <p className="text-stone-600">ตรวจย้อนหลังว่าสต็อกเปลี่ยนจากรับเข้า ปรับยอด หรือขายหน้าร้าน</p>
      </div>
      <Card>
        {movements.isLoading ? <p className="text-sm text-stone-500">กำลังโหลดประวัติ...</p> : null}
        {movements.error ? <p className="text-sm text-red-700">โหลดประวัติไม่สำเร็จ: {movements.error.message}</p> : null}
        <div className="space-y-3">
          {movements.data?.map((movement) => (
            <div key={movement.id} className="grid gap-2 rounded-md border border-stone-200 p-3 text-sm md:grid-cols-[1fr_140px_160px_180px]">
              <div>
                <p className="font-bold">{movement.product.name}</p>
                <p className="text-xs text-stone-500">{movement.reference ?? "ไม่มีเลขอ้างอิง"}</p>
              </div>
              <p>{movementLabels[movement.type] ?? movement.type}</p>
              <p>จำนวน {number(movement.quantity)}</p>
              <p className="text-stone-500">คงเหลือ {number(movement.balanceAfter ?? 0)} / {thaiDate(movement.createdAt)}</p>
            </div>
          ))}
          {movements.data?.length === 0 ? <p className="text-sm text-stone-500">ยังไม่มีประวัติสต็อก</p> : null}
        </div>
      </Card>
    </div>
  );
}
