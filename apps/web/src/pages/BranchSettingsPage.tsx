import { permissionGroups, permissionLabels, resolveEffectivePermissions, roles, type EffectivePermissions, type Permission, type PermissionOverrides, type Role } from "@zentory/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Boxes, Building2, CheckCircle2, Clipboard, ClipboardList, Mail, PackageCheck, Phone, QrCode, Save, ShieldCheck, SlidersHorizontal, Upload, UserRoundX, Users, X } from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useLocation, useSearchParams } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Dropdown } from "../components/Dropdown";
import { api, patch } from "../lib/api";
import { getSessionDashboardPath } from "../lib/dashboard";
import { baht, number } from "../lib/format";
import { loadBranchPosSettings, saveBranchPosSettings, type BranchPosSettings } from "../lib/pos-settings";
import { useAuth } from "../state/auth";
import { useWorkingBranch } from "../state/working-branch";

type BranchStatus = "ACTIVE" | "INACTIVE";
type MemberStatus = "ACTIVE" | "PENDING" | "REJECTED" | "DISABLED";

type StoreBranch = {
  id: string;
  name: string;
  code: string;
  status: BranchStatus;
  address?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  note?: string | null;
  isDefault?: boolean;
  warehouses?: Array<{ id: string }>;
};

type BranchStaffMember = {
  id: string;
  employeeName?: string | null;
  employeePhone?: string | null;
  preferredRole?: string | null;
  preferredBranch?: string | null;
  requestedBranchId?: string | null;
  requestedBranch?: { id: string; name: string } | null;
  availableStartDate?: string | null;
  applicationNote?: string | null;
  role: Role;
  status: MemberStatus;
  createdAt?: string;
  permissionOverrides: PermissionOverrides;
  effectivePermissions: EffectivePermissions;
  assignedBranches?: Array<{ id: string; name: string }>;
  user?: { id?: string; name: string; email: string };
};

export type BranchSettingsForm = {
  name: string;
  code: string;
  status: BranchStatus;
  address: string;
  contactName: string;
  contactPhone: string;
  note: string;
};

const emptyForm: BranchSettingsForm = {
  name: "",
  code: "",
  status: "ACTIVE",
  address: "",
  contactName: "",
  contactPhone: "",
  note: ""
};

const productMasterPermissions = new Set<Permission>(["products.create", "products.update", "products.update_price", "products.update_cost", "products.archive"]);
const branchStaffPermissionGroups = permissionGroups
  .map((group) => ({ ...group, permissions: group.permissions.filter((permission) => !productMasterPermissions.has(permission)) }))
  .filter((group) => group.permissions.length > 0);

const staffRoleOptions = [
  { value: "MANAGER", label: "ผู้จัดการ" },
  { value: "BRANCH_MANAGER", label: "ผู้จัดการสาขา" },
  { value: "CASHIER", label: "แคชเชียร์" },
  { value: "STOCK_STAFF", label: "พนักงานคลัง" },
  { value: "VIEWER", label: "ดูรายงาน" }
];

function toForm(branch: StoreBranch): BranchSettingsForm {
  return {
    name: branch.name,
    code: branch.code,
    status: branch.status,
    address: branch.address ?? "",
    contactName: branch.contactName ?? "",
    contactPhone: branch.contactPhone ?? "",
    note: branch.note ?? ""
  };
}

function trimForm(form: BranchSettingsForm): BranchSettingsForm {
  return {
    ...form,
    name: form.name.trim(),
    code: form.code.trim(),
    address: form.address.trim(),
    contactName: form.contactName.trim(),
    contactPhone: form.contactPhone.trim(),
    note: form.note.trim()
  };
}

function readinessItems(form: BranchSettingsForm) {
  return [
    { label: "ชื่อสาขา", ready: Boolean(form.name.trim()) },
    { label: "รหัสสาขา", ready: Boolean(form.code.trim()) },
    { label: "พื้นที่ขาย", ready: Boolean(form.address.trim()) },
    { label: "ข้อมูลติดต่อ", ready: Boolean(form.contactName.trim() && form.contactPhone.trim()) }
  ];
}

type BranchSettingSection = "overview" | "branch-info" | "pos-settings" | "staff";
type BranchSettingOption =
  | { key: string; title: string; detail: string; icon: typeof Building2; status: string; statusTone: "ready" | "missing" | "neutral"; onClick: () => void; to?: never }
  | { key: string; title: string; detail: string; icon: typeof Building2; status: string; statusTone: "ready" | "missing" | "neutral"; to: string; onClick?: never };

type StockPlanningReport = {
  summary: {
    stockValue: number;
    outOfStockCount: number;
    lowStockCount: number;
    totalProducts: number;
  };
};

export type BranchReadinessItem = {
  key: string;
  label: string;
  ready: boolean;
  actionLabel: string;
  section?: BranchSettingSection;
  to?: string;
};

export function buildBranchReadiness(form: BranchSettingsForm, options: { branchId: string; warehouseCount: number; hasPaymentQr: boolean }): BranchReadinessItem[] {
  return [
    { key: "identity", label: "ชื่อและรหัสสาขา", ready: Boolean(form.name.trim() && form.code.trim()), actionLabel: "แก้ไขชื่อ/รหัส", section: "branch-info" },
    { key: "address", label: "พื้นที่ขาย / ที่อยู่", ready: Boolean(form.address.trim()), actionLabel: form.address.trim() ? "แก้ไขที่อยู่" : "เพิ่มที่อยู่", section: "branch-info" },
    { key: "contact", label: "ผู้ดูแลและเบอร์ติดต่อ", ready: Boolean(form.contactName.trim() && form.contactPhone.trim()), actionLabel: form.contactName.trim() && form.contactPhone.trim() ? "แก้ไขผู้ดูแล" : "เพิ่มผู้ดูแล", section: "branch-info" },
    { key: "warehouse", label: "มีคลังในสาขา", ready: options.warehouseCount > 0, actionLabel: "จัดการคลัง", to: `/app/warehouses?branchId=${options.branchId}` },
    { key: "pos", label: "QR รับโอนสำหรับ POS", ready: options.hasPaymentQr, actionLabel: options.hasPaymentQr ? "แก้ไข POS" : "เพิ่ม QR", section: "pos-settings" }
  ];
}

