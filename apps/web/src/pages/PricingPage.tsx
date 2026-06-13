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
    { name: "Free", price: "฿0", features: ["สินค้า 30 รายการ", "ผู้ใช้ 1 คน", "รายงานพื้นฐาน", "สาขาเดียว"] },
    { name: "Pro", price: "฿590", features: ["สินค้า 1,000 รายการ", "ผู้ใช้ 5 คน", "POS และ barcode", "รายงานยอดขาย"] }
  ];
  return (
    <main className="mx-auto max-w-6xl px-5 py-16">
      <h1 className="text-4xl font-black">แพ็กเกจ Zentory</h1>
      <p className="mt-3 text-stone-600">v1 เริ่มด้วย Free และ Pro เพื่อให้ทีมดูแล limit ได้ง่ายก่อนเชื่อม payment gateway</p>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {plans.map((plan) => (
          <Card key={plan.name} className={plan.name === "Pro" ? "border-leaf" : ""}>
            <h2 className="text-2xl font-black">{plan.name}</h2>
            <p className="mt-2 text-4xl font-black">{plan.price}<span className="text-base font-semibold text-stone-500">/เดือน</span></p>
            <ul className="mt-5 space-y-2 text-stone-700">
              {plan.features.map((feature) => <li key={feature}>• {feature}</li>)}
            </ul>
            <Link to="/register"><Button className="mt-6 w-full">สมัครใช้งาน</Button></Link>
          </Card>
        ))}
      </div>
    </main>
  );
}
