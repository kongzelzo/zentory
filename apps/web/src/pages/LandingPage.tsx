import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  PackageCheck,
  QrCode,
  ReceiptText,
  ScanLine,
  ShieldCheck,
  Smartphone
} from "lucide-react";
import type { ComponentProps } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { useAuth } from "../state/auth";

const painPoints = [
  "ไม่รู้ว่าสินค้าเหลือกี่ชิ้น",
  "ของหมดแล้วเพิ่งรู้",
  "ใช้ Excel แล้วข้อมูลไม่ตรง",
  "พนักงานขายแล้วลืมตัดสต็อก",
  "ไม่รู้ว่าสินค้าไหนขายดี",
  "เช็กยอดขายย้อนหลังลำบาก"
];

const features: Array<[string, string[]]> = [
  ["จัดการสินค้า", ["เพิ่มสินค้า", "ใส่ SKU / Barcode", "แยกหมวดหมู่", "ตั้งราคาทุนและราคาขาย"]],
  ["รับสินค้าเข้า", ["บันทึกของเข้าคลัง", "ใส่จำนวนและต้นทุน", "ดูประวัติรับเข้า", "เตรียมข้อมูลซัพพลายเออร์"]],
  ["ขายหน้าร้าน / POS", ["ค้นหาหรือสแกนสินค้า", "คำนวณยอดขาย", "ตัดสต็อกอัตโนมัติ", "ดูประวัติใบขาย"]],
  ["ปรับสต็อก", ["ปรับเพิ่ม / ลด", "ใส่เหตุผล", "เก็บประวัติ", "ตรวจสอบย้อนหลังได้"]],
  ["รายงาน", ["ยอดขาย", "สินค้าคงเหลือ", "สินค้าใกล้หมด", "สินค้าขายดี"]],
  ["พนักงานและสิทธิ์", ["เพิ่มพนักงาน", "กำหนด role", "จำกัดข้อมูลสำคัญ", "ลดความเสี่ยงในร้าน"]]
];

const storeTypes = [
  "ร้านขายของชำ",
  "ร้านเครื่องสำอาง",
  "ร้านเสื้อผ้า",
  "ร้านอุปกรณ์มือถือ",
  "ร้านเครื่องเขียน",
  "ร้านอะไหล่",
  "ร้านขายส่งเล็ก ๆ",
  "ร้านค้าออนไลน์ที่มีสต็อกเอง",
  "ร้านที่มีพนักงานช่วยขาย",
  "ร้านที่เริ่มรู้สึกว่า Excel ไม่พอแล้ว"
];

const faqs: Array<[string, string]> = [
  ["ร้านแบบไหนใช้ Zentory ได้บ้าง?", "ร้านเล็กถึงกลางที่ต้องการจัดการสินค้า สต็อก และยอดขายในที่เดียว"],
  ["ต้องติดตั้งโปรแกรมไหม?", "ไม่ต้อง ใช้งานผ่านเว็บได้ทั้งมือถือ แท็บเล็ต และคอมพิวเตอร์"],
  ["ใช้มือถือได้ไหม?", "ได้ หน้าเว็บออกแบบให้รองรับมือถือ โดยเฉพาะงานขาย รับเข้า และดูแจ้งเตือน"],
  ["ข้อมูลร้านจะปนกับร้านอื่นไหม?", "ไม่ ข้อมูลแต่ละร้านถูกออกแบบให้แยกกันตามร้านค้า"],
  ["มีแพ็กเกจฟรีไหม?", "มี สำหรับทดลองใช้งานเบื้องต้นก่อนอัปเกรดเมื่อร้านพร้อม"],
  ["ถ้าเลิกใช้ ข้อมูลจะหายไหม?", "v1 จะเตรียมแนวทาง export และสำรองข้อมูล เพื่อให้ร้านไม่ถูกล็อกอยู่กับระบบ"],
  ["รองรับบาร์โค้ดไหม?", "เตรียมรองรับการค้นหาและสแกนบาร์โค้ดตามแพ็กเกจ โดยจะเขียนชัดเจนในหน้าราคา"],
  ["ใช้กับหลายสาขาได้ไหม?", "v1 โฟกัสหนึ่งร้านและหนึ่งสาขาหลักก่อน แต่โครงสร้างระบบเตรียมรองรับสาขาในระยะถัดไป"]
];

