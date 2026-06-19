import { describe, expect, it } from "vitest";
import { getNotificationBranchId, notificationAuditPath, notificationListPath, notificationSummaryPath } from "./notifications";

const branches = [{ id: "main" }, { id: "moon" }];

describe("notificationSummaryPath", () => {
  it("passes the selected branch to the bell summary endpoint", () => {
    expect(notificationSummaryPath("main")).toBe("/notifications/summary?branchId=main");
    expect(notificationSummaryPath("moon")).toBe("/notifications/summary?branchId=moon");
  });

  it("uses a store-wide summary when no branch is selected", () => {
    expect(notificationSummaryPath()).toBe("/notifications/summary");
  });
});

describe("notificationListPath", () => {
  it("builds history filters on the notification list endpoint", () => {
    expect(notificationListPath({ status: "history", branchId: "main", type: "STOCK_ALERT" })).toBe("/notifications?status=history&type=STOCK_ALERT&branchId=main");
    expect(notificationListPath({ status: "history", limit: 50, cursor: "2026-06-18T00:00:00.000Z" })).toBe("/notifications?status=history&limit=50&cursor=2026-06-18T00%3A00%3A00.000Z");
  });
});

describe("notificationAuditPath", () => {
  it("builds audit history filters for managers", () => {
    expect(notificationAuditPath({ branchId: "moon", type: "TRANSFER_REQUEST" })).toBe("/notifications/audit?type=TRANSFER_REQUEST&branchId=moon");
    expect(notificationAuditPath({ limit: 50, cursor: "2026-06-18T00:00:00.000Z" })).toBe("/notifications/audit?limit=50&cursor=2026-06-18T00%3A00%3A00.000Z");
    expect(notificationAuditPath({})).toBe("/notifications/audit");
  });
});

describe("getNotificationBranchId", () => {
  it("uses the current working branch for normal app pages", () => {
    expect(getNotificationBranchId(branches, "moon", false)).toBe("moon");
  });

  it("falls back to the first active branch when the saved branch is stale", () => {
    expect(getNotificationBranchId(branches, "old-branch", false)).toBe("main");
  });

  it("uses store-wide notifications on store-level pages", () => {
    expect(getNotificationBranchId(branches, "moon", true)).toBeUndefined();
  });
});
