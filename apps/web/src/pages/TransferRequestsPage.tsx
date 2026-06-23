import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Eye, PackageCheck, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { api, patch } from "../lib/api";
import { branchScopedPath } from "../lib/branch-scope";
import { number, thaiDate } from "../lib/format";
import { TRANSFER_STATUS_LABELS, type TransferStatus } from "../lib/transfers";
import { useAuth } from "../state/auth";
import { useWorkingBranch } from "../state/working-branch";

type WarehouseOption = { id: string; branchId?: string; name: string; code: string; branch?: { id: string; name: string } };
type Session = ReturnType<typeof useAuth.getState>["session"];
type TransferRequest = {
  id: string;
  documentNo: string;
  status: TransferStatus;
  note?: string | null;
  createdAt: string;
  requestedBy?: { id?: string; name: string } | null;
  createdBy?: { id?: string; name: string } | null;
  sourceWarehouse: WarehouseOption;
  destinationWarehouse: WarehouseOption;
  items: Array<{ id: string; quantity: number; product: { id: string; name: string; sku: string; unit?: string } }>;
};

function statusBadge(status: TransferStatus) {
  const badge = TRANSFER_STATUS_LABELS[status];
  return <span className={`rounded px-2 py-1 text-xs font-bold ${badge.className}`}>{badge.label}</span>;
}

function branchIdOf(warehouse?: WarehouseOption) {
  return warehouse?.branchId ?? warehouse?.branch?.id;
}

function warehouseLabel(warehouse?: WarehouseOption) {
  if (!warehouse) return "-";
  return `${warehouse.branch?.name ?? "ไม่ระบุสาขา"} / ${warehouse.name}`;
}

function canManageBranch(session: Session, warehouse?: WarehouseOption) {
  const role = session?.business?.role;
  if (session?.user.isSystemAdmin || role === "OWNER") return true;
  if (role !== "MANAGER" && role !== "BRANCH_MANAGER") return false;
  const branchId = branchIdOf(warehouse);
  return Boolean(branchId && session?.business?.assignedBranchIds?.includes(branchId));
}

function refreshTransferQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["transfers"] });
  queryClient.invalidateQueries({ queryKey: ["notifications"] });
  queryClient.invalidateQueries({ queryKey: ["products"] });
  queryClient.invalidateQueries({ queryKey: ["inventory-balances"] });
  queryClient.invalidateQueries({ queryKey: ["movements"] });
  queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  queryClient.invalidateQueries({ queryKey: ["stock-report"] });
}