function Link({ to, ...props }: ComponentProps<typeof RouterLink>) {
  const session = useAuth((state) => state.session);
  const target = session && to === "/register" ? "/app/dashboard" : to;
  return <RouterLink to={target} {...props} />;
}

export function LandingPage() {
  return (
    <main className="overflow-hidden">
      <HeroSection />
      <PainPointSection />
      <SolutionSection />
      <DemoPreviewSection />
      <FeatureSection />
      <HowItWorksSection />
      <TargetCustomerSection />
      <BeforeAfterSection />
      <BarcodeSection />
      <ReportSection />
      <TrustSection />
      <PricingSection />
      <FaqSection />
      <FinalCtaSection />
      <FooterSection />
    </main>
  );
}

function HeroSection() {
  return (
    <section className="mx-auto grid max-w-7xl gap-10 px-5 py-16 lg:grid-cols-[0.9fr_1fr] lg:items-center">
      <div>
        <p className="mb-4 text-sm font-black uppercase tracking-[0.2em] text-leaf">Inventory SaaS for Thai Retail</p>
        <h1 className="max-w-3xl text-4xl font-black leading-tight text-ink md:text-6xl">
          จัดการสต็อกสินค้าให้ร้านคุณง่ายขึ้นในเว็บเดียว
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-stone-700">
          รู้ของเหลือ ขายอะไรไป และต้องเติมอะไรได้ทันที Zentory ช่วยให้เจ้าของร้านเห็นตัวเลขสำคัญของร้านโดยไม่ต้องไล่หาในสมุดหรือ Excel
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/register">
            <Button icon={<ArrowRight size={18} />}>เริ่มใช้งานฟรี</Button>
          </Link>
          <a href="#demo">
            <Button variant="secondary">ดูตัวอย่างระบบ</Button>
          </a>
        </div>
        <div className="mt-8 grid gap-3 text-sm text-stone-600 sm:grid-cols-3">
          {["ของเหลือกี่ชิ้น?", "วันนี้ขายไปเท่าไหร่?", "ต้องเติมสินค้าอะไร?"].map((item) => (
            <div key={item} className="flex items-center gap-2">
              <CheckCircle2 size={18} className="text-leaf" />
              {item}
            </div>
          ))}
        </div>
      </div>
      <DashboardMockup />
    </section>
  );
}