export type BranchShortcutLink = { label: string; to: string; icon: typeof Building2 };

export function buildBranchShortcutLinks(branchId: string, permissions: EffectivePermissions | undefined): BranchShortcutLink[] {
  return [
    hasPermission(permissions, "inventory.receive") ? { label: "รับสินค้าเข้า", to: `/app/inventory/receipts?branchId=${branchId}`, icon: Boxes } : null,
    hasPermission(permissions, "inventory.adjust") ? { label: "ปรับสต็อก", to: `/app/inventory/adjustments?branchId=${branchId}`, icon: ClipboardList } : null,
    hasPermission(permissions, "inventory.movements.read") ? { label: "ประวัติสต็อก", to: `/app/inventory/movements?branchId=${branchId}`, icon: ClipboardList } : null
  ].filter((item): item is BranchShortcutLink => Boolean(item));
}

export function getBranchSettingsSection(searchParams: Pick<URLSearchParams, "get">, canManageMembers: boolean): BranchSettingSection {
  const requestedSection = searchParams.get("section");
  if (requestedSection === "branch-info" || requestedSection === "pos-settings") return requestedSection;
  if (requestedSection === "staff" && canManageMembers) return "staff";
  return "overview";
}

function statusClass(status: BranchStatus) {
  return status === "ACTIVE" ? "bg-teal-50 text-teal-700" : "bg-stone-100 text-stone-600";
}

function statusLabel(status: BranchStatus) {
  return status === "ACTIVE" ? "เปิดใช้งาน" : "ปิดใช้งาน";
}

const staffStatusLabels: Record<MemberStatus, string> = {
  ACTIVE: "ใช้งานอยู่",
  PENDING: "รออนุมัติ",
  REJECTED: "ถูกปฏิเสธ",
  DISABLED: "ปิดใช้งาน"
};

const staffStatusClasses: Record<MemberStatus, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700",
  PENDING: "bg-amber-50 text-amber-700",
  REJECTED: "bg-red-50 text-red-700",
  DISABLED: "bg-stone-100 text-stone-600"
};

const staffRoleLabels: Record<Role, string> = {
  OWNER: "เจ้าของร้าน",
  MANAGER: "ผู้จัดการ",
  BRANCH_MANAGER: "ผู้จัดการสาขา",
  CASHIER: "แคชเชียร์",
  STOCK_STAFF: "พนักงานคลัง",
  VIEWER: "ดูรายงาน"
};

function paymentMethodLabel(method: BranchPosSettings["defaultPaymentMethod"]) {
  return method === "TRANSFER" ? "โอนเงิน" : "เงินสด";
}

function toneClass(tone: "ready" | "missing" | "neutral") {
  if (tone === "ready") return "bg-teal-50 text-teal-700";
  if (tone === "missing") return "bg-amber-50 text-amber-800";
  return "bg-stone-100 text-stone-600";
}

function hasPermission(permissions: EffectivePermissions | undefined, permission: Permission) {
  return permissions?.[permission] ?? false;
}

function staffName(member: BranchStaffMember) {
  return member.employeeName?.trim() || member.user?.name?.trim() || "ไม่ระบุชื่อ";
}

function staffEmail(member: BranchStaffMember) {
  return member.user?.email ?? "-";
}

function staffPhone(member: BranchStaffMember) {
  return member.employeePhone?.trim() || "ยังไม่ได้เก็บเบอร์โทร";
}

function staffRequestedBranchName(member: BranchStaffMember) {
  return member.requestedBranch?.name?.trim() || member.preferredBranch?.trim() || "-";
}

function countEnabledPermissions(member: BranchStaffMember) {
  return Object.values(member.effectivePermissions).filter(Boolean).length;
}

function formatMemberDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium" }).format(new Date(value));
}

function getNextPermissionOverrides(roleValue: string, overrides: PermissionOverrides, permission: Permission, checked: boolean) {
  const role = roles.includes(roleValue as Role) ? (roleValue as Role) : "VIEWER";
  const roleDefault = resolveEffectivePermissions(role)[permission];
  const nextOverrides = { ...overrides, [permission]: checked };
  if (checked === roleDefault) delete nextOverrides[permission];
  return nextOverrides;
}