export function TransferRequestsPage() {
  const queryClient = useQueryClient();
  const session = useAuth((state) => state.session);
  const workingBranchId = useWorkingBranch((state) => state.workingBranchId);
  const [detailTransfer, setDetailTransfer] = useState<TransferRequest | null>(null);
  const [message, setMessage] = useState("");
  const incoming = useQuery({
    queryKey: ["transfers", "requests-page", "in-transit", workingBranchId],
    queryFn: () => api<TransferRequest[]>(branchScopedPath("/inventory/transfers?status=IN_TRANSIT&side=destination", workingBranchId)),
    refetchInterval: 5000,
    refetchOnWindowFocus: true
  });

  const receiveMutation = useMutation({
    mutationFn: (id: string) => patch<TransferRequest>(`/inventory/transfers/${id}/receive`, {}),
    onSuccess: () => {
      setMessage("รับสินค้าเข้าปลายทางแล้ว");
      refreshTransferQueries(queryClient);
    }
  });
  const cancelMutation = useMutation({
    mutationFn: (id: string) => patch<TransferRequest>(`/inventory/transfers/${id}/cancel`, {}),
    onSuccess: () => {
      setMessage("ยกเลิกเอกสารและคืนสต็อกต้นทางแล้ว");
      refreshTransferQueries(queryClient);
    }
  });

  const error = incoming.error?.message ?? receiveMutation.error?.message ?? cancelMutation.error?.message;
  const incomingTransfers = useMemo(
    () => (incoming.data ?? []).filter((transfer) => !workingBranchId || branchIdOf(transfer.destinationWarehouse) === workingBranchId),
    [incoming.data, workingBranchId]
  );
  const closeDetail = () => setDetailTransfer(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-ink">รอยืนยันรับของ</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-stone-600">เอกสารที่ต้นทางส่งออกแล้ว และรอปลายทางยืนยันรับเข้าคลัง</p>
        </div>
        <Link to="/app/transfers">
          <Button className="h-9 px-3" variant="secondary" icon={<ArrowLeft size={17} />}>ย้อนกลับ</Button>
        </Link>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Metric icon={<PackageCheck size={18} />} label="รอยืนยันรับของ" value={`${number(incomingTransfers.length)} ใบ`} />
        <Metric icon={<Check size={18} />} label="จัดการได้" value={`${number(incomingTransfers.filter((transfer) => canManageBranch(session, transfer.destinationWarehouse)).length)} ใบ`} />
      </div>

      {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p> : null}
      {message ? <p className="rounded-md bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-700">{message}</p> : null}

      <Card className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 p-4">
          <div>
            <h2 className="text-lg font-black text-ink">รอยืนยันรับของ</h2>
            <p className="mt-0.5 text-sm text-stone-500">เอกสารที่ต้นทางส่งออกแล้ว และรอปลายทางยืนยันรับเข้าคลัง</p>
          </div>
          <Button className="h-9 px-3" variant="ghost" onClick={() => incoming.refetch()} disabled={incoming.isFetching}>รีเฟรช</Button>
        </div>
        <div className="table-shell border-0 shadow-none">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="bg-stone-50 text-stone-500">
              <tr>
                <th className="p-3">เลขเอกสาร</th>
                <th className="p-3">สถานะ</th>
                <th className="p-3">ต้นทาง</th>
                <th className="p-3">ปลายทาง</th>
                <th className="p-3">สินค้า</th>
                <th className="p-3">วันที่</th>
                <th className="p-3 text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {incomingTransfers.map((transfer) => {
                const canReceive = canManageBranch(session, transfer.destinationWarehouse);
                const canCancel = canManageBranch(session, transfer.sourceWarehouse);
                return (
                  <tr key={transfer.id} className="border-t border-stone-100 align-top">
                    <td className="p-3 font-black text-ink">{transfer.documentNo}</td>
                    <td className="p-3">{statusBadge(transfer.status)}</td>
                    <td className="p-3 text-stone-600">{warehouseLabel(transfer.sourceWarehouse)}</td>
                    <td className="p-3 text-stone-600">{warehouseLabel(transfer.destinationWarehouse)}</td>
                    <td className="p-3 text-stone-600">{transfer.items.map((item) => `${item.product.name} x ${number(item.quantity)} ${item.product.unit ?? ""}`).join(", ")}</td>
                    <td className="p-3 text-stone-500">{thaiDate(transfer.createdAt)}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button className="h-9 px-3" type="button" variant="secondary" icon={<Eye size={16} />} onClick={() => setDetailTransfer(transfer)}>รายละเอียด</Button>
                        {canReceive ? (
                          <Button className="h-9 px-3" icon={<Check size={16} />} disabled={receiveMutation.isPending} onClick={() => receiveMutation.mutate(transfer.id)}>ยืนยันรับ</Button>
                        ) : null}
                        {canCancel ? (
                          <Button className="h-9 px-3" variant="danger" icon={<X size={16} />} disabled={cancelMutation.isPending} onClick={() => cancelMutation.mutate(transfer.id)}>ยกเลิก</Button>
                        ) : null}
                        {!canReceive && !canCancel ? (
                          <span className="text-right text-xs font-semibold text-stone-400">รอผู้จัดการปลายทาง</span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!incoming.isLoading && incomingTransfers.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-sm font-semibold text-stone-500">ยังไม่มีสินค้าโอนที่รอรับ</td></tr>
              ) : null}
              {incoming.isLoading ? (
                <tr><td colSpan={7} className="p-8 text-center text-sm font-semibold text-stone-500">กำลังโหลดรายการรอยืนยันรับของ...</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      {detailTransfer ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4" role="dialog" aria-modal="true" aria-labelledby="transfer-request-detail-title" onMouseDown={closeDetail}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-md bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b border-stone-200 p-5">
              <div>
                <p className="text-xs font-black uppercase text-teal-700">รอยืนยันรับของ</p>
                <h2 id="transfer-request-detail-title" className="mt-1 text-xl font-black text-ink">{detailTransfer.documentNo}</h2>
                <div className="mt-2">{statusBadge(detailTransfer.status)}</div>
              </div>
              <button type="button" className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-stone-200 text-stone-600 transition hover:bg-stone-50" aria-label="ปิดรายละเอียดคำขอโอนสินค้า" onClick={closeDetail}>
                <X size={18} />
              </button>
            </div>

            <div className="space-y-5 p-5">
              <div className="grid gap-3 md:grid-cols-2">
                <DetailBlock label="ต้นทาง" value={warehouseLabel(detailTransfer.sourceWarehouse)} />
                <DetailBlock label="ปลายทาง" value={warehouseLabel(detailTransfer.destinationWarehouse)} />
                <DetailBlock label="ผู้ขอ" value={detailTransfer.requestedBy?.name ?? detailTransfer.createdBy?.name ?? "-"} />
                <DetailBlock label="วันที่สร้าง" value={thaiDate(detailTransfer.createdAt)} />
              </div>

              <div>
                <h3 className="text-sm font-black text-ink">รายการสินค้า</h3>
                <div className="mt-2 divide-y divide-stone-100 rounded-md border border-stone-200">
                  {detailTransfer.items.map((item) => (
                    <div key={item.id} className="grid gap-2 p-3 sm:grid-cols-[1fr_auto]">
                      <div className="min-w-0">
                        <p className="truncate font-bold text-ink">{item.product.name}</p>
                        <p className="mt-0.5 text-xs font-semibold text-stone-500">SKU {item.product.sku}</p>
                      </div>
                      <p className="font-black text-stone-700">{number(item.quantity)} {item.product.unit ?? ""}</p>
                    </div>
                  ))}
                </div>
              </div>

              <DetailBlock label="หมายเหตุ" value={detailTransfer.note || "-"} />

              <div className="flex flex-wrap justify-end gap-2 border-t border-stone-200 pt-4">
                <Button type="button" variant="ghost" onClick={closeDetail}>ปิด</Button>
                {detailTransfer.status === "IN_TRANSIT" && canManageBranch(session, detailTransfer.destinationWarehouse) ? (
                  <Button type="button" icon={<Check size={16} />} disabled={receiveMutation.isPending} onClick={() => { receiveMutation.mutate(detailTransfer.id); closeDetail(); }}>ยืนยันรับ</Button>
                ) : null}
                {detailTransfer.status === "IN_TRANSIT" && canManageBranch(session, detailTransfer.sourceWarehouse) ? (
                  <Button type="button" variant="danger" icon={<X size={16} />} disabled={cancelMutation.isPending} onClick={() => { cancelMutation.mutate(detailTransfer.id); closeDetail(); }}>ยกเลิก</Button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DetailBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2">
      <p className="text-xs font-bold text-stone-500">{label}</p>
      <p className="mt-0.5 font-black text-ink">{value}</p>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-stone-500">
        {icon}
        <p className="text-sm font-semibold">{label}</p>
      </div>
      <p className="mt-2 text-2xl font-black text-ink">{value}</p>
    </div>
  );
}
