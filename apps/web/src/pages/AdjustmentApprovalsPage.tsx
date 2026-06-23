import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ClipboardList, Filter, PackageCheck, Repeat, UserPlus, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { api, patch } from "../lib/api";
import { branchScopedPath } from "../lib/branch-scope";
import { number, thaiDate } from "../lib/format";
import { TRANSFER_STATUS_LABELS, type TransferStatus } from "../lib/transfers";
import { useAuth } from "../state/auth";
import { useWorkingBranch } from "../state/working-branch";

type ApprovalFilter = "PENDING" | "HISTORY";

type Adjustment = {
  id: string;
  documentNo: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  quantity: number;
  adjustmentMode?: string | null;
  targetQuantity?: number | null;
  reason: string;
  rejectionReason?: string | null;
  createdAt: string;
  reviewedAt?: string | null;
  product?: { name: string; sku: string; unit?: string | null } | null;
  warehouse?: { name: string; branch?: { name: string } | null } | null;
  requestedBy?: { name: string; email?: string } | null;
  reviewedBy?: { name: string; email?: string } | null;
};

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

export function AdjustmentApprovalsPage() {
  const queryClient = useQueryClient();
  const session = useAuth((state) => state.session);
  const workingBranchId = useWorkingBranch((state) => state.workingBranchId);
  const [filter, setFilter] = useState<ApprovalFilter>("PENDING");
  const [message, setMessage] = useState("");
  const query = useQuery({ queryKey: ["adjustments", "all"], queryFn: () => api<Adjustment[]>("/inventory/adjustments") });
  const transferQuery = useQuery({
    queryKey: ["transfers", "approvals-page", workingBranchId],
    queryFn: () => api<TransferRequest[]>(branchScopedPath("/inventory/transfers?status=REQUESTED&side=source", workingBranchId)),
    refetchInterval: 5000,
    refetchOnWindowFocus: true
  });
  const approve = useMutation({
    mutationFn: (id: string) => patch(`/inventory/adjustments/${id}/approve`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["adjustments"] })
  });
  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => patch(`/inventory/adjustments/${id}/reject`, { reason }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["adjustments"] })
  });
  const approveTransfer = useMutation({
    mutationFn: (id: string) => patch<TransferRequest>(`/inventory/transfers/${id}/source-approve`, {}),
    onSuccess: () => {
      setMessage("อนุมัติส่งออกแล้ว สินค้าอยู่ระหว่างทาง");
      refreshTransferQueries(queryClient);
    }
  });
  const rejectTransfer = useMutation({
    mutationFn: (id: string) => patch<TransferRequest>(`/inventory/transfers/${id}/source-reject`, {}),
    onSuccess: () => {
      setMessage("ปฏิเสธคำขอโอนสินค้าแล้ว");
      refreshTransferQueries(queryClient);
    }
  });
  const items = query.data ?? [];
  const pending = items.filter((item) => item.status === "PENDING");
  const history = items.filter((item) => item.status !== "PENDING");
  const visibleItems = filter === "PENDING" ? pending : history;
  const transferRequests = useMemo(
    () => (transferQuery.data ?? []).filter((transfer) => !workingBranchId || branchIdOf(transfer.sourceWarehouse) === workingBranchId),
    [transferQuery.data, workingBranchId]
  );
  const stats = useMemo(() => ({
    pendingStockAdjustments: pending.length,
    pendingTransfers: transferRequests.length,
    approved: history.filter((item) => item.status === "APPROVED").length,
    rejected: history.filter((item) => item.status === "REJECTED").length
  }), [history, pending.length, transferRequests.length]);
  const pendingWorkCount = stats.pendingStockAdjustments + stats.pendingTransfers;
  const error = query.error?.message ?? transferQuery.error?.message ?? approveTransfer.error?.message ?? rejectTransfer.error?.message;

  function rejectAdjustment(item: Adjustment) {
    const reason = window.prompt(`เหตุผลที่ปฏิเสธ ${item.documentNo}`) ?? "";
    if (reason.trim()) reject.mutate({ id: item.id, reason });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black">รออนุมัติ</h1>
          <p className="text-stone-600">ศูนย์รวมงานที่ต้องตรวจและอนุมัติก่อนให้ระบบดำเนินการต่อ</p>
        </div>
        <span className="rounded-md bg-amber-50 px-3 py-2 text-sm font-black text-amber-800 ring-1 ring-amber-100">
          {number(pendingWorkCount)} งานรออนุมัติ
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <ApprovalMetric icon={<Repeat size={18} />} label="โอนสินค้ารออนุมัติ" value={stats.pendingTransfers} tone="sky" />
        <ApprovalMetric icon={<PackageCheck size={18} />} label="ปรับสต็อกรออนุมัติ" value={stats.pendingStockAdjustments} tone="amber" />
        <ApprovalMetric icon={<CheckCircle2 size={18} />} label="อนุมัติแล้ว" value={stats.approved} tone="teal" />
        <ApprovalMetric icon={<XCircle size={18} />} label="ปฏิเสธแล้ว" value={stats.rejected} tone="red" />
      </div>

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Filter size={18} className="text-stone-500" />
            <h2 className="text-xl font-black">รายการอนุมัติ</h2>
          </div>
          <div className="flex rounded-md border border-stone-200 bg-stone-50 p-1">
            <FilterButton active={filter === "PENDING"} onClick={() => setFilter("PENDING")}>รออนุมัติ</FilterButton>
            <FilterButton active={filter === "HISTORY"} onClick={() => setFilter("HISTORY")}>ประวัติ</FilterButton>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[220px_1fr]">
          <div className="space-y-2">
            <ApprovalTypePill icon={<PackageCheck size={16} />} label="ปรับสต็อก" count={pending.length} active />
            <ApprovalTypePill icon={<Repeat size={16} />} label="โอนสินค้า" count={transferRequests.length} active={transferRequests.length > 0} />
            <ApprovalTypePill icon={<ClipboardList size={16} />} label="นับสต็อก" count={0} />
            <ApprovalTypePill icon={<UserPlus size={16} />} label="พนักงาน" count={0} />
          </div>

          <div className="space-y-3">
            {query.isLoading || transferQuery.isLoading ? <p className="rounded-md border border-stone-200 p-4 text-sm font-semibold text-stone-500">กำลังโหลดงานรออนุมัติ...</p> : null}
            {message ? <p className="rounded-md bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-700">{message}</p> : null}
            {error ? <p className="rounded-md border border-red-100 bg-red-50 p-4 text-sm font-semibold text-red-700">โหลดงานรออนุมัติไม่สำเร็จ: {error}</p> : null}
            {!query.isLoading && !transferQuery.isLoading && filter === "PENDING" && transferRequests.length === 0 && visibleItems.length === 0 ? (
              <p className="rounded-md border border-dashed border-stone-300 p-6 text-center font-semibold text-stone-500">
                ไม่มีงานรออนุมัติ
              </p>
            ) : null}
            {!query.isLoading && filter === "HISTORY" && visibleItems.length === 0 ? (
              <p className="rounded-md border border-dashed border-stone-300 p-6 text-center font-semibold text-stone-500">ยังไม่มีประวัติอนุมัติ</p>
            ) : null}
            {filter === "PENDING" ? transferRequests.map((transfer) => (
              <TransferApprovalRow
                key={transfer.id}
                transfer={transfer}
                canApprove={canManageBranch(session, transfer.sourceWarehouse)}
                isBusy={approveTransfer.isPending || rejectTransfer.isPending}
                onApprove={() => approveTransfer.mutate(transfer.id)}
                onReject={() => rejectTransfer.mutate(transfer.id)}
              />
            )) : null}
            {visibleItems.map((item) => (
              <ApprovalRow
                key={item.id}
                item={item}
                isBusy={approve.isPending || reject.isPending}
                onApprove={() => approve.mutate(item.id)}
                onReject={() => rejectAdjustment(item)}
              />
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}

function ApprovalMetric({ icon, label, value, tone }: { icon: JSX.Element; label: string; value: number; tone: "amber" | "teal" | "red" | "sky" }) {
  const color = tone === "amber" ? "text-amber-700 bg-amber-50" : tone === "teal" ? "text-leaf bg-teal-50" : tone === "sky" ? "text-sky-700 bg-sky-50" : "text-red-700 bg-red-50";
  return (
    <Card className="p-4">
      <span className={`mb-3 inline-grid h-9 w-9 place-items-center rounded-md ${color}`}>{icon}</span>
      <p className="text-sm font-bold text-stone-500">{label}</p>
      <p className="mt-1 text-3xl font-black text-ink">{number(value)}</p>
    </Card>
  );
}

function FilterButton({ active, children, onClick }: { active: boolean; children: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`h-9 rounded px-3 text-sm font-black transition ${active ? "bg-white text-leaf shadow-sm" : "text-stone-500 hover:text-ink"}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function ApprovalTypePill({ icon, label, count, active = false }: { icon: JSX.Element; label: string; count: number; active?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 rounded-md border p-3 text-sm font-bold ${active ? "border-teal-100 bg-teal-50 text-leaf" : "border-stone-200 bg-stone-50 text-stone-500"}`}>
      <span className="flex items-center gap-2">{icon}{label}</span>
      <span>{number(count)}</span>
    </div>
  );
}

function TransferApprovalRow({
  transfer,
  canApprove,
  isBusy,
  onApprove,
  onReject
}: {
  transfer: TransferRequest;
  canApprove: boolean;
  isBusy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const badge = TRANSFER_STATUS_LABELS[transfer.status];
  return (
    <article className="rounded-md border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-sky-50 px-2 py-0.5 text-xs font-black text-sky-700 ring-1 ring-sky-100">โอนสินค้า</span>
            <span className="font-black text-ink">{transfer.documentNo}</span>
            <span className={`rounded px-2 py-0.5 text-xs font-black ${badge.className}`}>{badge.label}</span>
          </div>
          <p className="mt-2 text-sm text-stone-600">{warehouseLabel(transfer.sourceWarehouse)} ไป {warehouseLabel(transfer.destinationWarehouse)}</p>
          <div className="mt-2 space-y-1">
            {transfer.items.map((item) => (
              <p key={item.id} className="text-sm font-semibold text-stone-700">
                {item.product.name} <span className="text-stone-400">SKU {item.product.sku}</span> x {number(item.quantity)} {item.product.unit ?? ""}
              </p>
            ))}
          </div>
          {transfer.note ? <p className="mt-2 text-sm text-stone-600">หมายเหตุ: {transfer.note}</p> : null}
          <p className="mt-1 text-xs font-semibold text-stone-500">ผู้ขอ {transfer.requestedBy?.name ?? transfer.createdBy?.name ?? "-"} • {thaiDate(transfer.createdAt)}</p>
        </div>
        {canApprove ? (
          <div className="flex gap-2">
            <Button icon={<CheckCircle2 size={16} />} disabled={isBusy} onClick={onApprove}>อนุมัติส่งออก</Button>
            <Button variant="secondary" icon={<XCircle size={16} />} disabled={isBusy} onClick={onReject}>ปฏิเสธ</Button>
          </div>
        ) : (
          <span className="rounded-md bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-500">รอผู้จัดการสาขาต้นทาง</span>
        )}
      </div>
    </article>
  );
}

function ApprovalRow({ item, isBusy, onApprove, onReject }: { item: Adjustment; isBusy: boolean; onApprove: () => void; onReject: () => void }) {
  return (
    <article className="rounded-md border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-teal-50 px-2 py-0.5 text-xs font-black text-leaf ring-1 ring-teal-100">ปรับสต็อก</span>
            <span className="font-black text-ink">{item.documentNo}</span>
            <span className={`rounded px-2 py-0.5 text-xs font-black ${item.status === "PENDING" ? "bg-amber-50 text-amber-700" : item.status === "APPROVED" ? "bg-teal-50 text-leaf" : "bg-red-50 text-red-700"}`}>{statusLabel(item.status)}</span>
          </div>
          <p className="mt-2 text-sm text-stone-600">{item.product?.name ?? "ไม่ระบุสินค้า"} • {item.product?.sku ?? "-"} • {item.warehouse?.branch?.name ?? "-"} / {item.warehouse?.name ?? "-"}</p>
          <p className="mt-2 font-black text-ink">{quantityLabel(item)}</p>
          <p className="mt-1 text-sm text-stone-600">เหตุผล: {item.reason}</p>
          <p className="mt-1 text-xs font-semibold text-stone-500">ผู้ขอ {item.requestedBy?.name ?? "-"} • {thaiDate(item.createdAt)}</p>
          {item.reviewedAt ? <p className="mt-1 text-xs font-semibold text-stone-500">ตรวจโดย {item.reviewedBy?.name ?? "-"} • {thaiDate(item.reviewedAt)}</p> : null}
          {item.rejectionReason ? <p className="mt-2 rounded-md bg-red-50 p-2 text-sm font-semibold text-red-700">เหตุผลปฏิเสธ: {item.rejectionReason}</p> : null}
        </div>
        {item.status === "PENDING" ? (
          <div className="flex gap-2">
            <Button icon={<CheckCircle2 size={16} />} disabled={isBusy} onClick={onApprove}>อนุมัติ</Button>
            <Button variant="secondary" icon={<XCircle size={16} />} disabled={isBusy} onClick={onReject}>ปฏิเสธ</Button>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function statusLabel(status: Adjustment["status"]) {
  return status === "PENDING" ? "รออนุมัติ" : status === "APPROVED" ? "อนุมัติแล้ว" : "ปฏิเสธแล้ว";
}

function quantityLabel(item: Adjustment) {
  if (item.adjustmentMode === "SET_ACTUAL") return `ตั้งยอดจริงเป็น ${number(item.targetQuantity ?? 0)} ${item.product?.unit ?? "ชิ้น"} (ส่วนต่าง ${number(item.quantity)})`;
  return `${item.quantity > 0 ? "ปรับเพิ่ม" : "ปรับลด"} ${number(Math.abs(item.quantity))} ${item.product?.unit ?? "ชิ้น"}`;
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