function DashboardMockup() {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-soft">
      <div className="rounded-md bg-ink p-5 text-white">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-stone-300">ยอดขายวันนี้</p>
            <p className="mt-1 text-4xl font-black">฿18,420</p>
          </div>
          <ScanLine className="text-amber-300" />
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {[
          ["สินค้าในคลัง", "1,284"],
          ["ใกล้หมด", "24"],
          ["หมดสต็อก", "7"]
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border border-stone-200 p-4">
            <p className="text-xs text-stone-500">{label}</p>
            <p className="text-2xl font-black">{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_0.85fr]">
        <div className="rounded-md border border-stone-200 p-4">
          <p className="mb-3 text-sm font-black">สินค้าที่ควรเติม</p>
          {["น้ำดื่ม 600ml", "ขนมถุงเล็ก", "ถ่าน AA"].map((item, index) => (
            <div key={item} className="flex justify-between border-t border-stone-100 py-2 text-sm">
              <span>{item}</span>
              <span className={index === 0 ? "font-black text-red-700" : "font-black text-amber-700"}>{index + 3} ชิ้น</span>
            </div>
          ))}
        </div>
        <div className="rounded-md border border-stone-200 p-4">
          <p className="mb-3 text-sm font-black">ยอดขาย 7 วัน</p>
          <div className="flex h-28 items-end gap-2">
            {[42, 58, 36, 76, 64, 88, 72].map((height, index) => (
              <div key={index} className="flex-1 rounded-t bg-leaf" style={{ height: `${height}%` }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PainPointSection() {
  return (
    <section className="bg-white py-14">
      <div className="mx-auto max-w-7xl px-5">
        <SectionHeading
          eyebrow="Pain Points"
          title="ร้านคุณกำลังเสียเวลาอยู่กับปัญหาเหล่านี้ไหม?"
          text="คัดเฉพาะปัญหาที่เจ้าของร้านเจอบ่อยที่สุด อ่านเร็ว และเห็นภาพทันที"
        />
        <div className="mt-8 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {painPoints.map((point) => (
            <div key={point} className="rounded-md border border-stone-200 bg-paper p-4 font-semibold">
              <AlertTriangle className="mb-3 text-amber-700" size={20} />
              {point}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SolutionSection() {
  const cards = [
    { icon: PackageCheck, title: "เช็กสต็อกได้ทันที", text: "ดูจำนวนสินค้าคงเหลือได้ชัดเจน แยกตามรายการสินค้า" },
    { icon: ReceiptText, title: "ขายแล้วตัดสต็อกอัตโนมัติ", text: "ขายหน้าร้าน / POS ช่วยบันทึกยอดขายและลดสต็อกในขั้นตอนเดียว" },
    { icon: BarChart3, title: "ดูรายงานเพื่อเติมของให้ทัน", text: "เห็นยอดขาย สินค้าใกล้หมด และรายการที่ควรสั่งเพิ่ม" }
  ];

  return (
    <section className="mx-auto max-w-7xl px-5 py-14">
      <SectionHeading
        eyebrow="Solution"
        title="Zentory ตอบ 3 คำถามหลักของร้านให้เร็วขึ้น"
        text="ของเหลือกี่ชิ้น วันนี้ขายเท่าไหร่ และต้องเติมสินค้าอะไร"
      />
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {cards.map(({ icon: Icon, title, text }) => (
          <Card key={title}>
            <Icon className="text-leaf" size={26} />
            <h3 className="mt-5 text-xl font-black">{title}</h3>
            <p className="mt-2 leading-7 text-stone-600">{text}</p>
          </Card>
        ))}
      </div>
    </section>
  );
}

function DemoPreviewSection() {
  return (
    <section id="demo" className="bg-ink py-16 text-white">
      <div className="mx-auto grid max-w-7xl gap-8 px-5 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
        <div>
          <SectionHeading
            eyebrow="Live Demo"
            title="เห็นหน้าระบบก่อนเริ่มใช้จริง"
            text="ตัวอย่างงานหน้าร้านที่ใช้บ่อย: ค้นหาสินค้า ใส่ตะกร้า รับชำระเงิน และเห็นของใกล้หมด"
            dark
          />
          <div className="mt-6 grid gap-3 text-sm text-stone-300 sm:grid-cols-2">
            <span className="rounded-md border border-white/10 px-3 py-2">ขายหน้าร้าน / POS</span>
            <span className="rounded-md border border-white/10 px-3 py-2">Cart สินค้า</span>
            <span className="rounded-md border border-white/10 px-3 py-2">ยอดชำระ</span>
            <span className="rounded-md border border-white/10 px-3 py-2">ใช้บนมือถือได้</span>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-[1fr_0.75fr]">
          <div className="rounded-lg bg-white p-4 text-ink">
            <div className="rounded-md border border-stone-200 p-4">
              <div className="flex items-center gap-2 rounded-md bg-paper px-3 py-2 text-sm text-stone-600">
                <ScanLine size={18} className="text-leaf" />
                ค้นหาหรือสแกนสินค้า
              </div>
              <div className="mt-4 space-y-3">
                {[
                  ["น้ำดื่ม 600ml", "2 x ฿10", "฿20"],
                  ["ขนมถุงเล็ก", "3 x ฿15", "฿45"],
                  ["ถ่าน AA", "1 x ฿35", "฿35"]
                ].map(([name, qty, total]) => (
                  <div key={name} className="flex items-center justify-between rounded-md border border-stone-100 p-3 text-sm">
                    <div>
                      <p className="font-black">{name}</p>
                      <p className="text-stone-500">{qty}</p>
                    </div>
                    <p className="font-black">{total}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-md bg-leaf p-4 text-white">
                <p className="text-sm text-teal-50">ยอดชำระ</p>
                <p className="text-3xl font-black">฿100</p>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/8 p-4">
            <Smartphone className="text-amber-300" />
            <p className="mt-4 text-lg font-black">ใช้บนมือถือได้</p>
            <p className="mt-2 text-sm leading-6 text-stone-300">
              พนักงานขาย รับเข้า และเช็กแจ้งเตือนสินค้าใกล้หมดได้จากหน้าจอที่อ่านง่าย
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function FeatureSection() {
  return (
    <section id="features" className="bg-white py-14">
      <div className="mx-auto max-w-7xl px-5">
        <SectionHeading
          eyebrow="Features"
          title="ฟีเจอร์หลัก 6 อย่าง เรียงตามงานจริงในร้าน"
          text="เริ่มจากจัดสินค้า รับเข้า ขายหน้าร้าน แล้วค่อยดูรายงานและจัดการทีม"
        />
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {features.map(([title, items]) => (
            <Card key={title}>
              <h3 className="text-xl font-black">{title}</h3>
              <ul className="mt-4 space-y-2 text-sm text-stone-700">
                {items.map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <CheckCircle2 size={16} className="shrink-0 text-leaf" />
                    {item}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorksSection() {
  const steps = [
    ["1", "เริ่มจากเพิ่มสินค้า", "ใส่ชื่อสินค้า SKU Barcode ราคาทุน ราคาขาย และจำนวนขั้นต่ำ"],
    ["2", "รับของเข้าคลัง", "บันทึกจำนวนที่เข้ามา ระบบเพิ่มยอดคงเหลือและเก็บประวัติ"],
    ["3", "ขายหน้าร้านแล้วตัดสต็อก", "ค้นหาหรือสแกนสินค้า รับชำระเงิน แล้วระบบตัดสต็อกให้"],
    ["4", "ดูรายงานและเติมของ", "รู้ยอดขาย สินค้าใกล้หมด และสินค้าที่ควรสั่งเพิ่ม"]
  ];

  return (
    <section className="mx-auto max-w-7xl px-5 py-14">
      <SectionHeading
        eyebrow="Workflow"
        title="เริ่มใช้งานได้จากขั้นตอนที่ร้านทำอยู่ทุกวัน"
        text="ไม่ต้องตั้งค่าซับซ้อน ร้านสามารถเริ่มจากสินค้าไม่กี่รายการ แล้วขยายระบบเมื่อพร้อม"
      />
      <div className="mt-8 grid gap-4 md:grid-cols-4">
        {steps.map(([number, title, text]) => (
          <Card key={number}>
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-leaf font-black text-white">{number}</div>
            <h3 className="mt-5 text-xl font-black">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-stone-600">{text}</p>
          </Card>
        ))}
      </div>
    </section>
  );
}

function TargetCustomerSection() {
  return (
    <section id="stores" className="mx-auto max-w-7xl px-5 py-14">
      <SectionHeading
        eyebrow="Best For"
        title="เหมาะกับร้านที่อยากรู้ตัวเลขจริงของร้าน"
        text="ถ้าร้านมีสินค้าให้เช็ก มีของเข้าออก และต้องรู้ยอดขาย Zentory จะช่วยให้ข้อมูลเป็นระบบขึ้น"
      />
      <div className="mt-8 flex flex-wrap gap-3">
        {storeTypes.map((type) => (
          <span key={type} className="rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700 shadow-sm">
            {type}
          </span>
        ))}
      </div>
    </section>
  );
}

function BeforeAfterSection() {
  return (
    <section className="bg-white py-14">
      <div className="mx-auto max-w-7xl px-5">
        <SectionHeading
          eyebrow="Before / After"
          title="จากงานจดจำ กลายเป็นงานที่ตรวจสอบได้"
          text="ส่วนนี้สรุปภาพรวมให้เห็นความต่าง ไม่ซ้ำกับ pain points ที่เล่าเฉพาะปัญหา"
        />
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <CompareCard
            title="ก่อนใช้ Zentory"
            tone="bad"
            items={["ต้องนับของเองบ่อย", "ข้อมูลอยู่หลายที่", "พนักงานลืมจด", "ไม่รู้กำไรจริง"]}
          />
          <CompareCard
            title="หลังใช้ Zentory"
            tone="good"
            items={["เห็นสต็อกทันที", "ขายแล้วตัดสต็อก", "ดูประวัติย้อนหลังได้", "ตัดสินใจเติมของได้ไวขึ้น"]}
          />
        </div>
      </div>
    </section>
  );
}

function BarcodeSection() {
  const bullets = [
    "เตรียมรองรับการค้นหาสินค้าด้วยบาร์โค้ด",
    "รองรับตามแพ็กเกจที่กำหนด",
    "ลดการพิมพ์ชื่อสินค้าผิด",
    "เหมาะกับร้านที่มีสินค้าหลายรายการ"
  ];

  return (
    <section className="mx-auto grid max-w-7xl gap-8 px-5 py-14 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
      <div>
        <SectionHeading
          eyebrow="Barcode & QR"
          title="เตรียมรองรับบาร์โค้ดและ QR สำหรับงานหน้าร้าน"
          text="เขียนตามความจริงของ v1: ฟีเจอร์สแกนและ QR จะระบุให้ชัดตามแพ็กเกจ เพื่อไม่เคลมเกินสิ่งที่ระบบทำได้"
        />
        <div className="mt-6 grid gap-3">
          {bullets.map((item) => (
            <div key={item} className="flex items-center gap-3 rounded-md border border-stone-200 bg-white p-3 font-semibold">
              <CheckCircle2 className="shrink-0 text-leaf" size={18} />
              {item}
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-[1fr_0.85fr]">
        <Card className="p-4">
          <div className="rounded-md bg-ink p-4 text-white">
            <div className="flex items-center gap-2 text-sm text-stone-300">
              <ScanLine size={18} className="text-amber-300" />
              Barcode preview
            </div>
            <p className="mt-3 rounded-md border border-white/15 bg-white/8 px-3 py-3 font-mono text-lg tracking-widest">8850123456789</p>
          </div>
          <div className="mt-4 space-y-3">
            {[
              ["พบสินค้า", "กาแฟกระป๋อง 180ml"],
              ["คงเหลือ", "36 ชิ้น"],
              ["ราคา", "฿18"]
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between rounded-md border border-stone-100 p-3 text-sm">
                <span className="text-stone-500">{label}</span>
                <span className="font-black">{value}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card className="bg-paper p-4">
          <div className="mx-auto flex h-40 w-40 items-center justify-center rounded-lg border border-stone-300 bg-white">
            <QrCode size={88} className="text-ink" />
          </div>
          <p className="mt-4 text-center text-sm font-black">QR PromptPay</p>
          <p className="mt-1 text-center text-xs leading-5 text-stone-500">เตรียมรองรับการแสดง QR สำหรับรับเงินโอนในหน้า POS</p>
        </Card>
      </div>
    </section>
  );
}

function ReportSection() {
  return (
    <section className="mx-auto grid max-w-7xl gap-8 px-5 py-14 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
      <div>
        <SectionHeading
          eyebrow="Reports"
          title="ดูตัวเลขที่เจ้าของร้านใช้ตัดสินใจจริง"
          text="รายงานในหน้าแรกสรุปสั้น ๆ ไม่ลงรายละเอียดเกินไป เพื่อพาไปดูระบบหรือเริ่มใช้งานต่อ"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {[
          ["ยอดขายวันนี้", "฿18,420"],
          ["ยอดขายเดือนนี้", "฿284,900"],
          ["สินค้าใกล้หมด", "24 รายการ"],
          ["มูลค่าสต็อก", "฿412,000"]
        ].map(([label, value]) => (
          <Card key={label}>
            <p className="text-sm text-stone-500">{label}</p>
            <p className="text-3xl font-black">{value}</p>
          </Card>
        ))}
      </div>
    </section>
  );
}

function TrustSection() {
  const items = [
    "ร้านแต่ละร้านแยกข้อมูลกัน",
    "พนักงานเห็นเฉพาะสิ่งที่ได้รับอนุญาต",
    "มีประวัติการแก้ไขสต็อก",
    "เจ้าของร้านตรวจสอบย้อนหลังได้",
    "ออกแบบให้รองรับการสำรองข้อมูล"
  ];

  return (
    <section className="bg-ink py-16 text-white">
      <div className="mx-auto max-w-7xl px-5">
        <SectionHeading
          eyebrow="Trust"
          title="ข้อมูลร้านเป็นส่วนตัวและตรวจสอบย้อนหลังได้"
          text="ระบบออกแบบด้วยหลักแยกข้อมูลร้าน กำหนดสิทธิ์พนักงาน และบันทึกประวัติการเปลี่ยนแปลงสำคัญ"
          dark
        />
        <div className="mt-8 grid gap-4 md:grid-cols-5">
          {items.map((item) => (
            <div key={item} className="rounded-lg border border-white/10 bg-white/6 p-4 text-sm font-semibold">
              <ShieldCheck className="mb-3 text-amber-300" />
              {item}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PricingSection() {
  const plans: Array<[string, string, string[]]> = [
    ["Free", "สำหรับทดลองใช้", ["เริ่มต้นฟรี", "รายงานพื้นฐาน", "เหมาะกับร้านเริ่มต้น"]],
    ["Pro", "สำหรับร้านที่ใช้งานจริง", ["สินค้าและพนักงานมากขึ้น", "บาร์โค้ดตามแพ็กเกจ", "รายงานยอดขาย"]],
    ["Premium", "สำหรับร้านที่ต้องการหลายฟีเจอร์หรือหลายสาขา", ["หลายสาขา", "รายงานขั้นสูง", "สิทธิ์พนักงานละเอียด"]]
  ];

  return (
    <section id="pricing" className="mx-auto max-w-7xl px-5 py-14">
      <SectionHeading
        eyebrow="Pricing"
        title="เริ่มใช้ฟรี อัปเกรดเมื่อร้านพร้อม"
        text="หน้าแรกแสดงแพ็กเกจแบบย่อ รายละเอียดเต็มอยู่ที่หน้าราคา"
      />
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {plans.map(([name, desc, items]) => (
          <Card key={name} className={name === "Pro" ? "border-leaf" : ""}>
            <h3 className="text-2xl font-black">{name}</h3>
            <p className="mt-1 text-sm text-stone-600">{desc}</p>
            <ul className="mt-5 space-y-2 text-sm text-stone-700">
              {items.map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-leaf" />
                  {item}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link to="/pricing">
          <Button variant="secondary">ดูแพ็กเกจทั้งหมด</Button>
        </Link>
        <Link to="/register">
          <Button>เริ่มใช้ฟรี</Button>
        </Link>
      </div>
    </section>
  );
}

function FaqSection() {
  return (
    <section id="faq" className="mx-auto max-w-7xl px-5 py-14">
      <SectionHeading eyebrow="FAQ" title="คำถามที่พบบ่อย" text="คำตอบสั้น ๆ สำหรับเจ้าของร้านที่อยากรู้ก่อนเริ่มใช้" />
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {faqs.map(([question, answer]) => (
          <Card key={question}>
            <h3 className="font-black">{question}</h3>
            <p className="mt-2 text-sm leading-6 text-stone-600">{answer}</p>
          </Card>
        ))}
      </div>
    </section>
  );
}

function FinalCtaSection() {
  return (
    <section className="mx-auto max-w-7xl px-5 py-12 md:py-14">
      <div className="grid gap-7 rounded-lg bg-leaf px-6 py-7 text-white md:px-8 md:py-9 lg:grid-cols-[minmax(0,1.25fr)_auto] lg:items-center lg:gap-10 lg:px-10">
        <div className="max-w-3xl">
          <p className="text-sm font-black tracking-[0.16em] text-teal-50">ทดลองใช้งานฟรี</p>
          <h2 className="mt-3 text-3xl font-black leading-tight md:text-4xl">เริ่มจัดการสต็อกให้เป็นระบบตั้งแต่วันนี้</h2>
          <p className="mt-4 text-base leading-7 text-teal-50">
            Zentory ช่วยให้ร้านค้าบันทึกสินค้า ยอดขาย และสต็อกได้ง่ายขึ้น ลดงานจดมือ ลดของหาย
            และดูภาพรวมร้านได้ชัดเจนกว่าเดิม
          </p>
          <p className="mt-4 text-sm font-semibold leading-6 text-teal-50/90">
            ไม่ต้องใช้บัตรเครดิต · ตั้งค่าร้านได้ในไม่กี่นาที · เหมาะสำหรับร้านค้าขนาดเล็ก
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row lg:justify-self-end">
          <Link to="/register" className="w-full sm:w-auto">
            <Button variant="secondary" className="h-11 w-full px-5 text-base shadow-sm sm:w-auto">
              เริ่มใช้งานฟรี
            </Button>
          </Link>
          <Link to="/pricing" className="w-full sm:w-auto">
            <Button
              variant="ghost"
              className="h-11 w-full border border-white/45 px-5 text-base text-white hover:bg-white/10 sm:w-auto"
            >
              ดูแพ็กเกจ
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

function FooterSection() {
  return (
    <footer className="border-t border-stone-200 bg-white">
      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-10 md:grid-cols-4">
        <div>
          <h3 className="text-xl font-black">Zentory</h3>
          <p className="mt-2 text-sm text-stone-600">เว็บจัดการสต็อกและขายหน้าร้าน / POS สำหรับร้านค้าเล็กถึงกลาง</p>
        </div>
        <FooterList title="เมนู" items={["หน้าแรก", "ฟีเจอร์", "ราคา", "เข้าสู่ระบบ", "สมัครใช้งาน"]} />
        <FooterList title="ช่วยเหลือ" items={["คู่มือการใช้งาน", "ติดต่อเรา", "คำถามที่พบบ่อย"]} />
        <FooterList title="กฎหมาย / ติดต่อ" items={["เงื่อนไขการใช้งาน", "นโยบายความเป็นส่วนตัว", "Facebook", "LINE OA", "Email"]} />
      </div>
      <div className="border-t border-stone-200 py-4 text-center text-sm text-stone-500">Copyright 2026 Zentory</div>
    </footer>
  );
}

function SectionHeading({ eyebrow, title, text, dark = false }: { eyebrow: string; title: string; text: string; dark?: boolean }) {
  return (
    <div className="max-w-3xl">
      <p className={`text-sm font-black uppercase tracking-[0.2em] ${dark ? "text-amber-300" : "text-leaf"}`}>{eyebrow}</p>
      <h2 className={`mt-3 text-3xl font-black leading-tight md:text-4xl ${dark ? "text-white" : "text-ink"}`}>{title}</h2>
      <p className={`mt-3 leading-7 ${dark ? "text-stone-300" : "text-stone-600"}`}>{text}</p>
    </div>
  );
}

function CompareCard({ title, items, tone }: { title: string; items: string[]; tone: "good" | "bad" }) {
  return (
    <Card className={tone === "good" ? "border-leaf" : "border-amber-200"}>
      <h3 className="text-2xl font-black">{title}</h3>
      <ul className="mt-4 grid gap-2 text-sm text-stone-700">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className={tone === "good" ? "text-leaf" : "text-amber-700"}>{tone === "good" ? "✓" : "!"}</span>
            {item}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function FooterList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h4 className="font-black">{title}</h4>
      <ul className="mt-3 space-y-2 text-sm text-stone-600">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
