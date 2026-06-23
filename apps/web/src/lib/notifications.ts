export type NotificationType = "STAFF_REQUEST" | "TRANSFER_REQUEST" | "TRANSFER_STATUS" | "STOCK_ALERT" | "STOCK_COUNT" | "SYSTEM";
export type NotificationSeverity = "INFO" | "SUCCESS" | "WARNING" | "CRITICAL";

export type NotificationItem = {
  id: string;
  readAt?: string | null;
  archivedAt?: string | null;
  createdAt: string;
  user?: { id: string; name?: string | null; email?: string | null };
  notification: {
    id: string;
    businessId: string;
    branchId?: string | null;
    type: NotificationType;
    severity: NotificationSeverity;
    title: string;
    body?: string | null;
    actionHref?: string | null;
    entityType?: string | null;
    entityId?: string | null;
    dedupeKey?: string | null;
    resolvedAt?: string | null;
    createdAt: string;
    updatedAt: string;
    branch?: { id: string; name: string; code?: string | null } | null;
  };
};

export type NotificationSummary = {
  unreadCount: number;
  activeCount: number;
  openActionCount: number;
  stockCount: number;
  outOfStockCount: number;
  lowStockCount: number;
  transferRequestCount: number;
  transferReceiveCount: number;
  staffRequestCount: number;
  stockCountReviewCount: number;
  stockAdjustmentRequestCount: number;
  archivedCount: number;
  preview: NotificationItem[];
};
export type NotificationPage = {
  items: NotificationItem[];
  nextCursor: string | null;
};

export function notificationStatusLabel(item: NotificationItem) {
  if (item.notification.resolvedAt) return "ปิดแล้ว";
  if (item.archivedAt) return "เก็บถาวร";
  if (!item.readAt) return "ยังไม่อ่าน";
  return "อ่านแล้ว";
}

export function notificationTypeLabel(type: NotificationType) {
  switch (type) {
    case "STAFF_REQUEST":
      return "คำขอพนักงาน";
    case "TRANSFER_REQUEST":
      return "โอนสินค้า";
    case "TRANSFER_STATUS":
      return "สถานะโอน";
    case "STOCK_ALERT":
      return "สต็อก";
    case "STOCK_COUNT":
      return "รอบนับสต็อก";
    case "SYSTEM":
      return "ระบบ";
  }
}

export function isStockAdjustmentRequestNotification(item: NotificationItem) {
  const notification = item.notification;
  return (
    notification.dedupeKey?.startsWith("stock-adjustment-request:") ||
    notification.entityType === "StockAdjustment" ||
    (notification.actionHref === "/app/activity-approvals" && notification.title.includes("รออนุมัติ"))
  );
}

export function notificationDisplayTypeLabel(item: NotificationItem) {
  const notification = item.notification;
  if (isStockAdjustmentRequestNotification(item)) return "รออนุมัติ";
  if (notification.type === "STOCK_ALERT") {
    if (notification.severity === "CRITICAL" || notification.title.includes("หมดสต็อก")) return "สินค้าหมด";
    return "สินค้าใกล้หมด";
  }
  if (notification.type === "TRANSFER_REQUEST" && (notification.dedupeKey?.startsWith("transfer-receive:") || notification.title.includes("รอยืนยันรับ"))) {
    return "รอยืนยันรับของ";
  }
  return notificationTypeLabel(notification.type);
}

export function notificationDisplayTitle(item: NotificationItem) {
  if (!isStockAdjustmentRequestNotification(item)) return item.notification.title;

  const bodyParts = item.notification.body?.split(" • ").map((part) => part.trim()).filter(Boolean) ?? [];
  const productName = bodyParts[0];
  const quantityPart = bodyParts.find((part) => /^(เพิ่ม|ลด)\s+\d/.test(part));
  if (!productName || !quantityPart) return item.notification.title;

  const [direction, quantity] = quantityPart.split(/\s+/, 2);
  const action = direction === "ลด" ? "ขอลดสต็อก" : "ขอเพิ่มสต็อก";
  return `${productName} ${action} ${quantity}`;
}

export function notificationSeverityClass(severity: NotificationSeverity) {
  switch (severity) {
    case "CRITICAL":
      return "bg-red-50 text-red-700 ring-red-100";
    case "WARNING":
      return "bg-amber-50 text-amber-700 ring-amber-100";
    case "SUCCESS":
      return "bg-emerald-50 text-emerald-700 ring-emerald-100";
    case "INFO":
      return "bg-sky-50 text-sky-700 ring-sky-100";
  }
}

export function notificationBadgeClass(type: NotificationType, severity: NotificationSeverity) {
  if (type === "TRANSFER_REQUEST" || type === "TRANSFER_STATUS") return "bg-cyan-50 text-cyan-700 ring-cyan-100";
  if (type === "STAFF_REQUEST") return "bg-teal-50 text-teal-700 ring-teal-100";
  if (type === "STOCK_COUNT") return "bg-indigo-50 text-indigo-700 ring-indigo-100";
  return notificationSeverityClass(severity);
}

export function notificationItemBadgeClass(item: NotificationItem) {
  if (isStockAdjustmentRequestNotification(item)) return "bg-indigo-50 text-indigo-700 ring-indigo-100";
  return notificationBadgeClass(item.notification.type, item.notification.severity);
}

export function notificationSummaryPath(branchId?: string) {
  const params = new URLSearchParams();
  if (branchId) params.set("branchId", branchId);
  const query = params.toString();
  return query ? `/notifications/summary?${query}` : "/notifications/summary";
}

export function getNotificationBranchId(
  activeBranches: Array<{ id: string }>,
  workingBranchId: string | undefined,
  isStoreLevelPage: boolean
) {
  if (isStoreLevelPage) return undefined;
  if (workingBranchId && activeBranches.some((branch) => branch.id === workingBranchId)) return workingBranchId;
  return activeBranches[0]?.id;
}

export function notificationListPath(filters: { status?: string; type?: NotificationType; branchId?: string; limit?: number; cursor?: string }) {
  const params = new URLSearchParams();
  params.set("status", filters.status ?? "all");
  if (filters.type) params.set("type", filters.type);
  if (filters.branchId) params.set("branchId", filters.branchId);
  if (filters.limit) params.set("limit", String(filters.limit));
  if (filters.cursor) params.set("cursor", filters.cursor);
  return `/notifications?${params.toString()}`;
}

export function notificationAuditPath(filters: { type?: NotificationType; branchId?: string; limit?: number; cursor?: string }) {
  const params = new URLSearchParams();
  if (filters.type) params.set("type", filters.type);
  if (filters.branchId) params.set("branchId", filters.branchId);
  if (filters.limit) params.set("limit", String(filters.limit));
  if (filters.cursor) params.set("cursor", filters.cursor);
  const query = params.toString();
  return query ? `/notifications/audit?${query}` : "/notifications/audit";
}

export function notificationReadAllPath(branchId?: string) {
  const params = new URLSearchParams();
  if (branchId) params.set("branchId", branchId);
  const query = params.toString();
  return query ? `/notifications/read-all?${query}` : "/notifications/read-all";
}
