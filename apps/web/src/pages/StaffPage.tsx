import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { api, post } from "../lib/api";

type Member = { id: string; role: string; status: string; user: { name: string; email: string } };

export function StaffPage() {
  const queryClient = useQueryClient();
  const members = useQuery({ queryKey: ["members"], queryFn: () => api<Member[]>("/members") });
  const [message, setMessage] = useState("");
  const mutation = useMutation({
    mutationFn: (body: unknown) => post("/members", body),
    onSuccess: () => {
      setMessage("เพิ่มพนักงานแล้ว");
      queryClient.invalidateQueries({ queryKey: ["members"] });
    },
    onError: (error) => setMessage(error.message)
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    mutation.mutate(Object.fromEntries(form));
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
      <Card>
        <h1 className="text-2xl font-black">เพิ่มพนักงาน</h1>
        <form onSubmit={submit} className="mt-5 space-y-3">
          <input className="field" name="name" placeholder="ชื่อ" required />
          <input className="field" name="email" placeholder="อีเมล" required />
          <input className="field" name="password" type="password" placeholder="รหัสผ่านเริ่มต้น" required />
          <select className="field" name="role" defaultValue="CASHIER">
            <option value="MANAGER">ผู้จัดการ</option>
            <option value="CASHIER">แคชเชียร์</option>
            <option value="STOCK_STAFF">พนักงานคลัง</option>
            <option value="VIEWER">ดูรายงาน</option>
          </select>
          {message ? <p className="rounded-md bg-stone-100 p-3 text-sm">{message}</p> : null}
          <Button className="w-full">เพิ่มพนักงาน</Button>
        </form>
      </Card>
      <Card>
        <h2 className="text-2xl font-black">พนักงานทั้งหมด</h2>
        <div className="mt-4 space-y-3">
          {members.data?.map((member) => (
            <div key={member.id} className="flex items-center justify-between rounded-md border border-stone-200 p-3">
              <div>
                <p className="font-bold">{member.user.name}</p>
                <p className="text-sm text-stone-500">{member.user.email}</p>
              </div>
              <p className="text-sm font-black">{member.role}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
