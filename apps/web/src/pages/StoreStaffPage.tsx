import { permissionGroups, permissionLabels, resolveEffectivePermissions, roles, type EffectivePermissions, type Permission, type PermissionOverrides, type Role } from "@zentory/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Building2, CheckCircle2, Eye, Mail, Phone, Search, ShieldCheck, SlidersHorizontal, UserCheck, UserCog, UserRoundX, UsersRound, XCircle } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Dropdown } from "../components/Dropdown";
import { api, patch } from "../lib/api";
import { getSessionDashboardPath } from "../lib/dashboard";
import { useAuth } from "../state/auth";

const productMasterPermissions = new Set<Permission>(["products.create", "products.update", "products.update_price", "products.update_cost", "products.archive"]);
const staffPermissionGroups = permissionGroups
  .map((group) => ({ ...group, permissions: group.permissions.filter((permission) => !productMasterPermissions.has(permission)) }))
  .filter((group) => group.permissions.length > 0);

type MemberStatus = "ACTIVE" | "PENDING" | "REJECTED" | "DISABLED";
type StatusFilter = "ALL" | MemberStatus;

type BranchOption = { id: string; name: string; code?: string; status?: string };

type Member = {
  id: string;
  employeeName?: string | null;
  employeePhone?: string | null;
  preferredRole?: string | null;
  preferredBranch?: string | null;
  requestedBranchId?: string | null;
  requestedBranch?: BranchOption | null;
  availableStartDate?: string | null;
  applicationNote?: string | null;
  role: Role;
  status: MemberStatus;
  createdAt?: string;
  permissionOverrides: PermissionOverrides;
  effectivePermissions: EffectivePermissions;
  assignedBranches?: BranchOption[];
  user?: { id?: string; name: string; email: string };
};

const roleOptions = [
  { value: "MANAGER", label: "ผู้จัดการ" },
  { value: "BRANCH_MANAGER", label: "ผู้จัดการสาขา" },
  { value: "CASHIER", label: "แคชเชียร์" },
  { value: "STOCK_STAFF", label: "พนักงานคลัง" },
  { value: "VIEWER", label: "ดูรายงาน" }
];

const roleLabels: Record<Role, string> = {
  OWNER: "เจ้าของร้าน",
  MANAGER: "ผู้จัดการ",
  BRANCH_MANAGER: "ผู้จัดการสาขา",
  CASHIER: "แคชเชียร์",
  STOCK_STAFF: "พนักงานคลัง",
  VIEWER: "ดูรายงาน"
};

const statusLabels: Record<MemberStatus, string> = {
  ACTIVE: "ใช้งานอยู่",
  PENDING: "รออนุมัติ",
  REJECTED: "ถูกปฏิเสธ",
  DISABLED: "ปิดใช้งาน"
};

const statusClasses: Record<MemberStatus, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700",
  PENDING: "bg-amber-50 text-amber-700",
  REJECTED: "bg-red-50 text-red-700",
  DISABLED: "bg-stone-100 text-stone-600"
};

const statusFilterOptions: Array<{ value: StatusFilter; label: string }> = [
  { value: "ALL", label: "ทุกสถานะ" },
  { value: "ACTIVE", label: "ใช้งานอยู่" },
  { value: "PENDING", label: "รออนุมัติ" },
  { value: "DISABLED", label: "ปิดใช้งาน" }
];

export function getStoreStaffMembersPath() {
  return "/members";
}

export function getNextPermissionOverrides(roleValue: string, overrides: PermissionOverrides, permission: Permission, checked: boolean) {
  const role = roles.includes(roleValue as Role) ? (roleValue as Role) : "VIEWER";
  const roleDefault = resolveEffectivePermissions(role)[permission];
  const nextOverrides = { ...overrides, [permission]: checked };
  if (checked === roleDefault) delete nextOverrides[permission];
  return nextOverrides;
}

function memberName(member: Pick<Member, "employeeName" | "user">) {
  return member.employeeName?.trim() || member.user?.name?.trim() || "ไม่ระบุชื่อ";
}

function memberEmail(member: Pick<Member, "user">) {
  return member.user?.email ?? "-";
}

function memberPhone(member: Pick<Member, "employeePhone">) {
  return member.employeePhone?.trim() || "ยังไม่ได้เก็บเบอร์โทร";
}

