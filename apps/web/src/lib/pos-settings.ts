export type PosPaymentMethod = "CASH" | "TRANSFER";

export type BranchPosSettings = {
  defaultPaymentMethod: PosPaymentMethod;
  paymentQrImage: string;
};

const legacyQrKey = "zentory-pos-payment-qr";
const keyPrefix = "zentory.branch-pos-settings.v1";
const defaultSettings: BranchPosSettings = { defaultPaymentMethod: "CASH", paymentQrImage: "" };

function keyForBranch(branchId: string) {
  return `${keyPrefix}:${branchId || "default"}`;
}

export function loadBranchPosSettings(branchId: string): BranchPosSettings {
  const raw = localStorage.getItem(keyForBranch(branchId));
  if (!raw) {
    return { ...defaultSettings, paymentQrImage: localStorage.getItem(legacyQrKey) ?? "" };
  }
  try {
    return { ...defaultSettings, ...JSON.parse(raw) };
  } catch {
    return { ...defaultSettings };
  }
}

export function saveBranchPosSettings(branchId: string, settings: BranchPosSettings) {
  localStorage.setItem(keyForBranch(branchId), JSON.stringify(settings));
}