export function BranchSettingsPage() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const session = useAuth((state) => state.session);
  const workingBranchId = useWorkingBranch((state) => state.workingBranchId);
  const setWorkingBranchId = useWorkingBranch((state) => state.setWorkingBranchId);
  const role = session?.business?.role;
  const effectivePermissions = session?.business?.effectivePermissions ?? (session?.business ? resolveEffectivePermissions(session.business.role) : undefined);
  const canManageMembers = hasPermission(effectivePermissions, "members.manage");
  const canOpenBranchSettings = Boolean(session?.user.isSystemAdmin || role === "OWNER" || role === "BRANCH_MANAGER" || canManageMembers);
  const branches = useQuery({ queryKey: ["branches"], queryFn: () => api<StoreBranch[]>("/branches"), enabled: canOpenBranchSettings });
  const activeBranches = useMemo(() => (branches.data ?? []).filter((branch) => branch.status !== "INACTIVE"), [branches.data]);
  const selectedBranch = useMemo(() => {
    if (!branches.data?.length) return undefined;
    return branches.data.find((branch) => branch.id === workingBranchId) ?? activeBranches[0] ?? branches.data[0];
  }, [activeBranches, branches.data, workingBranchId]);
  const [form, setForm] = useState<BranchSettingsForm>(emptyForm);
  const [message, setMessage] = useState("");
  const [uidMessage, setUidMessage] = useState("");
  const [posSettings, setPosSettings] = useState<BranchPosSettings>({ defaultPaymentMethod: "CASH", paymentQrImage: "" });
  const [posMessage, setPosMessage] = useState("");
  const [section, setSection] = useState<BranchSettingSection>("overview");
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const items = readinessItems(form);
  const readyCount = items.filter((item) => item.ready).length;
  const selectedBranchId = selectedBranch?.id ?? "";
  const warehouseCount = selectedBranch?.warehouses?.length ?? 0;
  const hasPaymentQr = Boolean(posSettings.paymentQrImage.trim());
  const branchReadiness = useMemo(
    () => buildBranchReadiness(form, { branchId: selectedBranchId, warehouseCount, hasPaymentQr }),
    [form, hasPaymentQr, selectedBranchId, warehouseCount]
  );
  const branchReadyCount = branchReadiness.filter((item) => item.ready).length;
  const hasCompleteContact = Boolean(form.contactName.trim() && form.contactPhone.trim());
  const canReadStockReport = hasPermission(effectivePermissions, "reports.stock.read");
  const branchStaff = useQuery({
    queryKey: ["members", selectedBranchId],
    queryFn: () => api<BranchStaffMember[]>(`/members?branchId=${encodeURIComponent(selectedBranchId)}`),
    enabled: Boolean(selectedBranchId && canManageMembers)
  });
  const ownerMember = useMemo(() => (branchStaff.data ?? []).find((member) => member.role === "OWNER"), [branchStaff.data]);
  const branchStaffRows = useMemo(() => (branchStaff.data ?? []).filter((member) => member.role !== "OWNER"), [branchStaff.data]);
  const activeStaffCount = branchStaffRows.filter((member) => member.status === "ACTIVE").length;
  const pendingStaffRows = branchStaffRows.filter((member) => member.status === "PENDING");
  const pendingStaffCount = pendingStaffRows.length;
  const editingStaff = branchStaffRows.find((member) => member.id === editingStaffId && member.role !== "OWNER");
  const stockPlanning = useQuery({
    queryKey: ["branch-settings", "stock-planning", selectedBranchId],
    queryFn: () => api<StockPlanningReport>(`/reports/stock/planning?branchId=${encodeURIComponent(selectedBranchId)}`),
    enabled: Boolean(selectedBranchId && canReadStockReport)
  });

  useEffect(() => {
    setSection(getBranchSettingsSection(searchParams, canManageMembers));
  }, [canManageMembers, searchParams]);

  useEffect(() => {
    if (location.hash !== "#staff-requests") return;
    window.requestAnimationFrame(() => {
      document.getElementById("staff-requests")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [branchStaff.data, location.hash, section]);

  function openSection(nextSection: BranchSettingSection) {
    setSection(nextSection);
    const nextParams = new URLSearchParams(searchParams);
    if (nextSection === "overview") nextParams.delete("section");
    else nextParams.set("section", nextSection);
    setSearchParams(nextParams, { replace: true });
  }

  useEffect(() => {
    if (!selectedBranch) return;
    setForm(toForm(selectedBranch));
    setPosSettings(loadBranchPosSettings(selectedBranch.id));
    setMessage("");
    setUidMessage("");
    setPosMessage("");
    if (selectedBranch.id !== workingBranchId) setWorkingBranchId(selectedBranch.id);
  }, [selectedBranch, setWorkingBranchId, workingBranchId]);

  const saveBranch = useMutation({
    mutationFn: (body: BranchSettingsForm) => patch(`/branches/${selectedBranch?.id}`, body),
    onSuccess: () => {
      setMessage("บันทึกข้อมูลสาขาแล้ว");
      queryClient.invalidateQueries({ queryKey: ["branches"] });
      queryClient.invalidateQueries({ queryKey: ["business"] });
    },
    onError: (error) => setMessage(error.message)
  });

  const staffRoleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) => patch(`/members/${id}/role`, { role }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["members"] }),
    onError: (error) => setMessage(error.message)
  });

  const staffStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "ACTIVE" | "DISABLED" }) => patch(`/members/${id}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["members"] }),
    onError: (error) => setMessage(error.message)
  });

  const staffPermissionsMutation = useMutation({
    mutationFn: ({ id, overrides }: { id: string; overrides: PermissionOverrides }) => patch(`/members/${id}/permissions`, { overrides }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["members"] }),
    onError: (error) => setMessage(error.message)
  });

  const staffBranchesMutation = useMutation({
    mutationFn: ({ id, branchIds }: { id: string; branchIds: string[] }) => patch(`/members/${id}/branches`, { branchIds }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["members"] }),
    onError: (error) => setMessage(error.message)
  });

  function updateForm<K extends keyof BranchSettingsForm>(key: K, value: BranchSettingsForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = trimForm(form);
    if (!selectedBranch || !body.name || !body.code) return;
    setMessage("");
    saveBranch.mutate(body);
  }

  function savePosSettingsForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedBranch) return;
    saveBranchPosSettings(selectedBranch.id, posSettings);
    setPosMessage("บันทึกตั้งค่า POS แล้ว");
  }

  function handleQrFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPosSettings((current) => ({ ...current, paymentQrImage: String(reader.result ?? "") }));
    reader.readAsDataURL(file);
  }

  async function copyBranchUid() {
    if (!selectedBranch?.id) return;
    await navigator.clipboard.writeText(selectedBranch.id);
    setUidMessage("คัดลอก UID สาขาแล้ว");
  }

  async function copyBranchApplyLink() {
    if (!selectedBranch?.id) return;
    const params = new URLSearchParams({ branchUid: selectedBranch.id });
    await navigator.clipboard.writeText(`${window.location.origin}/join-store?${params.toString()}`);
    setUidMessage("คัดลอกลิงก์สมัครสาขานี้แล้ว");
  }

  function closeStaffEditor() {
    setEditingStaffId(null);
  }

  function toggleStaffPermission(member: BranchStaffMember, permission: Permission, checked: boolean) {
    staffPermissionsMutation.mutate({ id: member.id, overrides: getNextPermissionOverrides(member.role, member.permissionOverrides, permission, checked) });
  }

  function toggleStaffBranch(member: BranchStaffMember, branchId: string, checked: boolean) {
    const current = member.assignedBranches?.map((branch) => branch.id) ?? [];
    const branchIds = checked ? [...new Set([...current, branchId])] : current.filter((id) => id !== branchId);
    staffBranchesMutation.mutate({ id: member.id, branchIds });
  }

  if (!canOpenBranchSettings) return <Navigate to={getSessionDashboardPath(session)} replace />;

  if (branches.isLoading) return <Card>กำลังโหลดข้อมูลสาขา...</Card>;

  if (!selectedBranch) {
    return (
      <Card className="text-center">
        <Building2 className="mx-auto text-stone-400" size={32} />
        <p className="mt-3 text-lg font-black text-ink">ยังไม่มีสาขาให้ตั้งค่า</p>
        <p className="mt-1 text-sm text-stone-600">เพิ่มสาขาจากหน้าจัดการสาขาก่อน แล้วกลับมาตั้งค่าสาขาทำงานได้ที่นี่</p>
      </Card>
    );
  }

  const settingOptions: BranchSettingOption[] = [
    {
      key: "branch-info",
      title: "แก้ไขข้อมูลสาขา",
      detail: "ชื่อ รหัส สถานะ พื้นที่ขาย ผู้ดูแล เบอร์ติดต่อ และหมายเหตุภายใน",
      icon: Building2,
      status: hasCompleteContact ? "ข้อมูลติดต่อครบ" : "ยังขาดข้อมูลติดต่อ",
      statusTone: hasCompleteContact ? "ready" : "missing",
      onClick: () => openSection("branch-info")
    },
    {
      key: "pos-settings",
      title: "ตั้งค่า POS",
      detail: "วิธีชำระเงินเริ่มต้นและ QR รับโอนของสาขานี้",
      icon: QrCode,
      status: `${paymentMethodLabel(posSettings.defaultPaymentMethod)} • ${hasPaymentQr ? "QR พร้อม" : "ยังขาด QR"}`,
      statusTone: hasPaymentQr ? "ready" : "missing",
      onClick: () => openSection("pos-settings")
    },
    ...(canManageMembers ? [{
      key: "staff",
      title: "พนักงานประจำสาขา",
      detail: "ดูเจ้าของร้าน พนักงานที่ดูแลสาขานี้ และคำขอเข้าทำงานของสาขาปัจจุบัน",
      icon: Users,
      status: `${number(branchStaffRows.length)} คน`,
      statusTone: branchStaffRows.length > 0 ? "ready" as const : "neutral" as const,
      onClick: () => openSection("staff")
    }] : []),
    {
      key: "warehouses",
      title: "ตั้งค่าคลังของสาขา",
      detail: "คลังหลักและคลังแยกของสาขานี้ ใช้เมื่อมีพื้นที่เก็บหรือ workflow แยกจริง",
      icon: Boxes,
      status: `${number(warehouseCount)} คลัง`,
      statusTone: warehouseCount > 0 ? "ready" : "missing",
      to: `/app/warehouses?branchId=${selectedBranch.id}`
    },
    {
      key: "stock-history",
      title: "ประวัติสต็อกสาขา",
      detail: "ตรวจรายการรับเข้า ปรับยอด โอนสินค้า และธุรกรรมสต็อกของสาขานี้",
      icon: ClipboardList,
      status: "เปิดหน้าประวัติ",
      statusTone: "neutral",
      to: `/app/inventory/movements?branchId=${selectedBranch.id}`
    }
  ];
  const stockSummary = stockPlanning.data?.summary;
  const shortcutLinks = buildBranchShortcutLinks(selectedBranch.id, effectivePermissions);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-black text-ink">ตั้งค่าสาขา</h1>
          <p className="mt-1 text-sm font-semibold text-stone-500">สาขาทำงานปัจจุบัน: {selectedBranch.name}</p>
        </div>
        {section !== "overview" ? (
          <Button type="button" variant="secondary" icon={<ArrowLeft size={16} />} onClick={() => openSection("overview")}>กลับไปตัวเลือก</Button>
        ) : null}
      </div>

      {section === "overview" ? (
        <div className="space-y-5">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)]">
            <Card className="p-0">
              <div className="border-b border-stone-100 p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-stone-500">Branch Snapshot</p>
                    <h2 className="mt-1 break-words text-2xl font-black text-ink">{selectedBranch.name}</h2>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="rounded bg-stone-100 px-2 py-1 text-xs font-black text-stone-700">{selectedBranch.code}</span>
                      <span className={`rounded px-2 py-1 text-xs font-black ${statusClass(selectedBranch.status)}`}>{statusLabel(selectedBranch.status)}</span>
                      {selectedBranch.isDefault ? <span className="rounded bg-teal-50 px-2 py-1 text-xs font-black text-teal-700">สาขาหลัก</span> : null}
                    </div>
                  </div>
                  <div className="min-w-0 rounded-md bg-stone-50 p-3">
                    <p className="text-xs font-bold text-stone-500">UID สาขา</p>
                    <p className="mt-1 break-all font-mono text-xs font-bold text-ink">{selectedBranch.id}</p>
                    <Button className="mt-3 w-full" type="button" variant="secondary" icon={<Clipboard size={15} />} onClick={copyBranchUid}>คัดลอก UID สาขา</Button>
                    {uidMessage ? <p className="mt-2 text-xs font-bold text-teal-700">{uidMessage}</p> : null}
                  </div>
                </div>
              </div>
              <div className="grid gap-3 border-b border-stone-100 p-5 sm:grid-cols-3">
                <div className="rounded-md bg-white">
                  <p className="text-xs font-bold text-stone-500">พื้นที่ขาย / ที่อยู่</p>
                  <p className="mt-1 break-words text-sm font-black text-ink">{form.address.trim() || "ยังไม่ได้ระบุ"}</p>
                </div>
                <div className="rounded-md bg-white">
                  <p className="text-xs font-bold text-stone-500">ผู้ดูแล</p>
                  <p className="mt-1 break-words text-sm font-black text-ink">{form.contactName.trim() || "ยังไม่ได้ระบุ"}</p>
                </div>
                <div className="rounded-md bg-white">
                  <p className="text-xs font-bold text-stone-500">เบอร์ติดต่อ</p>
                  <p className="mt-1 break-words text-sm font-black text-ink">{form.contactPhone.trim() || "ยังไม่ได้ระบุ"}</p>
                </div>
              </div>
              <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-md bg-stone-50 p-3">
                  <p className="text-xs font-bold text-stone-500">คลังในสาขา</p>
                  <p className="mt-1 text-xl font-black text-ink">{number(warehouseCount)}</p>
                </div>
                <div className="rounded-md bg-stone-50 p-3">
                  <p className="text-xs font-bold text-stone-500">POS เริ่มต้น</p>
                  <p className="mt-1 text-xl font-black text-ink">{paymentMethodLabel(posSettings.defaultPaymentMethod)}</p>
                  <p className={`mt-1 text-xs font-bold ${hasPaymentQr ? "text-teal-700" : "text-amber-700"}`}>{hasPaymentQr ? "QR พร้อม" : "ยังไม่ได้ตั้ง QR"}</p>
                </div>
                {canReadStockReport ? (
                  <div className="rounded-md bg-stone-50 p-3">
                    <p className="text-xs font-bold text-stone-500">สต็อก</p>
                    <p className="mt-1 text-xl font-black text-ink">{stockPlanning.isLoading ? "..." : number(stockSummary?.totalProducts ?? 0)}</p>
                    <p className="mt-1 text-xs font-bold text-stone-500">ใกล้หมด/ควรเติม/หมด {stockPlanning.isLoading ? "..." : number((stockSummary?.lowStockCount ?? 0) + (stockSummary?.outOfStockCount ?? 0))}</p>
                  </div>
                ) : null}
                {canReadStockReport ? (
                  <div className="rounded-md bg-stone-50 p-3">
                    <p className="text-xs font-bold text-stone-500">มูลค่าสต็อก</p>
                    <p className="mt-1 text-xl font-black text-ink">{stockPlanning.isLoading ? "..." : baht(stockSummary?.stockValue ?? 0)}</p>
                  </div>
                ) : null}
              </div>
            </Card>

            <Card>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black text-ink">ความพร้อมสาขา</h2>
                  <p className="mt-1 text-sm font-semibold text-stone-500">พร้อมแล้ว {number(branchReadyCount)}/{number(branchReadiness.length)} รายการ</p>
                </div>
                <span className={`rounded px-2 py-1 text-xs font-black ${branchReadyCount === branchReadiness.length ? "bg-teal-50 text-teal-700" : "bg-amber-50 text-amber-800"}`}>
                  {branchReadyCount === branchReadiness.length ? "พร้อมใช้งาน" : "ต้องเติมข้อมูล"}
                </span>
              </div>
              <div className="mt-4 grid gap-2">
                {branchReadiness.map((item) => {
                  const action = item.to ? (
                    <Link to={item.to} className="text-xs font-black text-leaf hover:text-teal-800">{item.actionLabel}</Link>
                  ) : (
                    <button type="button" className="text-xs font-black text-leaf hover:text-teal-800" onClick={() => item.section && openSection(item.section)}>{item.actionLabel}</button>
                  );
                  return (
                    <div key={item.key} className="flex items-center gap-3 rounded-md border border-stone-200 px-3 py-2">
                      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded ${item.ready ? "bg-teal-50 text-teal-700" : "bg-amber-50 text-amber-800"}`}>
                        {item.ready ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
                      </span>
                      <span className="min-w-0 flex-1 text-sm font-bold text-stone-700">{item.label}</span>
                      {action}
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {settingOptions.map((option) => {
              const Icon = option.icon;
              const content = (
                <>
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-teal-50 text-leaf"><Icon size={22} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-start justify-between gap-2">
                      <span className="block text-lg font-black text-ink">{option.title}</span>
                      <span className={`rounded px-2 py-1 text-xs font-black ${toneClass(option.statusTone)}`}>{option.status}</span>
                    </span>
                    <span className="mt-2 block text-sm font-semibold leading-6 text-stone-500">{option.detail}</span>
                  </span>
                </>
              );
              if (option.to) {
                return (
                  <Link key={option.key} to={option.to} className="flex min-h-40 items-start gap-3 rounded-lg border border-stone-200 bg-white p-5 shadow-sm transition hover:border-leaf/40 hover:bg-teal-50/30">
                    {content}
                  </Link>
                );
              }
              return (
                <button key={option.key} type="button" onClick={option.onClick} className="flex min-h-40 items-start gap-3 rounded-lg border border-stone-200 bg-white p-5 text-left shadow-sm transition hover:border-leaf/40 hover:bg-teal-50/30">
                  {content}
                </button>
              );
            })}
          </div>

          {shortcutLinks.length > 0 ? (
            <Card>
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-stone-100 text-stone-700"><PackageCheck size={20} /></span>
                <div>
                  <h2 className="text-xl font-black text-ink">ทางลัดของสาขานี้</h2>
                  <p className="mt-1 text-sm font-semibold text-stone-500">ไปต่อที่หน้าหลักพร้อมขอบเขตสาขาปัจจุบัน</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {shortcutLinks.map((shortcut) => {
                  const Icon = shortcut.icon;
                  return (
                    <Link key={shortcut.to} to={shortcut.to}>
                      <Button type="button" variant="secondary" icon={<Icon size={16} />}>{shortcut.label}</Button>
                    </Link>
                  );
                })}
              </div>
            </Card>
          ) : null}
        </div>
      ) : null}

      {section === "pos-settings" ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
          <Card>
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-teal-50 text-leaf"><QrCode size={22} /></span>
              <div>
                <h2 className="text-xl font-black">ตั้งค่า POS</h2>
                <p className="mt-1 text-sm font-semibold text-stone-500">ใช้กับหน้าขายของสาขา {selectedBranch.name}</p>
              </div>
            </div>
            <form onSubmit={savePosSettingsForm} className="mt-5 grid gap-4">
              <label className="grid gap-1.5">
                <span className="text-sm font-black text-stone-700">วิธีชำระเงินเริ่มต้น</span>
                <Dropdown
                  value={posSettings.defaultPaymentMethod}
                  onValueChange={(value) => setPosSettings((current) => ({ ...current, defaultPaymentMethod: value as BranchPosSettings["defaultPaymentMethod"] }))}
                  options={[
                    { value: "CASH", label: "เงินสด" },
                    { value: "TRANSFER", label: "โอนเงิน" }
                  ]}
                />
              </label>
              <label className="grid gap-1.5">
                <span className="text-sm font-black text-stone-700">ลิงก์รูป QR / data URL</span>
                <input
                  className="field"
                  value={posSettings.paymentQrImage.startsWith("data:") ? "" : posSettings.paymentQrImage}
                  onChange={(event) => setPosSettings((current) => ({ ...current, paymentQrImage: event.target.value }))}
                  placeholder="https://..."
                />
              </label>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-bold text-ink transition hover:border-leaf">
                <Upload size={16} />
                อัปโหลดรูป QR
                <input className="sr-only" type="file" accept="image/*" onChange={handleQrFileChange} />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button icon={<Save size={16} />}>บันทึกตั้งค่า POS</Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setPosSettings((current) => ({ ...current, paymentQrImage: "" }))}
                >
                  ล้าง QR
                </Button>
              </div>
              {posMessage ? <p className="rounded-md bg-stone-100 p-3 text-sm font-bold text-stone-700">{posMessage}</p> : null}
            </form>
          </Card>

          <Card>
            <h2 className="text-xl font-black">ตัวอย่าง QR รับโอน</h2>
            <div className="mt-5 grid aspect-square max-w-sm place-items-center rounded-md border border-stone-200 bg-stone-50 p-4">
              {posSettings.paymentQrImage ? (
                <img src={posSettings.paymentQrImage} alt="QR รับโอน" className="h-full w-full rounded-md bg-white object-contain p-3 shadow-sm" />
              ) : (
                <div className="text-center text-stone-500">
                  <QrCode className="mx-auto" size={96} />
                  <p className="mt-3 text-sm font-bold">ยังไม่ได้ตั้ง QR</p>
                </div>
              )}
            </div>
            <p className="mt-4 text-sm font-semibold leading-6 text-stone-500">เมื่อตั้งค่าแล้ว POS จะใช้ QR นี้ในหน้าชำระเงินแบบโอนของสาขานี้</p>
          </Card>
        </div>
      ) : null}

      {section === "staff" && canManageMembers ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)]">
          <Card>
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-teal-50 text-leaf"><Users size={22} /></span>
                <div>
                  <h2 className="text-xl font-black text-ink">พนักงานประจำสาขา</h2>
                  <p className="mt-1 text-sm font-semibold text-stone-500">พนักงานที่เข้าถึงหรือสมัครเข้าสาขา {selectedBranch.name}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm sm:min-w-64">
                <div className="rounded-md bg-stone-50 p-3">
                  <p className="text-xs font-bold text-stone-500">ใช้งานอยู่</p>
                  <p className="mt-1 text-xl font-black text-teal-700">{number(activeStaffCount)}</p>
                </div>
                <div className="rounded-md bg-stone-50 p-3">
                  <p className="text-xs font-bold text-stone-500">รออนุมัติ</p>
                  <p className="mt-1 text-xl font-black text-amber-700">{number(pendingStaffCount)}</p>
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {branchStaff.isLoading ? <p className="rounded-md bg-stone-50 p-4 text-sm font-semibold text-stone-600">กำลังโหลดพนักงาน...</p> : null}
              {branchStaffRows.map((member) => (
                <div key={member.id} className="rounded-md border border-stone-200 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-lg font-black text-ink">{staffName(member)}</p>
                      <div className="mt-2 grid gap-2 text-sm text-stone-600 sm:grid-cols-2">
                        <p className="flex min-w-0 items-center gap-2">
                          <Mail size={15} className="shrink-0 text-stone-400" />
                          <span className="truncate">{staffEmail(member)}</span>
                        </p>
                        <p className="flex min-w-0 items-center gap-2">
                          <Phone size={15} className="shrink-0 text-stone-400" />
                          <span className="truncate">{staffPhone(member)}</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 md:justify-end">
                      <span className={`rounded px-2 py-1 text-xs font-black ${staffStatusClasses[member.status]}`}>{staffStatusLabels[member.status]}</span>
                      <span className="rounded bg-stone-100 px-2 py-1 text-xs font-black text-stone-700">{staffRoleLabels[member.role]}</span>
                      {member.status !== "PENDING" ? (
                        <Button type="button" variant="ghost" icon={<SlidersHorizontal size={15} />} onClick={() => setEditingStaffId(member.id)}>แก้ไข</Button>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                    <div className="rounded-md bg-stone-50 p-3">
                      <p className="text-xs font-bold text-stone-500">เข้าร่วม</p>
                      <p className="mt-1 font-bold text-ink">{formatMemberDate(member.createdAt)}</p>
                    </div>
                    <div className="rounded-md bg-stone-50 p-3">
                      <p className="text-xs font-bold text-stone-500">สาขาที่ดูแล</p>
                      <p className="mt-1 font-bold text-ink">{member.assignedBranches?.map((branch) => branch.name).join(", ") || "ยังไม่ได้กำหนด"}</p>
                    </div>
                    <div className="rounded-md bg-stone-50 p-3">
                      <p className="text-xs font-bold text-stone-500">สิทธิ์ที่เปิด</p>
                      <p className="mt-1 font-bold text-ink">{number(countEnabledPermissions(member))} รายการ</p>
                    </div>
                    <div className="rounded-md bg-stone-50 p-3">
                      <p className="text-xs font-bold text-stone-500">ตำแหน่งที่สนใจ</p>
                      <p className="mt-1 font-bold text-ink">{member.preferredRole || "-"}</p>
                    </div>
                    <div className="rounded-md bg-stone-50 p-3">
                      <p className="text-xs font-bold text-stone-500">พร้อมเริ่ม</p>
                      <p className="mt-1 font-bold text-ink">{formatMemberDate(member.availableStartDate)}</p>
                    </div>
                  </div>
                  {member.preferredRole || member.preferredBranch || member.requestedBranch || member.applicationNote ? (
                    <div className="mt-3 rounded-md border border-stone-200 bg-white p-3 text-sm leading-6 text-stone-700">
                      <p className="font-bold text-ink">ข้อมูลที่ส่งมาตอนสมัคร</p>
                      <p>ตำแหน่งที่สนใจ: {member.preferredRole || "-"}</p>
                      <p>สาขาที่อยากสมัคร: {staffRequestedBranchName(member)}</p>
                      {member.applicationNote ? <p>ข้อความถึงร้าน: {member.applicationNote}</p> : null}
                    </div>
                  ) : null}
                </div>
              ))}
              {!branchStaff.isLoading && branchStaffRows.length === 0 ? <p className="rounded-md bg-stone-50 p-4 text-sm font-semibold text-stone-600">ยังไม่มีพนักงานในสาขานี้</p> : null}
            </div>
          </Card>

          <div className="space-y-5">
            <Card>
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-teal-50 text-leaf"><Clipboard size={22} /></span>
                <div>
                  <h2 className="text-xl font-black text-ink">UID สาขา</h2>
                  <p className="mt-1 text-sm font-semibold text-stone-500">ส่ง UID หรือลิงก์นี้ให้พนักงานสมัครเข้าสาขาปัจจุบัน</p>
                </div>
              </div>
              <div className="mt-5 rounded-md border border-stone-200 bg-stone-50 p-3">
                <p className="text-xs font-bold text-stone-500">{selectedBranch.name}</p>
                <p className="mt-1 break-all font-mono text-sm font-bold text-ink">{selectedBranch.id}</p>
              </div>
              {uidMessage ? <p className="mt-3 rounded-md bg-stone-100 p-3 text-sm font-semibold leading-6 text-stone-700">{uidMessage}</p> : null}
              <div className="mt-4 grid gap-2">
                <Button type="button" className="w-full" variant="secondary" icon={<Clipboard size={15} />} onClick={copyBranchUid}>คัดลอก UID สาขา</Button>
                <Button type="button" className="w-full" variant="ghost" icon={<Clipboard size={15} />} onClick={copyBranchApplyLink}>คัดลอกลิงก์สมัครสาขานี้</Button>
              </div>
            </Card>

            <Card>
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-teal-50 text-leaf"><ShieldCheck size={22} /></span>
                <div>
                  <h2 className="text-xl font-black text-ink">เจ้าของร้าน</h2>
                  <p className="mt-1 text-sm font-semibold text-stone-500">ข้อมูลอ้างอิงให้ทีมสาขารู้ว่าใครเป็นเจ้าของร้าน</p>
                </div>
              </div>
              <div className="mt-5 grid gap-3 rounded-md border border-stone-200 bg-stone-50 p-4">
                <div>
                  <p className="text-xs font-bold text-stone-500">ชื่อ</p>
                  <p className="mt-1 text-lg font-black text-ink">{ownerMember ? staffName(ownerMember) : "-"}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-stone-500">อีเมล</p>
                  <p className="mt-1 break-all text-sm font-semibold text-ink">{ownerMember ? staffEmail(ownerMember) : "-"}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-stone-500">สิทธิ์ดูแล</p>
                  <p className="mt-1 text-sm font-semibold text-ink">ทุกสาขา</p>
                </div>
              </div>
            </Card>

            <Card id="staff-requests" className="scroll-mt-24">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-black text-ink">คำขอเข้าทำงาน</h2>
                <span className="rounded bg-amber-50 px-2 py-1 text-xs font-black text-amber-700">{number(pendingStaffCount)} รายการ</span>
              </div>
              <div className="mt-4 grid gap-3">
                {pendingStaffRows.map((member) => (
                  <div key={member.id} className="rounded-md border border-amber-200 bg-amber-50/40 p-3">
                    <p className="font-black text-ink">{staffName(member)}</p>
                    <p className="mt-1 break-all text-sm font-semibold text-stone-600">{staffEmail(member)}</p>
                    <p className="mt-2 text-xs font-semibold text-stone-600">โทร: {staffPhone(member)}</p>
                    <p className="mt-1 text-xs font-semibold text-stone-600">ตำแหน่งที่สนใจ: {member.preferredRole || "-"}</p>
                    <p className="mt-1 text-xs font-semibold text-stone-600">สาขาที่สมัคร: {staffRequestedBranchName(member)}</p>
                    <p className="mt-1 text-xs font-semibold text-stone-600">พร้อมเริ่ม: {formatMemberDate(member.availableStartDate)}</p>
                    <p className="mt-1 break-all text-xs font-semibold text-stone-600">UID สาขาที่ใช้สมัคร: {member.requestedBranchId ?? "-"}</p>
                    {member.applicationNote ? <p className="mt-1 text-xs font-semibold text-stone-600">ข้อความถึงร้าน: {member.applicationNote}</p> : null}
                    <p className="mt-1 text-xs font-semibold text-stone-500">ขอเมื่อ {formatMemberDate(member.createdAt)}</p>
                  </div>
                ))}
                {!branchStaff.isLoading && pendingStaffCount === 0 ? <p className="rounded-md bg-stone-50 p-4 text-sm font-semibold text-stone-600">ยังไม่มีคำขอเข้าทำงานของสาขานี้</p> : null}
              </div>
            </Card>
          </div>
        </div>
      ) : null}

      {editingStaff ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4" role="dialog" aria-modal="true" aria-labelledby="branch-staff-editor-title" onMouseDown={closeStaffEditor}>
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b border-stone-200 p-5">
              <div>
                <p className="text-xs font-black uppercase text-teal-700">พนักงานประจำสาขา</p>
                <h2 id="branch-staff-editor-title" className="mt-1 text-2xl font-black text-ink">แก้ไขข้อมูลพนักงาน</h2>
                <p className="mt-1 text-sm leading-6 text-stone-600">{staffName(editingStaff)} • {staffEmail(editingStaff)}</p>
              </div>
              <button type="button" className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-stone-200 text-stone-600 transition hover:bg-stone-50" aria-label="ปิดหน้าต่างแก้ไขพนักงาน" onClick={closeStaffEditor}>
                <X size={18} />
              </button>
            </div>

            <div className="overflow-y-auto p-5">
              <div className="grid gap-3 rounded-md border border-stone-200 bg-stone-50 p-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs font-bold text-stone-500">ชื่อ</p>
                  <p className="mt-1 font-black text-ink">{staffName(editingStaff)}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-stone-500">อีเมล</p>
                  <p className="mt-1 break-all font-semibold text-ink">{staffEmail(editingStaff)}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-stone-500">เบอร์โทร</p>
                  <p className="mt-1 font-semibold text-ink">{staffPhone(editingStaff)}</p>
                </div>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-[minmax(220px,0.7fr)_minmax(0,1.3fr)]">
                <div className="grid gap-4">
                  <label className="grid gap-1.5">
                    <span className="text-sm font-black text-stone-700">ตำแหน่ง</span>
                    <Dropdown
                      value={editingStaff.role}
                      onValueChange={(nextRole) => staffRoleMutation.mutate({ id: editingStaff.id, role: nextRole as Role })}
                      options={staffRoleOptions}
                      disabled={staffRoleMutation.isPending}
                    />
                  </label>
                  <div className="rounded-md border border-stone-200 p-3">
                    <p className="text-sm font-black text-stone-700">สถานะ</p>
                    <p className={`mt-2 inline-flex rounded px-2 py-1 text-xs font-black ${staffStatusClasses[editingStaff.status]}`}>{staffStatusLabels[editingStaff.status]}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {editingStaff.status === "ACTIVE" ? (
                        <Button type="button" variant="secondary" icon={<UserRoundX size={15} />} onClick={() => staffStatusMutation.mutate({ id: editingStaff.id, status: "DISABLED" })} disabled={staffStatusMutation.isPending}>ปิดใช้งาน</Button>
                      ) : null}
                      {editingStaff.status === "DISABLED" ? (
                        <Button type="button" variant="secondary" icon={<CheckCircle2 size={15} />} onClick={() => staffStatusMutation.mutate({ id: editingStaff.id, status: "ACTIVE" })} disabled={staffStatusMutation.isPending}>เปิดใช้งาน</Button>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-sm font-black text-stone-700">สาขาที่เข้าถึงได้</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {activeBranches.map((branch) => {
                      const checked = Boolean(editingStaff.assignedBranches?.some((assignedBranch) => assignedBranch.id === branch.id));
                      return (
                        <label key={branch.id} className="flex items-center justify-between gap-3 rounded-md border border-stone-200 bg-white px-3 py-2 text-sm">
                          <span className="min-w-0">
                            <span className="block truncate font-semibold">{branch.name}</span>
                            {branch.code ? <span className="block truncate text-xs text-stone-500">{branch.code}</span> : null}
                          </span>
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-leaf"
                            checked={checked}
                            disabled={staffBranchesMutation.isPending}
                            onChange={(event) => toggleStaffBranch(editingStaff, branch.id, event.target.checked)}
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="mt-5 grid gap-4">
                {branchStaffPermissionGroups.map((group) => (
                  <div key={group.title}>
                    <p className="mb-2 text-sm font-black text-stone-700">{group.title}</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {group.permissions.map((permission) => (
                        <label key={permission} className="flex items-center justify-between gap-3 rounded-md border border-stone-200 bg-white px-3 py-2 text-sm">
                          <span>{permissionLabels[permission]}</span>
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-leaf"
                            checked={editingStaff.effectivePermissions[permission]}
                            disabled={staffPermissionsMutation.isPending}
                            onChange={(event) => toggleStaffPermission(editingStaff, permission, event.target.checked)}
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end border-t border-stone-200 bg-stone-50 p-4">
              <Button type="button" variant="secondary" onClick={closeStaffEditor}>ปิด</Button>
            </div>
          </div>
        </div>
      ) : null}

      {section === "branch-info" ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)]">
          <Card>
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-teal-50 text-leaf"><Building2 size={22} /></span>
          <div>
            <h2 className="text-xl font-black">แก้ไขข้อมูลสาขา</h2>
            <p className="mt-1 text-sm font-semibold text-stone-500">ข้อมูลนี้ใช้กับการปฏิบัติงาน หน้าคลัง และการติดต่อภายใน</p>
          </div>
        </div>

        <form onSubmit={submit} className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="grid gap-1.5">
            <span className="text-sm font-black text-stone-700">ชื่อสาขา</span>
            <input className="field" value={form.name} onChange={(event) => updateForm("name", event.target.value)} required />
          </label>
          <label className="grid gap-1.5">
            <span className="text-sm font-black text-stone-700">รหัสสาขา</span>
            <input className="field uppercase" value={form.code} onChange={(event) => updateForm("code", event.target.value)} required />
          </label>
          <label className="grid gap-1.5">
            <span className="text-sm font-black text-stone-700">สถานะ</span>
            <Dropdown
              value={form.status}
              onValueChange={(nextValue) => updateForm("status", nextValue as BranchStatus)}
              options={[
                { value: "ACTIVE", label: "เปิดใช้งาน" },
                { value: "INACTIVE", label: "ปิดใช้งาน" }
              ]}
            />
          </label>
          <label className="grid gap-1.5 md:col-span-2">
            <span className="text-sm font-black text-stone-700">ที่อยู่ / พื้นที่ขาย</span>
            <input className="field" value={form.address} onChange={(event) => updateForm("address", event.target.value)} placeholder="เช่น ชั้น 1 โซน A หรือที่อยู่สาขา" />
          </label>
          <label className="grid gap-1.5">
            <span className="text-sm font-black text-stone-700">ผู้ดูแล</span>
            <input className="field" value={form.contactName} onChange={(event) => updateForm("contactName", event.target.value)} placeholder="ชื่อผู้รับผิดชอบ" />
          </label>
          <label className="grid gap-1.5">
            <span className="text-sm font-black text-stone-700">เบอร์ติดต่อ</span>
            <input className="field" value={form.contactPhone} onChange={(event) => updateForm("contactPhone", event.target.value)} placeholder="เช่น 080-000-0000" />
          </label>
          <label className="grid gap-1.5 md:col-span-2">
            <span className="text-sm font-black text-stone-700">หมายเหตุ</span>
            <textarea className="field min-h-28" value={form.note} onChange={(event) => updateForm("note", event.target.value)} placeholder="เช่น เวลาทำการ ข้อจำกัดพื้นที่ หรือหมายเหตุภายใน" />
          </label>
          {message ? <p className="rounded-md bg-stone-100 p-3 text-sm font-bold text-stone-700 md:col-span-2">{message}</p> : null}
          <Button className="md:col-span-2" disabled={saveBranch.isPending || !form.name.trim() || !form.code.trim()} icon={<Save size={16} />}>บันทึกข้อมูลสาขา</Button>
        </form>
          </Card>

          <Card>
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-stone-100 text-stone-700"><CheckCircle2 size={22} /></span>
          <div>
            <h2 className="text-xl font-black">ความพร้อมสาขา</h2>
            <p className="mt-1 text-sm font-semibold text-stone-500">พร้อมแล้ว {readyCount}/{items.length} รายการ</p>
          </div>
        </div>
        <div className="mt-5 grid gap-2">
          {items.map((item) => (
            <div key={item.label} className="flex items-center justify-between rounded-md border border-stone-200 px-3 py-2">
              <span className="text-sm font-bold text-stone-700">{item.label}</span>
              <span className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-black ${item.ready ? "bg-teal-50 text-teal-700" : "bg-stone-100 text-stone-500"}`}>
                {item.ready ? <CheckCircle2 size={13} /> : null}
                {item.ready ? "พร้อม" : "ยังขาด"}
              </span>
            </div>
          ))}
        </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