function memberRequestedBranchName(member: Pick<Member, "requestedBranch" | "preferredBranch">) {
  return member.requestedBranch?.name?.trim() || member.preferredBranch?.trim() || "-";
}

function countEnabledPermissions(member: Pick<Member, "effectivePermissions">) {
  return Object.values(member.effectivePermissions).filter(Boolean).length;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatDateOnly(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium" }).format(new Date(value));
}

function searchableMemberText(member: Member) {
  return [memberName(member), memberEmail(member), memberPhone(member), member.preferredRole, memberRequestedBranchName(member)]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("th-TH");
}

export function filterStoreStaffMembers(members: Member[], filters: { status: StatusFilter; branchId: string; query: string }) {
  const query = filters.query.trim().toLocaleLowerCase("th-TH");
  return members.filter((member) => {
    if (filters.status !== "ALL" && member.status !== filters.status) return false;
    if (filters.branchId && !member.assignedBranches?.some((branch) => branch.id === filters.branchId) && member.requestedBranchId !== filters.branchId) return false;
    if (query && !searchableMemberText(member).includes(query)) return false;
    return true;
  });
}

function StoreStaffStat({ label, value, tone = "text-ink" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-md border border-stone-200 bg-white p-4">
      <p className="text-sm font-semibold text-stone-500">{label}</p>
      <p className={`mt-2 text-2xl font-black ${tone}`}>{value}</p>
    </div>
  );
}

function BranchBadges({ member }: { member: Member }) {
  if (member.assignedBranches?.length) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {member.assignedBranches.map((branch) => (
          <span key={branch.id} className="rounded bg-white px-2 py-1 text-xs font-bold text-stone-700 ring-1 ring-stone-200">{branch.name}</span>
        ))}
      </div>
    );
  }
  return <span className="rounded bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700">ยังไม่ได้กำหนดสาขา</span>;
}

function BranchChecklist({
  activeBranches,
  selectedBranchIds,
  disabled,
  onToggle
}: {
  activeBranches: BranchOption[];
  selectedBranchIds: string[];
  disabled?: boolean;
  onToggle: (branchId: string, checked: boolean) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {activeBranches.map((branch) => (
        <label key={branch.id} className="flex items-center justify-between gap-3 rounded-md border border-stone-200 bg-white px-3 py-2 text-sm">
          <span className="min-w-0">
            <span className="block truncate font-semibold">{branch.name}</span>
            {branch.code ? <span className="block truncate text-xs text-stone-500">{branch.code}</span> : null}
          </span>
          <input
            type="checkbox"
            className="h-4 w-4 accent-leaf"
            checked={selectedBranchIds.includes(branch.id)}
            disabled={disabled}
            onChange={(event) => onToggle(branch.id, event.target.checked)}
          />
        </label>
      ))}
    </div>
  );
}

function OwnerInfoCard({ owner }: { owner?: Member }) {
  return (
    <Card>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-teal-50 text-leaf"><ShieldCheck size={22} /></span>
          <div>
            <h2 className="text-xl font-black text-ink">เจ้าของร้าน</h2>
            <p className="mt-1 text-sm font-semibold text-stone-500">ข้อมูลพื้นฐานให้พนักงานเห็นเจ้าของร้านของระบบนี้</p>
          </div>
        </div>
        <div className="grid gap-3 text-sm md:grid-cols-3 md:text-right">
          <div>
            <p className="text-xs font-bold text-stone-500">ชื่อ</p>
            <p className="mt-1 font-black text-ink">{owner ? memberName(owner) : "-"}</p>
          </div>
          <div>
            <p className="text-xs font-bold text-stone-500">อีเมล</p>
            <p className="mt-1 break-all font-semibold text-ink">{owner ? memberEmail(owner) : "-"}</p>
          </div>
          <div>
            <p className="text-xs font-bold text-stone-500">สิทธิ์ดูแล</p>
            <p className="mt-1 font-semibold text-ink">ทุกสาขา</p>
          </div>
        </div>
      </div>
    </Card>
  );
}

