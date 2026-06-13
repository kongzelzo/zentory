import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { api, patch } from "../lib/api";

type Business = { name: string; province?: string; businessType?: string; subscription?: { plan: { name: string; productLimit: number; userLimit: number } } };

export function SettingsPage() {
  const queryClient = useQueryClient();
  const business = useQuery({ queryKey: ["business"], queryFn: () => api<Business>("/businesses/current") });
  const [message, setMessage] = useState("");
  const mutation = useMutation({
    mutationFn: (body: unknown) => patch("/businesses/current", body),
    onSuccess: () => {
      setMessage("บันทึกแล้ว");
      queryClient.invalidateQueries({ queryKey: ["business"] });
    },
    onError: (error) => setMessage(error.message)
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate(Object.fromEntries(new FormData(event.currentTarget)));
  }

  return (
    <Card className="max-w-3xl">
      <h1 className="text-3xl font-black">ตั้งค่าร้าน</h1>
      <p className="mt-2 text-stone-600">แพ็กเกจปัจจุบัน: {business.data?.subscription?.plan.name ?? "-"}</p>
      <form onSubmit={submit} className="mt-6 grid gap-4 md:grid-cols-2">
        <input className="field" name="name" placeholder="ชื่อร้าน" defaultValue={business.data?.name} required />
        <input className="field" name="province" placeholder="จังหวัด" defaultValue={business.data?.province} />
        <input className="field md:col-span-2" name="businessType" placeholder="ประเภทธุรกิจ" defaultValue={business.data?.businessType} />
        {message ? <p className="rounded-md bg-stone-100 p-3 text-sm md:col-span-2">{message}</p> : null}
        <Button className="md:col-span-2">บันทึก</Button>
      </form>
    </Card>
  );
}
