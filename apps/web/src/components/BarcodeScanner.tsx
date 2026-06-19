import { Camera, CameraOff, CheckCircle2, ScanLine, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "./Button";

type BarcodeScannerProps = {
  open: boolean;
  title?: string;
  closeOnDetected?: boolean;
  scanCooldownMs?: number;
  onDetected: (code: string) => void;
  onClose: () => void;
};

type DetectedBarcode = { rawValue: string };
type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => {
  detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]>;
};
type BarcodeDetectorStatic = BarcodeDetectorConstructor & {
  getSupportedFormats?: () => Promise<string[]>;
};
type ZxingBrowserModule = {
  BrowserMultiFormatReader: new (...args: unknown[]) => {
    decodeFromVideoElement: (
      video: HTMLVideoElement,
      callback: (result?: { getText: () => string }, error?: unknown, controls?: { stop: () => void }) => void
    ) => Promise<{ stop: () => void }>;
  };
};

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorStatic;
  }
}

const barcodeFormats = [
  "aztec",
  "code_128",
  "code_39",
  "code_93",
  "codabar",
  "data_matrix",
  "ean_13",
  "ean_8",
  "itf",
  "pdf417",
  "qr_code",
  "upc_a",
  "upc_e"
];
const zxingModuleUrl = "https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/+esm";
const defaultScanCooldownMs = 900;