export function StoreStaffPage() {
  const queryClient = useQueryClient();
  const session = useAuth((state) => state.session);
  const permissions = session?.business?.effectivePermissions ?? (session?.business ? resolveEffectivePermissions(session.business.role) : undefined);
  const canManageMembers = Boolean(permissions?.["members.manage"]);
  const members = useQuery({ queryKey: ["members", "store"], queryFn: () => api<Member[]>(getStoreStaffMembersPath()), enabled: canManageMembers });
  const branches = useQuery({ queryKey: ["branches"], queryFn: () => api<BranchOption[]>("/branches"), enabled: canManageMembers });
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [branchFilter, setBranchFilter] = useState("");
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [approvingMemberId, setApprovingMemberId] = useState<string | null>(null);
  const [approvalRole, setApprovalRole] = useState<Role>("CASHIER");
  const [approvalOverrides, setApprovalOverrides] = useState<PermissionOverrides>({});
  const [approvalBranchIds, setApprovalBranchIds] = useState<string[]>([]);

  const activeBranches = useMemo(() => (branches.data ?? []).filter((branch) => branch.status !== "INACTIVE"), [branches.data]);
  const ownerMember = useMemo(() => (members.data ?? []).find((member) => member.role === "OWNER"), [members.data]);
  const memberRows = useMemo(() => (members.data ?? []).filter((member) => member.role !== "OWNER"), [members.data]);
  const filteredRows = useMemo(() => filterStoreStaffMembers(memberRows, { status: statusFilter, branchId: branchFilter, query }), [branchFilter, memberRows, query, statusFilter]);
  const activeCount = memberRows.filter((member) => member.status === "ACTIVE").length;
  const pendingCount = memberRows.filter((member) => member.status === "PENDING").length;
  const disabledCount = memberRows.filter((member) => member.status === "DISABLED").length;
  const unassignedCount = memberRows.filter((member) => member.status !== "PENDING" && !member.assignedBranches?.length).length;
  const branchesWithoutStaff = activeBranches.filter((branch) => !memberRows.some((member) => member.status === "ACTIVE" && member.assignedBranches?.some((assignedBranch) => assignedBranch.id === branch.id))).length;
  const approvingMember = memberRows.find((member) => member.id === approvingMemberId && member.status === "PENDING");
  const approvalPermissions = resolveEffectivePermissions(approvalRole, approvalOverrides);

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) => patch(`/members/${id}/role`, { role }),
    onSuccess: () => {
      setMessage("บันทึกบทบาทแล้ว");
      setEditingRoleId(null);
      queryClient.invalidateQueries({ queryKey: ["members"] });
    },
    onError: (error) => setMessage(error.message)
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "ACTIVE" | "DISABLED" }) => patch(`/members/${id}/status`, { status }),
    onSuccess: () => {
      setMessage("บันทึกสถานะแล้ว");
      queryClient.invalidateQueries({ queryKey: ["members"] });
    },
    onError: (error) => setMessage(error.message)
  });

  const permissionsMutation = useMutation({
    mutationFn: ({ id, overrides }: { id: string; overrides: PermissionOverrides }) => patch(`/members/${id}/permissions`, { overrides }),
    onSuccess: () => {
      setMessage("บันทึกสิทธิ์แล้ว");
      queryClient.invalidateQueries({ queryKey: ["members"] });
    },
    onError: (error) => setMessage(error.message)
  });

  const branchesMutation = useMutation({
    mutationFn: ({ id, branchIds }: { id: string; branchIds: string[] }) => patch(`/members/${id}/branches`, { branchIds }),
    onSuccess: () => {
      setMessage("บันทึกสาขาที่ดูแลแล้ว");
      queryClient.invalidateQueries({ queryKey: ["members"] });
    },
    onError: (error) => setMessage(error.message)
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, role, overrides, branchIds }: { id: string; role: Role; overrides: PermissionOverrides; branchIds: string[] }) => patch(`/members/${id}/approve`, { role, overrides, branchIds }),
    onSuccess: () => {
      setMessage("อนุมัติและเพิ่มพนักงานแล้ว");
      closeApproval();
      queryClient.invalidateQueries({ queryKey: ["members"] });
    },
    onError: (error) => setMessage(error.message)
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => patch(`/members/${id}/reject`, {}),
    onSuccess: () => {
      setMessage("ปฏิเสธคำขอแล้ว");
      closeApproval();
      queryClient.invalidateQueries({ queryKey: ["members"] });
    },
    onError: (error) => setMessage(error.message)
  });

  function toggleMemberBranch(member: Member, branchId: string, checked: boolean) {
    const current = member.assignedBranches?.map((branch) => branch.id) ?? [];
    const branchIds = checked ? [...new Set([...current, branchId])] : current.filter((id) => id !== branchId);
    branchesMutation.mutate({ id: member.id, branchIds });
  }

  function togglePermission(member: Member, permission: Permission, checked: boolean) {
    permissionsMutation.mutate({ id: member.id, overrides: getNextPermissionOverrides(member.role, member.permissionOverrides, permission, checked) });
  }

  function toggleApprovalPermission(permission: Permission, checked: boolean) {
    setApprovalOverrides((current) => getNextPermissionOverrides(approvalRole, current, permission, checked));
  }

  function startApproval(member: Member) {
    setApprovingMemberId(member.id);
    setApprovalRole(roles.includes(member.role) && member.role !== "OWNER" ? member.role : "CASHIER");
    setApprovalOverrides({});
    setApprovalBranchIds(member.requestedBranchId ? [member.requestedBranchId] : []);
  }

  function closeApproval() {
    setApprovingMemberId(null);
    setApprovalRole("CASHIER");
    setApprovalOverrides({});
    setApprovalBranchIds([]);
  }

  if (!canManageMembers) return <Navigate to={getSessionDashboardPath(session)} replace />;

  return (
    <div className="grid gap-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-black text-ink">พนักงานทั้งร้าน</h1>
          <p className="mt-1 text-sm font-semibold leading-6 text-stone-500">จัดการพนักงาน สิทธิ์ และสาขาที่ดูแลในทุกสาขาที่คุณมีสิทธิ์เข้าถึง</p>
        </div>
        <Link to="/app/settings">
          <Button type="button" variant="secondary" icon={<ArrowLeft size={16} />}>กลับตั้งค่าร้าน</Button>
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StoreStaffStat label="พนักงานทั้งหมด" value={`${memberRows.length} คน`} />
        <StoreStaffStat label="ใช้งานอยู่" value={`${activeCount} คน`} tone="text-teal-700" />
        <StoreStaffStat label="รออนุมัติ" value={`${pendingCount} คำขอ`} tone="text-amber-700" />
        <StoreStaffStat label="ปิดใช้งาน" value={`${disabledCount} คน`} tone="text-stone-600" />
        <StoreStaffStat label="ต้องจัดสาขา" value={`${unassignedCount + branchesWithoutStaff} รายการ`} tone="text-red-700" />
      </div>

      {message ? <p className="rounded-md bg-stone-100 p-3 text-sm font-bold text-stone-700">{message}</p> : null}

      <OwnerInfoCard owner={ownerMember} />

      <Card>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-teal-50 text-leaf"><UsersRound size={22} /></span>
            <div>
              <h2 className="text-xl font-black text-ink">รายชื่อพนักงาน</h2>
              <p className="mt-1 text-sm font-semibold text-stone-500">{filteredRows.length} รายการจาก {memberRows.length} รายการ</p>
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-[minmax(220px,1fr)_180px_220px] xl:min-w-[680px]">
            <label className="field-icon-wrap">
              <Search className="field-icon" size={16} />
              <input className="field field-with-left-icon" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาชื่อ อีเมล เบอร์โทร" />
            </label>
            <Dropdown value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)} options={statusFilterOptions} />
            <Dropdown
              value={branchFilter}
              onValueChange={setBranchFilter}
              options={[{ value: "", label: "ทุกสาขา" }, ...activeBranches.map((branch) => ({ value: branch.id, label: branch.name }))]}
            />
          </div>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-[980px] text-left text-sm">
            <thead className="text-xs font-black uppercase text-stone-500">
              <tr className="border-b border-stone-200">
                <th className="py-3 pr-4">พนักงาน</th>
                <th className="py-3 pr-4">บทบาท</th>
                <th className="py-3 pr-4">สถานะ</th>
                <th className="py-3 pr-4">สาขาที่ดูแล</th>
                <th className="py-3 pr-4">สิทธิ์</th>
                <th className="py-3 pr-4">เข้าร่วม</th>
                <th className="py-3 pr-4 text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((member) => {
                const isEditing = editingMemberId === member.id;
                return (
                  <Fragment key={member.id}>
                    <tr className="border-b border-stone-100 align-top">
                      <td className="py-4 pr-4">
                        <p className="font-black text-ink">{memberName(member)}</p>
                        <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-stone-500"><Mail size={13} />{memberEmail(member)}</p>
                        <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-stone-500"><Phone size={13} />{memberPhone(member)}</p>
                        {member.status === "PENDING" ? (
                          <p className="mt-2 text-xs font-semibold text-amber-700">สมัครสาขา: {memberRequestedBranchName(member)}</p>
                        ) : null}
                      </td>
                      <td className="py-4 pr-4">
                        {editingRoleId === member.id ? (
                          <div className="grid gap-2">
                            <Dropdown value={member.role} onValueChange={(role) => roleMutation.mutate({ id: member.id, role: role as Role })} options={roleOptions} disabled={roleMutation.isPending} />
                            <Button type="button" variant="ghost" className="h-8 px-2" onClick={() => setEditingRoleId(null)}>ปิด</Button>
                          </div>
                        ) : (
                          <span className="font-bold text-ink">{roleLabels[member.role]}</span>
                        )}
                      </td>
                      <td className="py-4 pr-4">
                        <span className={`rounded px-2 py-1 text-xs font-bold ${statusClasses[member.status]}`}>{statusLabels[member.status]}</span>
                      </td>
                      <td className="py-4 pr-4">
                        <BranchBadges member={member} />
                      </td>
                      <td className="py-4 pr-4 font-semibold text-stone-600">{countEnabledPermissions(member)} รายการ</td>
                      <td className="py-4 pr-4 font-semibold text-stone-600">{formatDate(member.createdAt)}</td>
                      <td className="py-4 pr-0">
                        <div className="flex flex-wrap justify-end gap-2">
                          {member.status === "PENDING" ? (
                            <>
                              <Button type="button" variant="secondary" icon={<Eye size={15} />} onClick={() => setEditingMemberId(isEditing ? null : member.id)}>รายละเอียด</Button>
                              <Button type="button" icon={<UserCheck size={15} />} onClick={() => startApproval(member)}>อนุมัติ</Button>
                              <Button type="button" variant="ghost" icon={<XCircle size={15} />} onClick={() => rejectMutation.mutate(member.id)} disabled={rejectMutation.isPending}>ปฏิเสธ</Button>
                            </>
                          ) : (
                            <>
                              {member.status === "ACTIVE" ? <Button type="button" variant="secondary" icon={<UserRoundX size={15} />} onClick={() => statusMutation.mutate({ id: member.id, status: "DISABLED" })} disabled={statusMutation.isPending}>ปิดใช้งาน</Button> : null}
                              {member.status === "DISABLED" ? <Button type="button" variant="secondary" icon={<CheckCircle2 size={15} />} onClick={() => statusMutation.mutate({ id: member.id, status: "ACTIVE" })} disabled={statusMutation.isPending}>เปิดใช้งาน</Button> : null}
                              <Button type="button" variant="ghost" icon={<UserCog size={15} />} onClick={() => setEditingRoleId(editingRoleId === member.id ? null : member.id)}>บทบาท</Button>
                              <Button type="button" variant="ghost" icon={<SlidersHorizontal size={15} />} onClick={() => setEditingMemberId(isEditing ? null : member.id)}>สิทธิ์/สาขา</Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isEditing ? (
                      <tr className="border-b border-stone-100">
                        <td className="bg-stone-50 px-4 py-4" colSpan={7}>
                          {member.status === "PENDING" ? (
                            <div className="grid gap-3 text-sm text-stone-700 sm:grid-cols-3">
                              <p><span className="font-black text-ink">ตำแหน่งที่สนใจ:</span> {member.preferredRole || "-"}</p>
                              <p><span className="font-black text-ink">พร้อมเริ่ม:</span> {formatDateOnly(member.availableStartDate)}</p>
                              <p><span className="font-black text-ink">UID สาขา:</span> {member.requestedBranchId ?? "-"}</p>
                              {member.applicationNote ? <p className="sm:col-span-3"><span className="font-black text-ink">ข้อความถึงร้าน:</span> {member.applicationNote}</p> : null}
                            </div>
                          ) : (
                            <div className="grid gap-5">
                              <div>
                                <p className="mb-2 text-sm font-black text-stone-700">สาขาที่เข้าถึงได้</p>
                                <BranchChecklist activeBranches={activeBranches} selectedBranchIds={member.assignedBranches?.map((branch) => branch.id) ?? []} disabled={branchesMutation.isPending} onToggle={(branchId, checked) => toggleMemberBranch(member, branchId, checked)} />
                              </div>
                              {staffPermissionGroups.map((group) => (
                                <div key={group.title}>
                                  <p className="mb-2 text-sm font-black text-stone-700">{group.title}</p>
                                  <div className="grid gap-2 sm:grid-cols-2">
                                    {group.permissions.map((permission) => (
                                      <label key={permission} className="flex items-center justify-between gap-3 rounded-md border border-stone-200 bg-white px-3 py-2 text-sm">
                                        <span>{permissionLabels[permission]}</span>
                                        <input
                                          type="checkbox"
                                          className="h-4 w-4 accent-leaf"
                                          checked={member.effectivePermissions[permission]}
                                          disabled={permissionsMutation.isPending}
                                          onChange={(event) => togglePermission(member, permission, event.target.checked)}
                                        />
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
              {!members.isLoading && filteredRows.length === 0 ? (
                <tr>
                  <td className="py-8 text-center text-sm font-semibold text-stone-500" colSpan={7}>ไม่พบพนักงานตามเงื่อนไขที่เลือก</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      {approvingMember ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4" role="dialog" aria-modal="true" aria-labelledby="store-approval-modal-title" onMouseDown={closeApproval}>
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="border-b border-stone-200 p-5">
              <p className="text-xs font-black uppercase text-amber-700">คำขอเข้าทำงาน</p>
              <h2 id="store-approval-modal-title" className="mt-1 text-2xl font-black text-ink">อนุมัติคำขอเข้าทำงาน</h2>
              <p className="mt-1 text-sm leading-6 text-stone-600">{memberName(approvingMember)} • {memberEmail(approvingMember)} • สมัครสาขา {memberRequestedBranchName(approvingMember)}</p>
            </div>
            <div className="overflow-y-auto p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-black text-ink">ตำแหน่งและสิทธิ์ที่จะได้รับ</p>
                <Dropdown value={approvalRole} onValueChange={(role) => { setApprovalRole(role as Role); setApprovalOverrides({}); }} options={roleOptions} className="min-w-52" disabled={approveMutation.isPending} />
              </div>
              <div className="mt-4">
                <p className="mb-2 text-sm font-black text-stone-700">สาขาที่พนักงานเข้าถึงได้</p>
                <BranchChecklist
                  activeBranches={activeBranches}
                  selectedBranchIds={approvalBranchIds}
                  disabled={approveMutation.isPending}
                  onToggle={(branchId, checked) => setApprovalBranchIds((current) => checked ? [...new Set([...current, branchId])] : current.filter((id) => id !== branchId))}
                />
                {approvalBranchIds.length === 0 ? <p className="mt-2 text-xs font-semibold text-amber-700">ต้องเลือกอย่างน้อย 1 สาขาก่อนอนุมัติ</p> : null}
              </div>
              <div className="mt-4 grid gap-4">
                {staffPermissionGroups.map((group) => (
                  <div key={group.title}>
                    <p className="mb-2 text-sm font-black text-stone-700">{group.title}</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {group.permissions.map((permission) => (
                        <label key={permission} className="flex items-center justify-between gap-3 rounded-md border border-stone-200 bg-white px-3 py-2 text-sm">
                          <span>{permissionLabels[permission]}</span>
                          <input type="checkbox" className="h-4 w-4 accent-leaf" checked={approvalPermissions[permission]} disabled={approveMutation.isPending} onChange={(event) => toggleApprovalPermission(permission, event.target.checked)} />
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap justify-between gap-2 border-t border-stone-200 bg-stone-50 p-4">
              <Button type="button" variant="secondary" icon={<XCircle size={15} />} onClick={() => rejectMutation.mutate(approvingMember.id)} disabled={rejectMutation.isPending || approveMutation.isPending}>ปฏิเสธคำขอ</Button>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="ghost" onClick={closeApproval} disabled={approveMutation.isPending || rejectMutation.isPending}>ยกเลิก</Button>
                <Button type="button" icon={<ShieldCheck size={15} />} onClick={() => approveMutation.mutate({ id: approvingMember.id, role: approvalRole, overrides: approvalOverrides, branchIds: approvalBranchIds })} disabled={approveMutation.isPending || rejectMutation.isPending || approvalBranchIds.length === 0}>อนุมัติและเพิ่มพนักงาน</Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
