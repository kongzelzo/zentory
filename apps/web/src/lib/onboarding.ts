import type { AuthSession } from "@zentory/shared";

export type OnboardingProgress = {
  setupStore?: boolean;
  firstProduct?: boolean;
  stockIn?: boolean;
  firstSale?: boolean;
  firstReport?: boolean;
};

export type StepStatus = "completed" | "current" | "pending";

export type OnboardingStatusResponse = {
  completed: boolean;
  completedSteps: number;
  totalSteps: number;
  percent: number;
  steps: Required<OnboardingProgress>;
};

const orderedStepKeys = ["setupStore", "firstProduct", "stockIn", "firstSale", "firstReport"] as const;
const profileSetupKeyPrefix = "zentory.profile-setup.completed.";

export const onboardingStepDefinitions = [
  {
    key: "setupStore",
    title: "ตั้งค่าร้าน",
    description: "กรอกชื่อร้าน ประเภทธุรกิจ จังหวัด และข้อมูลพื้นฐาน",
    to: "/setup-store",
    action: "แก้ไขข้อมูลร้าน",
    completedAction: "แก้ไขข้อมูลร้าน"
  },
  {
    key: "firstProduct",
    title: "เพิ่มสินค้าตัวแรก",
    description: "เพิ่มสินค้า 1 รายการ ข้อมูลนี้จะอยู่ในระบบและจัดการต่อได้จากหน้าสินค้า",
    to: "/app/products/new",
    action: "เพิ่มสินค้า",
    completedAction: "ดูสินค้า"
  },
  {
    key: "stockIn",
    title: "รับสินค้าเข้าสต็อก",
    description: "บันทึกจำนวนสินค้าเข้าร้าน ระบบจะสร้างประวัติรับเข้าสต็อกจริง",
    to: "/app/inventory/receipts",
    action: "รับสินค้าเข้า",
    completedAction: "ดูรายการรับเข้า"
  },
  {
    key: "firstSale",
    title: "ขายสินค้าจริงรายการแรก",
    description: "ทำรายการขายด้วยสินค้าจริง ระบบจะตัดสต็อกและบันทึกประวัติขายจริง",
    to: "/app/pos",
    action: "ขายสินค้า",
    completedAction: "ดูประวัติขาย"
  },
  {
    key: "firstReport",
    title: "ดูรายงานแรก",
    description: "ตรวจยอดขาย สินค้าคงเหลือ และรายการที่ควรเติมสต็อก",
    to: "/app/reports/sales",
    action: "ดูรายงาน",
    completedAction: "ดูรายงาน"
  }
] as const;

export function getPostAuthPath(session: AuthSession) {
  if (session.membershipRequest?.status === "PENDING") return "/join-request/pending";
  if (session.membershipRequest?.status === "REJECTED") return "/join-request/rejected";
  if (!session.business && shouldShowProfileSetup(session)) return "/account-setup";
  if (!session.business) return "/join-or-create";
  return "/app/dashboard";
}

export function getProfileSetupCompletedKey(userId: string) {
  return `${profileSetupKeyPrefix}${userId}`;
}

export function hasCompletedProfileSetup(userId: string) {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(getProfileSetupCompletedKey(userId)) === "true";
}

export function markProfileSetupCompleted(userId: string) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(getProfileSetupCompletedKey(userId), "true");
}

export function shouldShowProfileSetup(session: AuthSession) {
  if (session.business || session.membershipRequest) return false;
  return !hasCompletedProfileSetup(session.user.id);
}

export function shouldShowOnboardingNav(session?: AuthSession) {
  return Boolean(session?.business && !session.business.onboardingCompleted);
}

export function buildOnboardingSteps(progress: OnboardingProgress) {
  const firstIncompleteIndex = orderedStepKeys.findIndex((key) => !progress[key]);
  return onboardingStepDefinitions.map((step, index) => {
    const done = Boolean(progress[step.key]);
    const status: StepStatus = done ? "completed" : index === firstIncompleteIndex ? "current" : "pending";
    return {
      ...step,
      status,
      done,
      actionLabel: done ? step.completedAction : step.action,
      disabledReason: !done && status === "pending" ? getPendingReason(step.key) : undefined
    };
  });
}

function getPendingReason(key: (typeof orderedStepKeys)[number]) {
  if (key === "stockIn") return "ต้องเพิ่มสินค้าก่อน";
  if (key === "firstSale") return "ต้องรับสินค้าเข้าสต็อกก่อน";
  if (key === "firstReport") return "ต้องทดลองขายก่อน";
  return undefined;
}
