import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown, Edit3, ImageIcon, LockKeyhole, Package, Palette, Plus, Search, Tags, Trash2, X } from "lucide-react";
import { Fragment, FormEvent, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Dropdown } from "../components/Dropdown";
import { api, patch, post } from "../lib/api";
import { branchScopedPath } from "../lib/branch-scope";
import { number } from "../lib/format";
import { hasSessionPermission } from "../lib/permissions";
import { getProductDisplayName, getProductImageUrl, matchesProductSearch, stockOf as productStockOf, type ProductForSummary } from "../lib/products";
import { useAuth } from "../state/auth";
import { useWorkingBranch } from "../state/working-branch";

type Category = {
  id: string;
  name: string;
  color: string;
  products?: Array<{ id: string; name: string; sku: string; imagePath?: string | null; unit?: string; balances: Array<{ quantity: number }> }>;
  _count?: { products: number };
};

type CategoryForm = {
  name: string;
  color: string;
};

type CategorySort = "NAME_ASC" | "NAME_DESC" | "PRODUCTS_DESC" | "PRODUCTS_ASC" | "UNUSED_FIRST" | "USED_FIRST";
type ProductPickerMode = "UNCATEGORIZED" | "ALL";
type ProductPickerProduct = ProductForSummary;
type RemovableCategoryProduct = Pick<ProductForSummary, "id" | "name" | "sku"> & Partial<Pick<ProductForSummary, "variantColor" | "variantSize" | "category">>;

const emptyForm: CategoryForm = { name: "", color: "#2563eb" };
const colorOptions = ["#2563eb", "#0f766e", "#dc2626", "#ca8a04", "#7c3aed", "#0891b2", "#475569", "#16a34a"];
const sortOptions: Array<{ value: CategorySort; label: string }> = [
  { value: "NAME_ASC", label: "ชื่อ ก-ฮ" },
  { value: "NAME_DESC", label: "ชื่อ ฮ-ก" },
  { value: "PRODUCTS_DESC", label: "สินค้ามากสุด" },
  { value: "PRODUCTS_ASC", label: "สินค้าน้อยสุด" },
  { value: "UNUSED_FIRST", label: "หมวดว่างก่อน" },
  { value: "USED_FIRST", label: "ใช้งานอยู่ก่อน" }
];

function productCount(category: Category) {
  return category._count?.products ?? 0;
}

function ProductPreviewImage({ product }: { product: NonNullable<Category["products"]>[number] }) {
  const imageUrl = getProductImageUrl(product);
  if (imageUrl) return <img src={imageUrl} alt={product.name} className="h-10 w-10 shrink-0 rounded-md border border-stone-200 object-cover" />;
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-dashed border-stone-300 bg-stone-50 text-stone-400">
      <ImageIcon size={18} />
    </span>
  );
}

