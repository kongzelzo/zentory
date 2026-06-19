import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Boxes, ChevronLeft, ChevronRight, ClipboardList, PackageCheck, ReceiptText, RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Dropdown } from "../components/Dropdown";
import { api } from "../lib/api";
import { number, thaiDate } from "../lib/format";
import { useWorkingBranch } from "../state/working-branch";

type AdjustmentMode = "SET_ACTUAL" | "INCREASE" | "DECREASE";
type Movement = {
  id: string;
  type: string;
  quantity: number;
  balanceBefore?: number;
  balanceAfter?: number;
  adjustmentMode?: AdjustmentMode;
  targetQuantity?: number;
  reason?: string;
  reference?: string;
  createdAt: string;
  product: { id?: string; name: string; sku?: string };
  warehouse?: { id?: string; name: string; branch?: { name: string } };
  transfer?: {
    id: string;
    documentNo: string;
    sourceWarehouse?: { id?: string; name: string; branch?: { name: string } };
    destinationWarehouse?: { id?: string; name: string; branch?: { name: string } };
  } | null;
  user?: { name: string };
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

const adjustmentModeLabels: Record<AdjustmentMode, string> = {
  SET_ACTUAL: "ตั้งยอดจริง",
  INCREASE: "ปรับเพิ่ม",
  DECREASE: "ปรับลด"
};

const movementOptions = [
  { value: "ALL", label: "ทุกประเภท" },
  { value: "RECEIVE_IN", label: "รับเข้า" },
  { value: "ADJUSTMENT", label: "ปรับสต็อก" },
  { value: "TRANSFER", label: "โอนสินค้า" },
  { value: "SALE_OUT", label: "ขายออก" }
];

const pageLimitOptions = [
  { value: "10", label: "10" },
  { value: "20", label: "20" },
  { value: "50", label: "50" },
  { value: "100", label: "100" }
];

function movementLabel(movement: Movement) {
  return movement.adjustmentMode ? adjustmentModeLabels[movement.adjustmentMode] : movementLabels[movement.type] ?? movement.type;
}

function movementDetail(movement: Movement) {
  if (movement.adjustmentMode === "SET_ACTUAL") return `ตั้งเป็น ${number(movement.targetQuantity ?? movement.balanceAfter ?? 0)}`;
  if (movement.type === "ADJUSTMENT_IN") return `เพิ่ม ${number(movement.quantity)}`;
  if (movement.type === "ADJUSTMENT_OUT") return `ลด ${number(movement.quantity)}`;
  if (movement.type === "TRANSFER_OUT") return `ไป ${warehouseRouteLabel(movement.transfer?.destinationWarehouse)} • ${number(movement.quantity)}`;
  if (movement.type === "TRANSFER_IN") return `จาก ${warehouseRouteLabel(movement.transfer?.sourceWarehouse)} • ${number(movement.quantity)}`;
  if (movement.type === "TRANSFER_CANCEL") return `คืนกลับ ${number(movement.quantity)}`;
  return `จำนวน ${number(movement.quantity)}`;
}

function movementTone(movement: Movement) {
  if (movement.type === "RECEIVE_IN" || movement.type === "ADJUSTMENT_IN" || movement.type === "TRANSFER_IN" || movement.type === "TRANSFER_CANCEL") return "bg-teal-50 text-teal-800 ring-teal-100";
  if (movement.type === "SALE_OUT" || movement.type === "ADJUSTMENT_OUT" || movement.type === "TRANSFER_OUT") return "bg-amber-50 text-amber-800 ring-amber-100";
  return "bg-stone-100 text-stone-700 ring-stone-200";
}

function movementIcon(movement: Movement) {
  if (movement.type === "RECEIVE_IN") return <PackageCheck size={16} />;
  if (movement.type === "SALE_OUT") return <ReceiptText size={16} />;
  if (movement.type === "ADJUSTMENT_IN") return <ArrowUp size={16} />;
  if (movement.type === "ADJUSTMENT_OUT") return <ArrowDown size={16} />;
  if (movement.type.startsWith("TRANSFER_")) return <RotateCcw size={16} />;
  return <ClipboardList size={16} />;
}

function movementDelta(movement: Movement) {
  const sign = movement.type === "SALE_OUT" || movement.type === "ADJUSTMENT_OUT" || movement.type === "TRANSFER_OUT" ? "-" : "+";
  return `${sign}${number(movement.quantity)}`;
}

function matchesMovementType(movement: Movement, selectedType: string) {
  if (selectedType === "ALL") return true;
  if (selectedType === "ADJUSTMENT") return movement.type === "ADJUSTMENT_IN" || movement.type === "ADJUSTMENT_OUT";
  if (selectedType === "TRANSFER") return movement.type.startsWith("TRANSFER_");
  return movement.type === selectedType;
}

function warehouseRouteLabel(warehouse?: Movement["warehouse"]) {
  if (!warehouse) return "ไม่ระบุปลายทาง";
  const branchName = warehouse.branch?.name;
  if (!branchName || branchName === warehouse.name) return warehouse.name;
  return `${branchName} / ${warehouse.name}`;
}

function movementPath(branchId: string) {
  const params = new URLSearchParams();
  if (branchId) params.set("branchId", branchId);
  const query = params.toString();
  return query ? `/inventory/movements?${query}` : "/inventory/movements";
}

function StatCard({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-stone-500">{label}</p>
          <p className="mt-2 text-2xl font-black text-ink">{value}</p>
          <p className="mt-1 text-sm text-stone-500">{detail}</p>
        </div>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-teal-50 text-leaf">{icon}</span>
      </div>
    </Card>
  );
}

export function InventoryMovementPage() {
  const [search, setSearch] = useState("");
  const [movementType, setMovementType] = useState("ALL");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const workingBranchId = useWorkingBranch((state) => state.workingBranchId);
  const movements = useQuery({
    queryKey: ["movements", workingBranchId],
    queryFn: () => api<Movement[]>(movementPath(workingBranchId)),
    enabled: Boolean(workingBranchId)
  });
  const data = movements.data ?? [];
  const filteredMovements = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return data.filter((movement) => {
      const currentWarehouse = movement.warehouse?.name ?? "คลังหลัก";
      const searchable = [
        movement.product.name,
        movement.product.sku,
        movement.reference,
        movement.reason,
        currentWarehouse,
        movement.warehouse?.branch?.name,
        movement.transfer?.sourceWarehouse?.branch?.name,
        movement.transfer?.sourceWarehouse?.name,
        movement.transfer?.destinationWarehouse?.branch?.name,
        movement.transfer?.destinationWarehouse?.name,
        movement.user?.name,
        movementLabel(movement)
      ].filter(Boolean).join(" ").toLowerCase();
      return matchesMovementType(movement, movementType) && (!keyword || searchable.includes(keyword));
    });
  }, [data, movementType, search]);
  const totalPages = Math.max(1, Math.ceil(filteredMovements.length / limit));
  const pagedMovements = useMemo(() => filteredMovements.slice((page - 1) * limit, page * limit), [filteredMovements, limit, page]);
  useEffect(() => {
    setPage(1);
  }, [limit, movementType, search]);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);
  const summary = useMemo(() => {
    const inbound = data.filter((movement) => movement.type === "RECEIVE_IN" || movement.type === "ADJUSTMENT_IN").reduce((sum, movement) => sum + movement.quantity, 0);
    const outbound = data.filter((movement) => movement.type === "SALE_OUT" || movement.type === "ADJUSTMENT_OUT").reduce((sum, movement) => sum + movement.quantity, 0);
    const adjustments = data.filter((movement) => movement.type === "ADJUSTMENT_IN" || movement.type === "ADJUSTMENT_OUT").length;
    return { inbound, outbound, adjustments, latest: data[0]?.createdAt };
  }, [data]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black">ประวัติสต็อก</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-stone-600">ตรวจย้อนหลังว่าสต็อกเปลี่ยนจากรับเข้า ปรับยอด หรือขายหน้าร้าน พร้อมผู้ทำรายการ คลัง เหตุผล และยอดก่อน-หลัง</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/app/inventory/receipts"><Button variant="secondary" icon={<PackageCheck size={16} />}>รับเข้า</Button></Link>
          <Link to="/app/inventory/adjustments"><Button icon={<SlidersHorizontal size={16} />}>ปรับสต็อก</Button></Link>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <StatCard icon={<Boxes size={18} />} label="รายการทั้งหมด" value={`${number(data.length)} รายการ`} detail={summary.latest ? `ล่าสุด ${thaiDate(summary.latest)}` : "ยังไม่มี movement"} />
        <StatCard icon={<ArrowUp size={18} />} label="เข้า" value={number(summary.inbound)} detail="รับเข้าและปรับเพิ่ม" />
        <StatCard icon={<ArrowDown size={18} />} label="ออก" value={number(summary.outbound)} detail="ขายออกและปรับลด" />
        <StatCard icon={<ClipboardList size={18} />} label="ปรับสต็อก" value={`${number(summary.adjustments)} ครั้ง`} detail="รายการที่มีการแก้ยอด" />
      </div>

      <Card className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_190px_auto]">
          <label className="field-icon-wrap">
            <Search className="field-icon" size={17} />
            <input className="field field-with-left-icon h-11" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหาสินค้า SKU เลขอ้างอิง เหตุผล หรือผู้ทำรายการ" />
          </label>
          <Dropdown options={movementOptions} value={movementType} onValueChange={setMovementType} buttonClassName="h-11" aria-label="กรองประเภทประวัติสต็อก" />
          <Button type="button" variant="ghost" icon={<RotateCcw size={16} />} onClick={() => { setSearch(""); setMovementType("ALL"); setPage(1); }}>
            ล้างตัวกรอง
          </Button>
        </div>

        {!workingBranchId ? <p className="text-sm text-stone-500">กำลังเตรียมสาขาที่ใช้งาน...</p> : null}
        {movements.isLoading ? <p className="text-sm text-stone-500">กำลังโหลดประวัติ...</p> : null}
        {movements.error ? <p className="text-sm text-red-700">โหลดประวัติไม่สำเร็จ: {movements.error.message}</p> : null}
        <div className="table-shell -mx-5 border-x-0 shadow-none sm:mx-0 sm:border-x sm:shadow-sm">
          <table className="w-full min-w-[1040px] text-left text-sm">
            <thead className="bg-stone-50 text-stone-500">
              <tr>
                <th className="p-3 text-right">ลำดับ</th>
                <th className="p-3">สินค้า</th>
                <th className="p-3">ประเภท</th>
                <th className="p-3">คลัง</th>
                <th className="p-3 text-right">เปลี่ยน</th>
                <th className="p-3 text-right">ก่อน</th>
                <th className="p-3 text-right">หลัง</th>
                <th className="p-3">อ้างอิง / เหตุผล</th>
                <th className="p-3">ผู้ทำรายการ</th>
                <th className="p-3">วันที่</th>
              </tr>
            </thead>
            <tbody>
              {pagedMovements.map((movement, index) => (
                <tr key={movement.id} className="border-t border-stone-100 align-top hover:bg-stone-50">
                  <td className="p-3 text-right font-semibold text-stone-500">{number((page - 1) * limit + index + 1)}</td>
                  <td className="p-3">
                    <p className="font-bold text-ink">{movement.product.name}</p>
                    <p className="mt-0.5 text-xs text-stone-500">{movement.product.sku ? `SKU ${movement.product.sku}` : "ไม่มี SKU"}</p>
                  </td>
                  <td className="p-3">
                    <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-black ring-1 ${movementTone(movement)}`}>
                      {movementIcon(movement)}
                      {movementLabel(movement)}
                    </span>
                    <p className="mt-1 text-xs text-stone-500">{movementDetail(movement)}</p>
                  </td>
                  <td className="p-3 font-semibold text-ink">{movement.warehouse?.name ?? "คลังหลัก"}</td>
                  <td className={`p-3 text-right font-black ${movementDelta(movement).startsWith("-") ? "text-amber-700" : "text-teal-700"}`}>{movementDelta(movement)}</td>
                  <td className="p-3 text-right text-stone-600">{movement.balanceBefore === undefined ? "-" : number(movement.balanceBefore)}</td>
                  <td className="p-3 text-right font-black text-ink">{movement.balanceAfter === undefined ? "-" : number(movement.balanceAfter)}</td>
                  <td className="max-w-[220px] p-3">
                    <p className="truncate font-semibold text-ink">{movement.reference ?? "ไม่มีเลขอ้างอิง"}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-stone-500">{movement.reason ?? "ไม่มีเหตุผลเพิ่มเติม"}</p>
                  </td>
                  <td className="p-3 text-stone-600">{movement.user?.name ?? "ระบบ"}</td>
                  <td className="p-3 text-stone-600">{thaiDate(movement.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!movements.isLoading && data.length === 0 ? <p className="rounded-md bg-stone-50 p-4 text-sm text-stone-600">ยังไม่มีประวัติสต็อก เมื่อรับเข้า ปรับสต็อก หรือขายสินค้าแล้ว รายการจะมาแสดงที่นี่</p> : null}
        {!movements.isLoading && data.length > 0 && filteredMovements.length === 0 ? <p className="rounded-md bg-stone-50 p-4 text-sm text-stone-600">ไม่พบรายการที่ตรงกับตัวกรองนี้</p> : null}
        <div className="flex flex-col gap-3 border-t border-stone-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-stone-600">
            <span>แสดง</span>
            <Dropdown options={pageLimitOptions} value={String(limit)} onValueChange={(value) => setLimit(Number(value))} className="w-24" buttonClassName="h-10 min-h-0 py-0" menuClassName="w-24" aria-label="จำนวนรายการต่อหน้า" />
            <span>รายการต่อหน้า</span>
          </div>
          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <p className="text-sm font-semibold text-stone-600">หน้า {number(page)} / {number(totalPages)}</p>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" icon={<ChevronLeft size={16} />} disabled={page <= 1 || movements.isFetching} onClick={() => setPage((current) => Math.max(1, current - 1))}>ก่อนหน้า</Button>
              <Button type="button" variant="secondary" icon={<ChevronRight size={16} />} disabled={page >= totalPages || movements.isFetching} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>ถัดไป</Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