export function BarcodeScanner({
  open,
  title = "สแกนบาร์โค้ด",
  closeOnDetected = true,
  scanCooldownMs = defaultScanCooldownMs,
  onDetected,
  onClose
}: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const zxingControlsRef = useRef<{ stop: () => void } | null>(null);
  const detectedRef = useRef(false);
  const [status, setStatus] = useState("");
  const [cameraSupported, setCameraSupported] = useState(true);
  const [detectorSupported, setDetectorSupported] = useState(true);
  const [manualCode, setManualCode] = useState("");

  useEffect(() => {
    if (!open || closeOnDetected) return undefined;
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (event.key !== "Enter" || target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      event.preventDefault();
      onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeOnDetected, onClose, open]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    let frameId = 0;
    let detectionResetId = 0;

    function handleDetectedCode(code: string, resume?: () => void) {
      detectedRef.current = true;
      onDetected(code);
      if (closeOnDetected) {
        zxingControlsRef.current?.stop();
        onClose();
        return;
      }
      setStatus(`สแกนแล้ว: ${code}`);
      detectionResetId = window.setTimeout(() => {
        detectedRef.current = false;
        setStatus("เล็งกล้องไปที่บาร์โค้ด");
        resume?.();
      }, scanCooldownMs);
    }

    async function start() {
      detectedRef.current = false;
      setManualCode("");
      setStatus("กำลังเปิดกล้อง...");
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraSupported(false);
        setDetectorSupported(false);
        setStatus("เบราว์เซอร์นี้ยังไม่อนุญาตให้เปิดกล้องจากหน้านี้");
        return;
      }
      setCameraSupported(true);

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        const Detector = window.BarcodeDetector;
        if (!Detector) {
          try {
            setStatus("กำลังโหลดตัวอ่านบาร์โค้ด...");
            const zxing = await import(/* @vite-ignore */ zxingModuleUrl) as ZxingBrowserModule;
            if (cancelled || !videoRef.current) return;
            setDetectorSupported(true);
            setStatus("เล็งกล้องไปที่บาร์โค้ด");
            const reader = new zxing.BrowserMultiFormatReader(undefined, {
              delayBetweenScanAttempts: 180,
              delayBetweenScanSuccess: 400
            });
            zxingControlsRef.current = await reader.decodeFromVideoElement(videoRef.current, (result) => {
              const code = result?.getText()?.trim();
              if (!code || detectedRef.current) return;
              handleDetectedCode(code);
            });
          } catch {
            setDetectorSupported(false);
            setStatus("เปิดกล้องแล้ว แต่โหลดตัวอ่านบาร์โค้ดอัตโนมัติไม่ได้");
          }
          return;
        }
        setDetectorSupported(true);

        const supportedFormats = Detector.getSupportedFormats ? await Detector.getSupportedFormats() : barcodeFormats;
        const formats = barcodeFormats.filter((format) => supportedFormats.includes(format));
        const detector = new Detector(formats.length ? { formats } : undefined);
        setStatus("เล็งกล้องไปที่บาร์โค้ด");

        const scan = async () => {
          if (cancelled || detectedRef.current) return;
          const video = videoRef.current;
          const canvas = canvasRef.current;
          if (video && canvas && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const context = canvas.getContext("2d", { willReadFrequently: true });
            if (context && canvas.width > 0 && canvas.height > 0) {
              context.drawImage(video, 0, 0, canvas.width, canvas.height);
              const codes = await detector.detect(canvas);
              const code = codes[0]?.rawValue?.trim();
              if (code) {
                handleDetectedCode(code, scan);
                return;
              }
            }
          }
          frameId = window.setTimeout(scan, 180);
        };

        scan();
      } catch {
        setStatus("เปิดกล้องไม่ได้ กรุณาอนุญาตกล้องแล้วลองใหม่");
      }
    }

    start();
    return () => {
      cancelled = true;
      window.clearTimeout(frameId);
      window.clearTimeout(detectionResetId);
      zxingControlsRef.current?.stop();
      zxingControlsRef.current = null;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [closeOnDetected, onClose, onDetected, open, scanCooldownMs]);

  if (!open) return null;

  function submitManualCode() {
    const code = manualCode.trim();
    if (!code) return;
    onDetected(code);
    if (closeOnDetected) {
      onClose();
      return;
    }
    setManualCode("");
    setStatus(`สแกนแล้ว: ${code}`);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-lg bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-stone-200 px-4 py-3">
          <h2 className="flex items-center gap-2 text-lg font-black text-ink"><ScanLine size={20} /> {title}</h2>
          <Button type="button" variant="ghost" icon={<X size={18} />} aria-label="ปิดตัวสแกน" onClick={onClose} />
        </div>
        <div className="space-y-3 p-4">
          <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-stone-950">
            {cameraSupported ? (
              <>
                <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
                <div className="pointer-events-none absolute inset-x-8 top-1/2 h-24 -translate-y-1/2 rounded-md border-2 border-white/90 shadow-[0_0_0_999px_rgba(0,0,0,0.25)]" />
              </>
            ) : (
              <div className="grid h-full place-items-center p-6 text-center text-white">
                <div>
                  <CameraOff className="mx-auto" size={44} />
                  <p className="mt-3 text-sm font-bold">เปิดกล้องจากหน้านี้ไม่ได้</p>
                </div>
              </div>
            )}
          </div>
          <canvas ref={canvasRef} className="hidden" />
          <p className="flex items-center gap-2 text-sm font-semibold text-stone-600">
            <Camera size={16} />
            {status}
          </p>
          {!detectorSupported ? (
            <div className="grid gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <input
                className="field bg-white"
                value={manualCode}
                onChange={(event) => setManualCode(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submitManualCode();
                  }
                }}
                placeholder="พิมพ์เลขบาร์โค้ดแทน"
              />
              <Button type="button" variant="secondary" onClick={submitManualCode} disabled={!manualCode.trim()}>
                ใช้รหัสนี้
              </Button>
            </div>
          ) : null}
        </div>
        {!closeOnDetected ? (
          <div className="border-t border-stone-200 bg-stone-50 p-4">
            <Button
              type="button"
              className="h-12 w-full text-base font-black"
              icon={<CheckCircle2 size={20} />}
              onClick={onClose}
            >
              เสร็จสิ้น
            </Button>
            <p className="mt-2 text-center text-xs font-semibold text-stone-500">กด Enter เพื่อปิดตัวสแกน</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
