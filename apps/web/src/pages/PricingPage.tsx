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
    { name: "Free", code: "free", price: "฿0", features: ["สินค้า 30 รายการ", "ผู้ใช้ 1 คน", "รายงานพื้นฐาน", "สาขาเดียว"], cta: "เริ่มใช้ฟรี", variant: "secondary" as const },
    { name: "Pro", code: "pro", price: "฿590", features: ["สินค้า 1,000 รายการ", "ผู้ใช้ 5 คน", "สูงสุด 5 สาขา", "POS และ barcode", "รายงานยอดขาย"], cta: "เลือกแพ็กเกจ Pro", variant: "primary" as const }
  ];
  return (
    <main className="mx-auto max-w-6xl px-5 py-16">
      <h1 className="text-4xl font-black">แพ็กเกจ Zentory</h1>
      <p className="mt-3 text-stone-600">แพ็กเกจเป็นสิทธิ์ที่ติดกับบัญชี v1 เริ่มด้วย Free และ Pro เพื่อให้ทีมดูแล limit ได้ง่ายก่อนเชื่อม payment gateway</p>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {plans.map((plan) => (
          <Card key={plan.name} className={`flex flex-col ${plan.name === "Pro" ? "border-leaf" : ""}`}>
            <div>
              <h2 className="text-2xl font-black">{plan.name}</h2>
              <p className="mt-2 text-4xl font-black">{plan.price}<span className="text-base font-semibold text-stone-500">/เดือน</span></p>
              <ul className="mt-5 space-y-2 text-stone-700">
                {plan.features.map((feature) => <li key={feature}>• {feature}</li>)}
              </ul>
            </div>
            <Link to={plan.code === "free" ? "/register" : `/checkout?plan=${plan.code}`} className="mt-6 block">
              <Button variant={plan.variant} className="w-full">{plan.cta}</Button>
            </Link>
          </Card>
        ))}
      </div>
    </main>
  );
}