export function CategoriesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<CategorySort>("NAME_ASC");
  const [form, setForm] = useState<CategoryForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [openCategoryId, setOpenCategoryId] = useState<string | null>(null);
  const [assigningCategory, setAssigningCategory] = useState<Category | null>(null);
  const [productPickerMode, setProductPickerMode] = useState<ProductPickerMode>("UNCATEGORIZED");
  const [productSearch, setProductSearch] = useState("");
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(() => new Set());
  const [assignedProductIdsThisSession, setAssignedProductIdsThisSession] = useState<Set<string>>(() => new Set());
  const [removedProductIdsThisSession, setRemovedProductIdsThisSession] = useState<Set<string>>(() => new Set());
  const [pendingMoveProducts, setPendingMoveProducts] = useState<ProductPickerProduct[]>([]);
  const [pendingRemoveProducts, setPendingRemoveProducts] = useState<RemovableCategoryProduct[]>([]);
  const [pendingRemoveCategory, setPendingRemoveCategory] = useState<Category | null>(null);
  const [successTitle, setSuccessTitle] = useState("เพิ่มสินค้าเรียบร้อย");
  const [successMessage, setSuccessMessage] = useState("");
  const [successHint, setSuccessHint] = useState("");
  const session = useAuth((state) => state.session);
  const workingBranchId = useWorkingBranch((state) => state.workingBranchId);
  const canViewCategories = hasSessionPermission(session, "products.read");
  const canEditCategories = hasSessionPermission(session, "products.update");
  const categories = useQuery({
    queryKey: ["categories", workingBranchId],
    queryFn: () => api<Category[]>(branchScopedPath("/categories", workingBranchId)),
    enabled: canViewCategories
  });
  const products = useQuery({
    queryKey: ["products", "category-picker", workingBranchId],
    queryFn: () => api<ProductPickerProduct[]>(branchScopedPath("/products", workingBranchId)),
    enabled: canViewCategories && Boolean(assigningCategory)
  });

  useEffect(() => {
    setOpenCategoryId(null);
  }, [search, sortBy]);

  useEffect(() => {
    if (!canEditCategories) resetForm();
  }, [canEditCategories]);

  useEffect(() => {
    setSelectedProductIds(new Set());
    setAssignedProductIdsThisSession(new Set());
    setRemovedProductIdsThisSession(new Set());
    setPendingMoveProducts([]);
    setPendingRemoveProducts([]);
    setPendingRemoveCategory(null);
    setSuccessMessage("");
    setSuccessHint("");
  }, [assigningCategory?.id, productPickerMode]);

  const filteredCategories = useMemo(() => {
    const query = search.trim().toLowerCase();
    const rows = (categories.data ?? []).filter((category) => !query || category.name.toLowerCase().includes(query));
    return rows.sort((left, right) => {
      const leftCount = productCount(left);
      const rightCount = productCount(right);
      if (sortBy === "NAME_DESC") return right.name.localeCompare(left.name, "th");
      if (sortBy === "PRODUCTS_DESC") return rightCount - leftCount || left.name.localeCompare(right.name, "th");
      if (sortBy === "PRODUCTS_ASC") return leftCount - rightCount || left.name.localeCompare(right.name, "th");
      if (sortBy === "UNUSED_FIRST") return Number(leftCount > 0) - Number(rightCount > 0) || left.name.localeCompare(right.name, "th");
      if (sortBy === "USED_FIRST") return Number(rightCount > 0) - Number(leftCount > 0) || left.name.localeCompare(right.name, "th");
      return left.name.localeCompare(right.name, "th");
    });
  }, [categories.data, search, sortBy]);

  const totals = useMemo(() => ({
    categories: categories.data?.length ?? 0,
    assignedProducts: (categories.data ?? []).reduce((sum, category) => sum + productCount(category), 0),
    unusedCategories: (categories.data ?? []).filter((category) => productCount(category) === 0).length
  }), [categories.data]);
  const productPickerRows = useMemo(() => {
    const targetName = assigningCategory?.name;
    return (products.data ?? [])
      .filter((product) => product.status !== "ARCHIVED")
      .filter((product) => productPickerMode === "ALL" || ((!product.category?.name || removedProductIdsThisSession.has(product.id)) && !assignedProductIdsThisSession.has(product.id)))
      .filter((product) => matchesProductSearch(product, productSearch))
      .sort((left, right) => {
        const leftInTarget = (left.category?.name === targetName || assignedProductIdsThisSession.has(left.id)) && !removedProductIdsThisSession.has(left.id);
        const rightInTarget = (right.category?.name === targetName || assignedProductIdsThisSession.has(right.id)) && !removedProductIdsThisSession.has(right.id);
        if (leftInTarget !== rightInTarget) return Number(leftInTarget) - Number(rightInTarget);
        const leftHasCategory = Boolean(left.category?.name);
        const rightHasCategory = Boolean(right.category?.name);
        if (leftHasCategory !== rightHasCategory) return Number(leftHasCategory) - Number(rightHasCategory);
        return getProductDisplayName(left).localeCompare(getProductDisplayName(right), "th");
      });
  }, [assigningCategory?.name, assignedProductIdsThisSession, productPickerMode, productSearch, products.data, removedProductIdsThisSession]);
  const visibleAssignableProductIds = useMemo(() => {
    return productPickerRows
      .filter((product) => (product.category?.name !== assigningCategory?.name || removedProductIdsThisSession.has(product.id)) && !assignedProductIdsThisSession.has(product.id))
      .map((product) => product.id);
  }, [assigningCategory?.name, assignedProductIdsThisSession, productPickerRows, removedProductIdsThisSession]);
  const allVisibleAssignableSelected = visibleAssignableProductIds.length > 0 && visibleAssignableProductIds.every((id) => selectedProductIds.has(id));

  const saveMutation = useMutation({
    mutationFn: (payload: CategoryForm) => editingId ? patch<Category>(`/categories/${editingId}`, payload) : post<Category>("/categories", payload),
    onSuccess: (_category, _payload, context) => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setSuccessTitle(context?.wasEditing ? "แก้ไขสำเร็จ" : "สร้างหมวดหมู่สำเร็จ");
      setSuccessMessage(context?.wasEditing ? "บันทึกการแก้ไขหมวดหมู่เรียบร้อยแล้ว" : "สร้างหมวดหมู่ใหม่เรียบร้อยแล้ว");
      setSuccessHint("");
      resetForm();
    },
    onMutate: () => ({ wasEditing: Boolean(editingId) })
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api<Category>(`/categories/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    }
  });
  const assignProductsMutation = useMutation({
    mutationFn: ({ productIds, categoryName }: { productIds: string[]; categoryName: string | null; sourceCategoryName?: string }) => patch<{ updatedCount: number; categoryName: string | null }>("/products/bulk/category", { productIds, categoryName }),
    onSuccess: (result, variables) => {
      if (variables.categoryName === null) {
        const categoryName = variables.sourceCategoryName ?? pendingRemoveCategory?.name ?? assigningCategory?.name ?? "หมวดหมู่";
        setAssignedProductIdsThisSession((current) => {
          const next = new Set(current);
          variables.productIds.forEach((id) => next.delete(id));
          return next;
        });
        setRemovedProductIdsThisSession((current) => new Set([...current, ...variables.productIds]));
        setSuccessTitle("นำสินค้าออกเรียบร้อย");
        setSuccessMessage(`นำสินค้าออกจาก "${categoryName}" แล้ว ${number(result.updatedCount)} รายการ`);
        setSuccessHint("สินค้าที่นำออกแล้วจะกลับไปอยู่ในรายการยังไม่จัดหมวด");
      } else {
        const categoryName = result.categoryName ?? assigningCategory?.name ?? "หมวดหมู่";
        setRemovedProductIdsThisSession((current) => {
          const next = new Set(current);
          variables.productIds.forEach((id) => next.delete(id));
          return next;
        });
        setAssignedProductIdsThisSession((current) => new Set([...current, ...variables.productIds]));
        setSuccessTitle("เพิ่มสินค้าเรียบร้อย");
        setSuccessMessage(`เพิ่มสินค้าเข้า "${categoryName}" แล้ว ${number(result.updatedCount)} รายการ`);
        setSuccessHint("รายการที่เพิ่มแล้วจะไม่แสดงในแท็บยังไม่จัดหมวด และจะถูกทำเครื่องหมายว่าอยู่ในหมวดนี้ในแท็บสินค้าทั้งหมด");
      }
      setSelectedProductIds(new Set());
      setPendingMoveProducts([]);
      setPendingRemoveProducts([]);
      setPendingRemoveCategory(null);
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["stock-report"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    }
  });

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    setIsFormOpen(false);
  }

  function startCreate() {
    if (!canEditCategories) return;
    setForm(emptyForm);
    setEditingId(null);
    setIsFormOpen(true);
  }

  function startEdit(category: Category) {
    if (!canEditCategories) return;
    setForm({ name: category.name, color: category.color || "#2563eb" });
    setEditingId(category.id);
    setIsFormOpen(true);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEditCategories) return;
    saveMutation.mutate({ name: form.name.trim(), color: form.color });
  }

  function remove(category: Category) {
    if (!canEditCategories) return;
    if (!window.confirm(`ลบหมวดหมู่ "${category.name}" หรือไม่?`)) return;
    deleteMutation.mutate(category.id);
  }

  function openProductPicker(category: Category) {
    if (!canEditCategories) return;
    setAssigningCategory(category);
    setProductPickerMode("UNCATEGORIZED");
    setProductSearch("");
    setSuccessMessage("");
  }

  function closeProductPicker() {
    if (assignProductsMutation.isPending) return;
    setAssigningCategory(null);
    setProductSearch("");
    setSelectedProductIds(new Set());
    setAssignedProductIdsThisSession(new Set());
    setRemovedProductIdsThisSession(new Set());
    setPendingMoveProducts([]);
    setPendingRemoveProducts([]);
    setPendingRemoveCategory(null);
    setSuccessMessage("");
    setSuccessHint("");
  }

  function toggleProductSelection(productId: string) {
    setSuccessMessage("");
    setSelectedProductIds((current) => {
      const next = new Set(current);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  function toggleVisibleProductSelection() {
    setSuccessMessage("");
    setSelectedProductIds((current) => {
      const next = new Set(current);
      if (allVisibleAssignableSelected) visibleAssignableProductIds.forEach((id) => next.delete(id));
      else visibleAssignableProductIds.forEach((id) => next.add(id));
      return next;
    });
  }

  function requestAssignProducts(productIds: string[]) {
    if (!assigningCategory || productIds.length === 0) return;
    setSuccessMessage("");
    const uniqueIds = Array.from(new Set(productIds));
    const selectedProducts = (products.data ?? []).filter((product) => uniqueIds.includes(product.id));
    const movingProducts = selectedProducts.filter((product) => product.category?.name && product.category.name !== assigningCategory.name);
    if (movingProducts.length > 0) {
      setPendingMoveProducts(movingProducts);
      return;
    }
    assignProductsMutation.mutate({ productIds: uniqueIds, categoryName: assigningCategory.name });
  }

  function confirmMoveProducts() {
    if (!assigningCategory || pendingMoveProducts.length === 0) return;
    setSuccessMessage("");
    const productIds = Array.from(new Set([...Array.from(selectedProductIds), ...pendingMoveProducts.map((product) => product.id)]));
    assignProductsMutation.mutate({ productIds, categoryName: assigningCategory.name });
  }

  function requestRemoveProducts(category: Category, products: RemovableCategoryProduct[]) {
    if (!canEditCategories || products.length === 0) return;
    setSuccessMessage("");
    setPendingRemoveCategory(category);
    setPendingRemoveProducts(products);
  }

  function confirmRemoveProducts() {
    if (!pendingRemoveCategory || pendingRemoveProducts.length === 0) return;
    setSuccessMessage("");
    const productIds = Array.from(new Set(pendingRemoveProducts.map((product) => product.id)));
    assignProductsMutation.mutate({ productIds, categoryName: null, sourceCategoryName: pendingRemoveCategory.name });
  }

  const errorMessage = saveMutation.error?.message ?? deleteMutation.error?.message ?? assignProductsMutation.error?.message;

  if (!canViewCategories) {
    return (
      <Card className="overflow-hidden p-0">
        <div className="border-b border-stone-200 bg-stone-50 px-5 py-4">
          <div className="flex items-center gap-2 text-sm font-black text-stone-600">
            <LockKeyhole size={16} />
            สิทธิ์การเข้าถึง
          </div>
        </div>
        <div className="flex flex-col items-start gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-md bg-stone-100 text-stone-500 ring-1 ring-stone-200">
              <Tags size={24} />
            </span>
            <div>
              <h1 className="text-2xl font-black text-ink">ไม่มีสิทธิ์ดูหมวดหมู่</h1>
              <p className="mt-2 max-w-xl text-sm font-semibold leading-6 text-stone-500">บัญชีนี้ไม่มีสิทธิ์ดูสินค้า จึงไม่สามารถเปิดรายการหมวดหมู่ได้</p>
            </div>
          </div>
          <Link to="/app/dashboard">
            <Button variant="secondary">กลับ Dashboard</Button>
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 bg-stone-50 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-leaf text-white shadow-sm">
              <Tags size={22} />
            </span>
            <div className="min-w-0">
              <h1 className="text-2xl font-black text-ink">หมวดหมู่สินค้า</h1>
              <p className="mt-0.5 text-sm font-semibold text-stone-500">จัดกลุ่มสินค้าเพื่อค้นหาและแยกประเภทในร้าน</p>
            </div>
          </div>
          {canEditCategories ? <Button icon={<Plus size={16} />} onClick={startCreate}>เพิ่มหมวดหมู่</Button> : (
            <span className="inline-flex items-center gap-2 rounded-md border border-stone-200 bg-white px-3 py-2 text-sm font-bold text-stone-600">
              <LockKeyhole size={15} />
              อ่านอย่างเดียว
            </span>
          )}
        </div>
        <div className="grid gap-px bg-stone-200 md:grid-cols-3">
          <div className="bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-stone-500">หมวดหมู่ทั้งหมด</p>
              <span className="grid h-9 w-9 place-items-center rounded-md bg-blue-50 text-blue-700"><Tags size={17} /></span>
            </div>
            <p className="mt-3 text-3xl font-black text-ink">{number(totals.categories)}</p>
          </div>
          <div className="bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-stone-500">สินค้าที่จัดหมวด</p>
              <span className="grid h-9 w-9 place-items-center rounded-md bg-teal-50 text-teal-700"><Package size={17} /></span>
            </div>
            <p className="mt-3 text-3xl font-black text-ink">{number(totals.assignedProducts)}</p>
          </div>
          <div className="bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-stone-500">หมวดที่ยังว่าง</p>
              <span className="grid h-9 w-9 place-items-center rounded-md bg-amber-50 text-amber-700"><Palette size={17} /></span>
            </div>
            <p className="mt-3 text-3xl font-black text-ink">{number(totals.unusedCategories)}</p>
          </div>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
            <input className="field field-with-left-icon" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหาหมวดหมู่" />
          </div>
          <Dropdown
            className="w-full sm:w-56"
            options={sortOptions}
            value={sortBy}
            onValueChange={(value) => setSortBy(value as CategorySort)}
            placeholder="เรียงลำดับ"
          />
          <Link to="/app/products"><Button className="w-full sm:w-auto" variant="secondary" icon={<Package size={16} />}>ดูสินค้า</Button></Link>
        </div>
      </Card>

      <div className="table-shell shadow-sm">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-stone-50 text-xs uppercase text-stone-500">
            <tr>
              <th className="p-3">หมวดหมู่</th>
              <th className="p-3">สินค้าในหมวด</th>
              <th className="p-3">สถานะ</th>
              <th className="p-3 text-right">{canEditCategories ? "จัดการ" : "สิทธิ์"}</th>
            </tr>
          </thead>
          <tbody>
            {filteredCategories.map((category) => {
              const count = productCount(category);
              const isEditing = editingId === category.id;
              const previewProducts = category.products ?? [];
              const isProductPreviewOpen = openCategoryId === category.id;
              return (
                <Fragment key={category.id}>
                <tr className={`border-t border-stone-100 transition hover:bg-stone-50 ${isEditing ? "bg-teal-50/60" : ""}`}>
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      <span className={`grid h-11 w-11 place-items-center rounded-md text-white shadow-sm ${isEditing ? "ring-2 ring-teal-200" : ""}`} style={{ backgroundColor: category.color || "#2563eb" }}><Tags size={18} /></span>
                      <div>
                        <p className="font-black text-ink">{category.name}</p>
                        <p className="mt-0.5 font-mono text-xs font-semibold text-stone-500">{category.color || "#2563eb"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="w-full max-w-[360px]">
                      <button
                        type="button"
                        className="inline-flex h-9 min-w-32 items-center justify-between gap-2 rounded-md border border-stone-300 bg-white px-3 text-sm font-bold text-ink shadow-sm transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={count === 0}
                        aria-expanded={isProductPreviewOpen}
                        onClick={() => setOpenCategoryId((current) => current === category.id ? null : category.id)}
                      >
                        <span>{number(count)} รายการ</span>
                        <ChevronDown size={16} className={`text-stone-500 transition ${isProductPreviewOpen ? "rotate-180" : ""}`} />
                      </button>
                      {count === 0 ? <p className="mt-1 text-xs font-semibold text-stone-400">ยังไม่มีสินค้าในหมวดนี้</p> : null}
                    </div>
                  </td>
                  <td className="p-3">
                    <span className={`inline-flex rounded px-2.5 py-1 text-xs font-bold ${count > 0 ? "bg-teal-50 text-teal-700 ring-1 ring-teal-100" : "bg-stone-100 text-stone-600 ring-1 ring-stone-200"}`}>
                      {count > 0 ? "ใช้งานอยู่" : "ยังไม่มีสินค้า"}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex justify-end gap-2">
                      {canEditCategories ? (
                        <>
                          <Button type="button" variant="secondary" icon={<Plus size={15} />} onClick={() => openProductPicker(category)}>เพิ่มสินค้า</Button>
                          <Button type="button" variant="secondary" icon={<Edit3 size={15} />} onClick={() => startEdit(category)}>แก้ไข</Button>
                          <Button type="button" variant="danger" icon={<Trash2 size={15} />} disabled={count > 0 || deleteMutation.isPending} onClick={() => remove(category)}>ลบ</Button>
                        </>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded bg-stone-100 px-2.5 py-1 text-xs font-bold text-stone-600 ring-1 ring-stone-200">
                          <LockKeyhole size={13} />
                          อ่านอย่างเดียว
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
                {isProductPreviewOpen ? (
                  <tr className="border-t border-stone-100 bg-white">
                    <td className="p-0" colSpan={4}>
                      <div className="mx-3 mb-3 overflow-hidden rounded-md border border-stone-300 bg-white shadow-sm">
                        <div className="border-b border-stone-300 bg-stone-50 px-4 py-3 text-center font-black text-ink">
                          {category.name} • {number(count)} รายการ
                        </div>
                        <div
                          className="max-h-64 overflow-y-auto overscroll-contain"
                          onWheel={(event) => event.stopPropagation()}
                          onTouchMove={(event) => event.stopPropagation()}
                        >
                          {previewProducts.map((product, index) => {
                            const stock = productStockOf(product);
                            return (
                              <div key={product.id} className="grid grid-cols-[44px_minmax(0,1fr)_auto_auto] items-center border-b border-stone-200 last:border-b-0">
                                <div className="border-r border-stone-200 px-3 py-2 text-center font-bold text-stone-600">{index + 1}</div>
                                <div className="flex min-w-0 items-center gap-3 px-3 py-2">
                                  <ProductPreviewImage product={product} />
                                  <div className="min-w-0">
                                    <p className="truncate font-black text-ink">{product.name}</p>
                                    <p className="truncate text-xs font-semibold text-stone-500">{product.sku}</p>
                                  </div>
                                </div>
                                <p className="px-4 py-2 text-right text-sm font-bold text-stone-700">
                                  คงเหลือ {number(stock)} {product.unit ?? "ชิ้น"}
                                </p>
                                {canEditCategories ? (
                                  <div className="px-3 py-2">
                                    <Button
                                      type="button"
                                      className="h-8 px-2.5"
                                      variant="danger"
                                      disabled={assignProductsMutation.isPending}
                                      onClick={() => requestRemoveProducts(category, [{ ...product, category: { name: category.name } }])}
                                    >
                                      นำออก
                                    </Button>
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                        {previewProducts.length < count ? (
                          <p className="border-t border-stone-200 bg-stone-50 px-4 py-2 text-center text-xs font-semibold text-stone-500">
                            แสดง {number(previewProducts.length)} จาก {number(count)} รายการ
                          </p>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ) : null}
                </Fragment>
              );
            })}
            {!categories.isLoading && filteredCategories.length === 0 ? (
              <tr><td className="p-8 text-center text-stone-500" colSpan={4}>ยังไม่มีหมวดหมู่ที่ตรงกับการค้นหา</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {assigningCategory ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4" role="dialog" aria-modal="true" aria-labelledby="category-product-picker-title" onMouseDown={closeProductPicker}>
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-200 bg-stone-50 p-5">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase text-teal-700">เพิ่มสินค้าในหมวด</p>
                <h2 id="category-product-picker-title" className="mt-1 text-2xl font-black text-ink">{assigningCategory.name}</h2>
              </div>
              <button
                type="button"
                className="grid h-9 w-9 place-items-center rounded-md text-stone-500 hover:bg-stone-100"
                aria-label="ปิดหน้าต่างเพิ่มสินค้าในหมวด"
                disabled={assignProductsMutation.isPending}
                onClick={closeProductPicker}
              >
                <X size={18} />
              </button>
            </div>

            <div className="border-b border-stone-200 p-4">
              <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_auto_auto]">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
                  <input
                    className="field field-with-left-icon h-10"
                    value={productSearch}
                    onChange={(event) => setProductSearch(event.target.value)}
                    placeholder="ค้นหาชื่อสินค้า SKU บาร์โค้ด หรือแบรนด์"
                    autoFocus
                  />
                </label>
                <div className="rounded-md border border-stone-200 bg-stone-50 p-0.5">
                  <div className="flex gap-1">
                    <ProductPickerModeButton selected={productPickerMode === "UNCATEGORIZED"} onClick={() => setProductPickerMode("UNCATEGORIZED")}>
                      ยังไม่จัดหมวด
                    </ProductPickerModeButton>
                    <ProductPickerModeButton selected={productPickerMode === "ALL"} onClick={() => setProductPickerMode("ALL")}>
                      สินค้าทั้งหมด
                    </ProductPickerModeButton>
                  </div>
                </div>
                <Button
                  type="button"
                  className="h-10 px-3"
                  variant="secondary"
                  disabled={visibleAssignableProductIds.length === 0}
                  onClick={toggleVisibleProductSelection}
                >
                  {allVisibleAssignableSelected ? "ยกเลิกทั้งหมด" : "เลือกทั้งหมด"}
                </Button>
              </div>
            </div>

            {assignProductsMutation.isPending ? (
              <div className="border-b border-amber-100 bg-amber-50 px-5 py-3">
                <div className="flex items-center gap-2 text-sm font-black text-amber-800">
                  <Plus size={18} />
                  {assignProductsMutation.variables?.categoryName === null ? "กำลังนำสินค้าออกจากหมวด..." : "กำลังเพิ่มสินค้าเข้าหมวด..."}
                </div>
              </div>
            ) : null}

            {assignProductsMutation.error ? (
              <p className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700">{assignProductsMutation.error.message}</p>
            ) : null}

            <div className="min-h-0 flex-1 overflow-y-auto">
              {products.isLoading ? <p className="p-6 text-center font-semibold text-stone-500">กำลังโหลดสินค้า...</p> : null}
              {products.error ? <p className="p-6 text-center font-semibold text-red-700">โหลดสินค้าไม่สำเร็จ: {products.error.message}</p> : null}
              {!products.isLoading && !products.error && productPickerRows.length === 0 ? (
                <div className="p-8 text-center">
                  <Package className="mx-auto text-stone-400" size={36} />
                  <p className="mt-3 font-black text-ink">ไม่พบสินค้า</p>
                  <p className="mt-1 text-sm font-semibold text-stone-500">ลองเปลี่ยนคำค้นหาหรือเปิดดูสินค้าทั้งหมด</p>
                </div>
              ) : null}
              {productPickerRows.length > 0 ? (
                <div className="divide-y divide-stone-100">
                  {productPickerRows.map((product) => {
                    const isLocallyAssigned = assignedProductIdsThisSession.has(product.id);
                    const isLocallyRemoved = removedProductIdsThisSession.has(product.id);
                    const isInTargetCategory = (product.category?.name === assigningCategory.name || isLocallyAssigned) && !isLocallyRemoved;
                    const isSelected = selectedProductIds.has(product.id);
                    return (
                      <div key={product.id} className={`grid gap-3 p-4 sm:grid-cols-[auto_1fr_auto] sm:items-center ${isInTargetCategory ? "bg-stone-50" : "bg-white"}`}>
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-stone-300 text-leaf disabled:opacity-40"
                            aria-label={`เลือก ${getProductDisplayName(product)}`}
                            checked={isSelected}
                            disabled={isInTargetCategory || assignProductsMutation.isPending}
                            onChange={() => toggleProductSelection(product.id)}
                          />
                          <ProductPickerImage product={product} />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-black text-ink">{getProductDisplayName(product)}</p>
                          <p className="mt-0.5 truncate text-xs font-semibold text-stone-500">SKU {product.sku}{product.barcode ? ` / ${product.barcode}` : ""}</p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <ProductCategoryBadge product={product} targetCategoryName={assigningCategory.name} isLocallyAssigned={isLocallyAssigned} isLocallyRemoved={isLocallyRemoved} />
                            {product.brand?.name ? <span className="rounded bg-stone-100 px-2 py-1 text-xs font-bold text-stone-600">{product.brand.name}</span> : null}
                            <span className="rounded bg-stone-100 px-2 py-1 text-xs font-bold text-stone-600">คงเหลือ {number(productStockOf(product))} {product.unit}</span>
                          </div>
                        </div>
                        <div className="flex justify-end">
                          <Button
                            type="button"
                            className="h-9 px-3"
                            variant={isInTargetCategory ? "danger" : "secondary"}
                            disabled={assignProductsMutation.isPending}
                            onClick={() => isInTargetCategory ? requestRemoveProducts(assigningCategory, [product]) : requestAssignProducts([product.id])}
                          >
                            {isInTargetCategory ? "นำออก" : "เพิ่ม"}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 bg-white p-4">
              <p className="text-sm font-bold text-stone-600">เลือก {number(selectedProductIds.size)} รายการ</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="ghost" disabled={selectedProductIds.size === 0 || assignProductsMutation.isPending} onClick={() => setSelectedProductIds(new Set())}>ล้างที่เลือก</Button>
                <Button type="button" icon={<Plus size={16} />} disabled={selectedProductIds.size === 0 || assignProductsMutation.isPending} onClick={() => requestAssignProducts(Array.from(selectedProductIds))}>
                  {assignProductsMutation.isPending ? "กำลังเพิ่ม..." : "เพิ่มเข้าหมวดนี้"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isFormOpen && canEditCategories ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4" role="dialog" aria-modal="true" aria-labelledby="category-form-title" onMouseDown={() => !saveMutation.isPending && resetForm()}>
          <div className="w-full max-w-lg overflow-hidden rounded-lg bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b border-stone-200 bg-stone-50 p-5">
              <div>
                <p className="text-xs font-black uppercase text-teal-700">{editingId ? "แก้ไขหมวดหมู่" : "เพิ่มหมวดหมู่"}</p>
                <h2 id="category-form-title" className="mt-1 text-2xl font-black text-ink">{editingId ? form.name || "แก้ไขหมวดหมู่" : "หมวดหมู่ใหม่"}</h2>
              </div>
              <button
                type="button"
                className="grid h-9 w-9 place-items-center rounded-md text-stone-500 hover:bg-stone-100"
                aria-label="ปิดหน้าต่างหมวดหมู่"
                disabled={saveMutation.isPending}
                onClick={resetForm}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={submit}>
              <div className="space-y-4 p-5">
                <label className="block">
                  <span className="text-sm font-bold text-stone-700">ชื่อหมวดหมู่</span>
                  <input className="field mt-1" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="เช่น เครื่องดื่ม" required autoFocus />
                </label>
                <label className="block">
                  <span className="text-sm font-bold text-stone-700">สี</span>
                  <div className="mt-1 flex h-11 items-center gap-2 rounded-md border border-stone-300 bg-white px-3 shadow-sm">
                    <Palette size={16} className="text-stone-500" />
                    <input className="h-8 w-12 cursor-pointer rounded border border-stone-200 bg-white" type="color" value={form.color} onChange={(event) => setForm((current) => ({ ...current, color: event.target.value }))} aria-label="เลือกสีหมวดหมู่" />
                    <span className="font-mono text-sm font-semibold text-stone-600">{form.color}</span>
                  </div>
                </label>
                <div className="flex flex-wrap gap-2">
                  {colorOptions.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`h-8 w-8 rounded-md border shadow-sm transition hover:scale-105 ${form.color.toLowerCase() === color.toLowerCase() ? "border-ink ring-2 ring-stone-300" : "border-stone-200"}`}
                      style={{ backgroundColor: color }}
                      aria-label={`เลือกสี ${color}`}
                      onClick={() => setForm((current) => ({ ...current, color }))}
                    />
                  ))}
                </div>
                {errorMessage ? <p className="rounded-md bg-red-50 p-3 text-sm font-semibold text-red-700">{errorMessage}</p> : null}
              </div>
              <div className="flex flex-wrap justify-end gap-2 border-t border-stone-200 bg-stone-50 p-4">
                <Button type="button" variant="ghost" disabled={saveMutation.isPending} onClick={resetForm}>ยกเลิก</Button>
                <Button type="submit" disabled={saveMutation.isPending}>{saveMutation.isPending ? "กำลังบันทึก..." : editingId ? "บันทึก" : "สร้าง"}</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {assigningCategory && pendingMoveProducts.length > 0 ? (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-ink/60 p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-move-products-title">
          <div className="w-full max-w-lg overflow-hidden rounded-lg bg-white shadow-2xl">
            <div className="border-b border-stone-200 p-5">
              <h2 id="confirm-move-products-title" className="text-xl font-black text-ink">ย้ายสินค้ามาหมวดนี้ไหม?</h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-stone-600">
                มีสินค้า {number(pendingMoveProducts.length)} รายการที่อยู่ในหมวดอื่นอยู่แล้ว ถ้าตกลง ระบบจะเปลี่ยนมาอยู่ใน "{assigningCategory.name}"
              </p>
            </div>
            <div className="max-h-72 overflow-y-auto p-4">
              <div className="space-y-2">
                {pendingMoveProducts.map((product) => (
                  <div key={product.id} className="rounded-md border border-stone-200 bg-stone-50 p-3">
                    <p className="font-black text-ink">{getProductDisplayName(product)}</p>
                    <p className="mt-1 text-xs font-semibold text-stone-500">จากหมวด {product.category?.name ?? "ไม่จัดหมวด"}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-stone-200 p-4">
              <Button type="button" variant="ghost" disabled={assignProductsMutation.isPending} onClick={() => setPendingMoveProducts([])}>ยกเลิก</Button>
              <Button type="button" disabled={assignProductsMutation.isPending} onClick={confirmMoveProducts}>
                {assignProductsMutation.isPending ? "กำลังย้าย..." : "ย้ายเข้าหมวดนี้"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingRemoveCategory && pendingRemoveProducts.length > 0 ? (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-ink/60 p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-remove-products-title">
          <div className="w-full max-w-lg overflow-hidden rounded-lg bg-white shadow-2xl">
            <div className="border-b border-stone-200 p-5">
              <h2 id="confirm-remove-products-title" className="text-xl font-black text-ink">นำสินค้าออกจากหมวดไหม?</h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-stone-600">
                ต้องการนำสินค้า {number(pendingRemoveProducts.length)} รายการออกจาก "{pendingRemoveCategory.name}" ใช่ไหม? สินค้าจะกลับไปอยู่ในกลุ่มยังไม่จัดหมวด
              </p>
            </div>
            <div className="max-h-72 overflow-y-auto p-4">
              <div className="space-y-2">
                {pendingRemoveProducts.map((product) => (
                  <div key={product.id} className="rounded-md border border-stone-200 bg-stone-50 p-3">
                    <p className="font-black text-ink">{getProductDisplayName(product)}</p>
                    <p className="mt-1 text-xs font-semibold text-stone-500">SKU {product.sku}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-stone-200 p-4">
              <Button type="button" variant="ghost" disabled={assignProductsMutation.isPending} onClick={() => { setPendingRemoveProducts([]); setPendingRemoveCategory(null); }}>ยกเลิก</Button>
              <Button type="button" variant="danger" disabled={assignProductsMutation.isPending} onClick={confirmRemoveProducts}>
                {assignProductsMutation.isPending ? "กำลังนำออก..." : "นำออกจากหมวด"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {successMessage ? (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-ink/60 p-4" role="dialog" aria-modal="true" aria-labelledby="assign-products-success-title">
          <div className="w-full max-w-md overflow-hidden rounded-lg bg-white shadow-2xl">
            <div className="p-6 text-center">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-teal-50 text-leaf ring-1 ring-teal-100">
                <CheckCircle2 size={30} />
              </span>
              <h2 id="assign-products-success-title" className="mt-4 text-xl font-black text-ink">{successTitle}</h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-stone-600">{successMessage}</p>
              {successHint ? <p className="mt-2 text-xs font-semibold text-stone-500">{successHint}</p> : null}
            </div>
            <div className="flex justify-center border-t border-stone-200 bg-stone-50 px-6 py-5">
              <Button type="button" className="min-w-32" onClick={() => setSuccessMessage("")}>OK</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ProductPickerModeButton({ selected, children, onClick }: { selected: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={`h-9 rounded-md px-3 text-xs font-bold transition ${selected ? "bg-white text-leaf shadow-sm ring-1 ring-stone-200" : "text-stone-600 hover:bg-white hover:text-ink"}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function ProductPickerImage({ product }: { product: ProductPickerProduct }) {
  const imageUrl = getProductImageUrl(product);
  if (imageUrl) return <img src={imageUrl} alt={product.name} className="h-12 w-12 shrink-0 rounded-md border border-stone-200 object-cover" />;
  return (
    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-md border border-dashed border-stone-300 bg-stone-50 text-stone-400">
      <ImageIcon size={20} />
    </span>
  );
}

function ProductCategoryBadge({ product, targetCategoryName, isLocallyAssigned = false, isLocallyRemoved = false }: { product: ProductPickerProduct; targetCategoryName: string; isLocallyAssigned?: boolean; isLocallyRemoved?: boolean }) {
  if (isLocallyRemoved) {
    return <span className="rounded bg-stone-100 px-2 py-1 text-xs font-bold text-stone-600 ring-1 ring-stone-200">ไม่จัดหมวด</span>;
  }
  if (product.category?.name === targetCategoryName || isLocallyAssigned) {
    return <span className="rounded bg-teal-50 px-2 py-1 text-xs font-bold text-teal-700 ring-1 ring-teal-100">อยู่ในหมวดนี้แล้ว</span>;
  }
  if (product.category?.name) {
    return <span className="rounded bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700 ring-1 ring-amber-100">อยู่ในหมวด: {product.category.name}</span>;
  }
  return <span className="rounded bg-stone-100 px-2 py-1 text-xs font-bold text-stone-600 ring-1 ring-stone-200">ไม่จัดหมวด</span>;
}
