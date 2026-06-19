import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { History, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Dropdown, type DropdownOption } from "../components/Dropdown";
import { api } from "../lib/api";
import { number, thaiDate } from "../lib/format";
import { notificationBadgeClass, notificationListPath, notificationStatusLabel, notificationTypeLabel, type NotificationItem, type NotificationPage, type NotificationType } from "../lib/notifications";

type BranchOption = { id: string; name: string; code?: string; status?: string };

const typeOptions: DropdownOption[] = [
  { value: "", label: "ทุกประเภท" },
  { value: "STOCK_ALERT", label: "สต็อก" },
  { value: "TRANSFER_REQUEST", label: "โอนสินค้า" },
  { value: "TRANSFER_STATUS", label: "สถานะโอน" },
  { value: "STAFF_REQUEST", label: "คำขอพนักงาน" },
  { value: "STOCK_COUNT", label: "นับสต็อก" },
  { value: "SYSTEM", label: "ระบบ" }
];
const pageSize = 50;

export function NotificationsPage() {
  const [branchFilter, setBranchFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<"" | NotificationType>("");
  const branches = useQuery({ queryKey: ["branches"], queryFn: () => api<BranchOption[]>("/branches") });
  const branchId = branchFilter || undefined;
  const historyList = useInfiniteQuery({
    queryKey: ["notifications", "history-page", branchId ?? "all", typeFilter || "all"],
    queryFn: ({ pageParam }) => api<NotificationPage>(notificationListPath({ status: "history", type: typeFilter || undefined, branchId, limit: pageSize, cursor: pageParam || undefined })),
    initialPageParam: "",
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    refetchInterval: 5000,
    refetchOnWindowFocus: true
  });
  const activeBranches = (branches.data ?? []).filter((branch) => branch.status !== "INACTIVE");
  const branchOptions: DropdownOption[] = [
    { value: "", label: "ทุกสาขา" },
    ...activeBranches.map((branch) => ({ value: branch.id, label: `${branch.name}${branch.code ? ` (${branch.code})` : ""}` }))
  ];
  const items = useMemo(() => {
    return [...(historyList.data?.pages.flatMap((page) => page.items) ?? [])].sort((a, b) => new Date(b.notification.createdAt).getTime() - new Date(a.notification.createdAt).getTime());
  }, [historyList.data]);
  const closedCount = items.filter((item) => item.notification.resolvedAt).length;
  const archivedCount = items.filter((item) => item.archivedAt).length;
  const isLoading = historyList.isLoading;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black">ประวัติการแจ้งเตือนของฉัน</h1>
          <p className="text-stone-600">ดูรายการแจ้งเตือนของผู้ใช้ที่ล็อกอินอยู่ซึ่งปิดแล้วหรือเก็บถาวร</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <NotificationMetric label="ประวัติทั้งหมด" value={items.length} />
        <NotificationMetric label="ปิดแล้ว" value={closedCount} />
        <NotificationMetric label="เก็บถาวร" value={archivedCount} />
      </div>

      <div className="grid gap-2 rounded-lg border border-stone-200 bg-white p-3 shadow-sm md:grid-cols-2">
        <Dropdown options={branchOptions} value={branchFilter} disabled={branches.isLoading} onValueChange={setBranchFilter} aria-label="กรองประวัติแจ้งเตือนตามสาขา" className="min-w-0" menuClassName="w-max min-w-56 max-w-80" />
        <Dropdown options={typeOptions} value={typeFilter} onValueChange={(value) => setTypeFilter(value as "" | NotificationType)} aria-label="กรองประวัติแจ้งเตือนตามประเภท" className="min-w-0" menuClassName="w-max min-w-52 max-w-72" />
      </div>

      <div className="space-y-3">
        {isLoading ? <p className="rounded-md border border-stone-200 bg-white p-4 text-sm font-semibold text-stone-500">กำลังโหลดประวัติแจ้งเตือน...</p> : null}
        {!isLoading && items.length === 0 ? (
          <div className="rounded-md border border-emerald-100 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
            ยังไม่มีประวัติแจ้งเตือนในเงื่อนไขนี้
          </div>
        ) : null}
        {items.map((item) => <NotificationHistoryRow key={item.id} item={item} />)}
        {historyList.hasNextPage ? (
          <div className="flex justify-center pt-1">
            <Button type="button" variant="secondary" icon={historyList.isFetchingNextPage ? <Loader2 size={16} className="animate-spin" /> : <History size={16} />} disabled={historyList.isFetchingNextPage} onClick={() => historyList.fetchNextPage()}>
              {historyList.isFetchingNextPage ? "กำลังโหลด..." : "โหลดเพิ่มเติม"}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function NotificationMetric({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-4">
      <p className="text-sm font-bold text-stone-500">{label}</p>
      <p className="mt-1 text-3xl font-black text-ink">{number(value)}</p>
    </Card>
  );
}

function NotificationHistoryRow({ item }: { item: NotificationItem }) {
  const notification = item.notification;
  return (
    <div className="flex items-start gap-3 rounded-md border border-stone-200 bg-white p-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-teal-50 text-leaf ring-1 ring-teal-100">
        <History size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className={`rounded px-2 py-0.5 text-xs font-black ring-1 ${notificationBadgeClass(notification.type, notification.severity)}`}>
            {notificationDisplayTypeLabel(item)}
          </span>
          {notification.branch?.name ? <span className="rounded bg-stone-100 px-2 py-0.5 text-xs font-black text-stone-700">{notification.branch.name}</span> : null}
          <span className="text-xs font-semibold text-stone-500">{notificationStatusLabel(item)}</span>
        </span>
        <span className="mt-2 block truncate font-black text-ink">{notification.title}</span>
        <span className="mt-1 block truncate text-sm text-stone-600">
          {notification.body ? `${notification.body} • ` : ""}{thaiDate(notification.createdAt)}
        </span>
      </span>
    </div>
  );
}

function notificationDisplayTypeLabel(item: NotificationItem) {
  const notification = item.notification;
  if (notification.type === "TRANSFER_REQUEST" && (notification.dedupeKey?.startsWith("transfer-receive:") || notification.title.includes("รอยืนยันรับ"))) {
    return "รอยืนยันรับสินค้า";
  }
  return notificationTypeLabel(notification.type);
}
