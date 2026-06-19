export function branchScopedPath(path: string, branchId?: string) {
  if (!branchId) return path;
  const [pathname, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  if (!params.has("branchId") && !params.has("warehouseId")) params.set("branchId", branchId);
  const nextQuery = params.toString();
  return nextQuery ? `${pathname}?${nextQuery}` : pathname;
}

export function addBranchScope(params: URLSearchParams, branchId?: string) {
  if (branchId && !params.has("branchId") && !params.has("warehouseId")) params.set("branchId", branchId);
  return params;
}

export function dashboardPath(branchId?: string) {
  return branchScopedPath("/reports/dashboard", branchId);
}

export function stockAlertPath(branchId?: string) {
  return branchScopedPath("/reports/stock", branchId);
}
