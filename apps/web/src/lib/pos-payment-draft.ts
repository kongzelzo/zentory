export const posPaymentDraftKey = "zentory.pos.payment-draft.v1";

export type PosPaymentDraftItem = {
  productId: string;
  name: string;
  sku: string;
  imagePath?: string | null;
  salePrice: string;
  quantity: number;
};

export type PosPaymentDraft = {
  branchId: string;
  warehouseId: string;
  discount: number;
  paymentMethod: "CASH" | "TRANSFER";
  paymentQrImage: string;
  items: PosPaymentDraftItem[];
};

export function savePosPaymentDraft(draft: PosPaymentDraft) {
  sessionStorage.setItem(posPaymentDraftKey, JSON.stringify(draft));
}

export function loadPosPaymentDraft() {
  const raw = sessionStorage.getItem(posPaymentDraftKey);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as PosPaymentDraft;
  } catch {
    sessionStorage.removeItem(posPaymentDraftKey);
    return undefined;
  }
}

export function clearPosPaymentDraft() {
  sessionStorage.removeItem(posPaymentDraftKey);
}
