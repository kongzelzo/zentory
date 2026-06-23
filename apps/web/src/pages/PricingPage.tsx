import type { ComponentProps } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { useAuth } from "../state/auth";

function Link({ to, ...props }: ComponentProps<typeof RouterLink>) {
  const session = useAuth((state) => state.session);
  const target = session && to === "/register" ? "/app/dashboard" : to;
  return <RouterLink to={target} {...props} />;
}

export function PricingPage() {
  const plans = [
    { name: "Starter", code: "starter", price: "฿399", yearly: "฿3,990/ปี", features: ["สินค้า 200 รายการ", "ผู้ใช้ 2 คน", "1 สาขา", "1 คลัง", "POS และ Stock Count"], cta: "เลือก Starter", variant: "secondary" as const },
    { name: "Professional", code: "professional", price: "฿899", yearly: "฿8,990/ปี", features: ["สินค้า 1,500 รายการ", "ผู้ใช้ 6 คน", "1 สาขา", "2 คลัง", "รายงานเต็มและ approval"], cta: "เลือก Professional", variant: "primary" as const },
    { name: "Multi-Branch", code: "multi_branch", price: "฿1,790", yearly: "฿17,900/ปี", features: ["สินค้า 3,000 รายการ", "ผู้ใช้ 12 คน", "เริ่มต้น 2 สาขา", "4 คลัง", "โอนสินค้าและรายงานแยกสาขา"], cta: "เลือก Multi-Branch", variant: "secondary" as const }
  ];
  return (
    <main className="mx-auto max-w-6xl px-5 py-16">
      <h1 className="text-4xl font-black">แพ็กเกจ Zentory</h1>
      <p className="mt-3 text-stone-600">เลือกแพ็กเกจตามขนาดร้านของคุณ: เริ่มต้น ร้านเดียวจริงจัง หรือหลายสาขา ทุกแพ็กเกจเป็นบัญชีแบบชำระเงินสำหรับใช้งานจริง</p>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {plans.map((plan) => (
          <Card key={plan.name} className={`flex flex-col ${plan.name === "Professional" ? "border-leaf" : ""}`}>
            <div>
              <h2 className="text-2xl font-black">{plan.name}</h2>
              <p className="mt-2 text-4xl font-black">{plan.price}<span className="text-base font-semibold text-stone-500">/เดือน</span></p>
              <p className="mt-1 text-sm font-semibold text-stone-500">หรือ {plan.yearly}</p>
              <ul className="mt-5 space-y-2 text-stone-700">
                {plan.features.map((feature) => <li key={feature}>• {feature}</li>)}
              </ul>
            </div>
            <Link to={`/checkout?plan=${plan.code}`} className="mt-6 block">
              <Button variant={plan.variant} className="w-full">{plan.cta}</Button>
            </Link>
          </Card>
        ))}
      </div>
    </main>
  );
}
