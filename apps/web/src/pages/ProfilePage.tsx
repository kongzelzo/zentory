import { useAuth } from "../state/auth";
import { Card } from "../components/Card";
import { Button } from "../components/Button";

export function ProfilePage() {
  const session = useAuth((state) => state.session);
  return (
    <Card className="max-w-2xl">
      <h1 className="text-3xl font-black">โปรไฟล์ผู้ใช้</h1>
      <div className="mt-6 space-y-3">
        <p><b>ชื่อ:</b> {session?.user.name}</p>
        <p><b>อีเมล:</b> {session?.user.email}</p>
        <p><b>ร้าน:</b> {session?.business?.name}</p>
        <p><b>สิทธิ์:</b> {session?.business?.role}</p>
      </div>
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        <input className="field" placeholder="ชื่อใหม่" defaultValue={session?.user.name} />
        <input className="field" placeholder="เบอร์โทร" />
        <input className="field md:col-span-2" placeholder="ภาษา" defaultValue="ไทย" />
        <Button className="md:col-span-2">บันทึกโปรไฟล์</Button>
      </div>
    </Card>
  );
}
