import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Boxes, PackagePlus, PackageX, Wallet } from "lucide-react";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { api } from "../lib/api";
import { baht, number, thaiDate } from "../lib/format";
import type { OnboardingStatusResponse } from "../lib/onboarding";
import { useAuth } from "../state/auth";

type Dashboard = {
  summary: {
    salesToday: number;
    salesThisMonth: number;
    stockValue: number;
    totalProducts: number;
    lowStockProducts: number;
    outOfStockProducts: number;
  };
  recentSales: Array<{ id: string; receiptNo: string; total: string; createdAt: string }>;
  recentMovements: Array<{ id: string; type: string; quantity: number; createdAt: string; product: { name: string } }>;
};

export function DashboardPage() {
  const session = useAuth((state) => state.session);
  const updateBusinessOnboarding = useAuth((state) => state.updateBusinessOnboarding);
  const { data, isLoading, error } = useQuery({ queryKey: ["dashboard"], queryFn: () => api<Dashboard>("/reports/dashboard") });
  const onboarding = useQuery({
    queryKey: ["onboarding-status"],
    queryFn: () => api<OnboardingStatusResponse>("/onboarding/status"),
    enabled: Boolean(session?.business)
  });

  useEffect(() => {
    if (onboarding.data) {
      updateBusinessOnboarding({ completed: onboarding.data.completed, progress: onboarding.data.steps });
    }
  }, [onboarding.data, updateBusinessOnboarding]);

  if (isLoading) return <p>กำลังโหลด Dashboard...</p>;
  if (error) return <p className="text-red-700">{error.message}</p>;
  if (!data) return null;

  const cards = [
    { label: "ยอดขายวันนี้", value: baht(data.summary.salesToday), icon: Wallet },
    { label: "มูลค่าสต็อก", value: baht(data.summary.stockValue), icon: Boxes },
    { label: "สินค้าใกล้หมด", value: number(data.summary.lowStockProducts), icon: AlertTriangle },
    { label: "สินค้าหมด", value: number(data.summary.outOfStockProducts), icon: PackageX }
  ];
  const chart = [
    { name: "วันนี้", value: data.summary.salesToday },
    { name: "เดือนนี้", value: data.summary.salesThisMonth },
    { name: "มูลค่าสต็อก", value: data.summary.stockValue }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black">Dashboard</h1>
          <p className="text-stone-600">ภาพรวมร้านวันนี้</p>
        </div>
        <Link to="/app/products/new">
          <Button icon={<PackagePlus size={18} />}>เพิ่มสินค้า</Button>
        </Link>
      </div>

      {onboarding.data && !onboarding.data.completed ? <OnboardingDashboardCard status={onboarding.data} /> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.label}>
            <card.icon className="text-leaf" />
            <p className="mt-4 text-sm font-semibold text-stone-500">{card.label}</p>
            <p className="text-3xl font-black">{card.value}</p>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <h2 className="mb-4 text-xl font-black">สรุปยอดหลัก</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart}>
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(value) => baht(Number(value))} />
                <Bar dataKey="value" fill="#0f766e" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <h2 className="text-xl font-black">รายการล่าสุด</h2>
          <div className="mt-4 space-y-3">
            {data.recentMovements.map((movement) => (
              <div key={movement.id} className="rounded-md border border-stone-200 p-3">
                <p className="font-semibold">{movement.product.name}</p>
                <p className="text-sm text-stone-500">{movement.type} • {number(movement.quantity)} • {thaiDate(movement.createdAt)}</p>
              </div>
            ))}
            {data.recentMovements.length === 0 ? <p className="text-sm text-stone-500">ยังไม่มีรายการเคลื่อนไหวสต็อก</p> : null}
          </div>
        </Card>
      </div>
    </div>
  );
}

function OnboardingDashboardCard({ status }: { status: OnboardingStatusResponse }) {
  return (
    <Card className="border-leaf/30 bg-teal-50/40 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-black text-ink">เริ่มต้นใช้งานร้านของคุณ</h2>
          <p className="mt-1 text-sm font-semibold text-stone-600">ทำไปแล้ว {status.completedSteps} จาก {status.totalSteps} ขั้นตอน</p>
          <div className="mt-3 h-2 max-w-md overflow-hidden rounded-full bg-white">
            <div className="h-full rounded-full bg-leaf transition-all" style={{ width: `${status.percent}%` }} />
          </div>
        </div>
        <Link to="/app/onboarding">
          <Button variant="secondary">ทำต่อ</Button>
        </Link>
      </div>
    </Card>
  );
}
