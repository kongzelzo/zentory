import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Edit3, ImageIcon, LockKeyhole, Package, Palette, Plus, Search, Tags, Trash2, X } from "lucide-react";
import { Fragment, FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Dropdown } from "../components/Dropdown";
import { api, patch, post } from "../lib/api";
import { branchScopedPath } from "../lib/branch-scope";
import { number } from "../lib/format";
import { hasSessionPermission } from "../lib/permissions";
import { getProductImageUrl, stockOf as productStockOf } from "../lib/products";
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
  const session = useAuth((state) => state.session);
  const workingBranchId = useWorkingBranch((state) => state.workingBranchId);
  const canViewCategories = hasSessionPermission(session, "products.read");
  const canEditCategories = hasSessionPermission(session, "products.update");
  const categories = useQuery({
    queryKey: ["categories", workingBranchId],
    queryFn: () => api<Category[]>(branchScopedPath("/categories", workingBranchId)),
    enabled: canViewCategories
  });

  useEffect(() => {
    setOpenCategoryId(null);
  }, [search, sortBy]);

  useEffect(() => {
    if (!canEditCategories) resetForm();
  }, [canEditCategories]);

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

  const saveMutation = useMutation({
    mutationFn: (payload: CategoryForm) => editingId ? patch<Category>(`/categories/${editingId}`, payload) : post<Category>("/categories", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      resetForm();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api<Category>(`/categories/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
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

  const errorMessage = saveMutation.error?.message ?? deleteMutation.error?.message;

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

      {isFormOpen && canEditCategories ? (
        <Card className="border-teal-200 bg-teal-50/40">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-black text-ink">{editingId ? `แก้ไขหมวดหมู่: ${form.name || "ไม่มีชื่อ"}` : "เพิ่มหมวดหมู่ใหม่"}</h2>
              <p className="text-sm font-semibold text-stone-500">{editingId ? "ข้อมูลที่แก้ไขจะมีผลกับสินค้าที่ใช้หมวดหมู่นี้" : "ตั้งชื่อและเลือกสีเพื่อใช้จัดกลุ่มสินค้า"}</p>
            </div>
          </div>
          <form className="grid gap-4 lg:grid-cols-[1fr_260px_auto]" onSubmit={submit}>
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
            <div className="flex items-end gap-2">
              <Button type="submit" disabled={saveMutation.isPending}>{editingId ? "บันทึก" : "สร้าง"}</Button>
              <Button type="button" variant="secondary" icon={<X size={16} />} onClick={resetForm}>ยกเลิก</Button>
            </div>
            <div className="flex flex-wrap gap-2 lg:col-span-3">
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
          </form>
          {errorMessage ? <p className="mt-4 rounded-md bg-red-50 p-3 text-sm font-semibold text-red-700">{errorMessage}</p> : null}
        </Card>
      ) : null}

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
                        <div className="max-h-64 overflow-y-auto">
                          {previewProducts.map((product, index) => {
                            const stock = productStockOf(product);
                            return (
                              <div key={product.id} className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center border-b border-stone-200 last:border-b-0">
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
    </div>
  );
}
