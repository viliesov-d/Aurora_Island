import { useEffect, useRef, useState, type PointerEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Camera, Copy, Crop, Download, Pipette, RotateCcw } from "lucide-react";
import { nativeCopy } from "./nativeIntegration";

type ScreenCapture = { width: number; height: number; dataUrl: string };
type Rect = { x: number; y: number; width: number; height: number };
type Point = { x: number; y: number };

export function ScreenTools() {
  const [screenshot, setScreenshot] = useState<ScreenCapture | null>(null);
  const [selection, setSelection] = useState<Rect | null>(null);
  const [picked, setPicked] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const start = useRef<Point | null>(null);
  const buffer = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    buffer.current = null;
    if (!screenshot) return;
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      const canvas = document.createElement("canvas");
      canvas.width = screenshot.width;
      canvas.height = screenshot.height;
      canvas.getContext("2d", { willReadFrequently: true })?.drawImage(image, 0, 0);
      buffer.current = canvas;
    };
    image.src = screenshot.dataUrl;
    return () => { cancelled = true; image.onload = null; buffer.current = null; };
  }, [screenshot]);

  const capture = async () => {
    setBusy(true); setStatus(""); setSelection(null); setPicked("");
    try {
      const image = await invoke<ScreenCapture>("capture_screen");
      setScreenshot(image);
      setStatus("Знімок збережено лише в пам'яті. Виділіть прямокутник або виберіть піксель.");
    } catch (err) {
      setStatus("Не вдалося захопити екран: " + String(err));
    } finally { setBusy(false); }
  };

  const pointAt = (e: PointerEvent<HTMLImageElement>): Point => {
    const img = e.currentTarget;
    const rect = img.getBoundingClientRect();
    const width = screenshot?.width || 1, height = screenshot?.height || 1;
    return {
      x: Math.max(0, Math.min(width - 1, Math.floor((e.clientX - rect.left) * width / rect.width))),
      y: Math.max(0, Math.min(height - 1, Math.floor((e.clientY - rect.top) * height / rect.height))),
    };
  };

  const pixelAt = (p: Point) => {
    const ctx = buffer.current?.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    const rgba = ctx.getImageData(p.x, p.y, 1, 1).data;
    setPicked("#" + [...rgba].slice(0, 3).map(v => v.toString(16).padStart(2, "0")).join("").toUpperCase());
  };

  const makeRect = (a: Point, b: Point): Rect => ({
    x: Math.min(a.x, b.x), y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x) + 1, height: Math.abs(a.y - b.y) + 1,
  });

  const down = (e: PointerEvent<HTMLImageElement>) => {
    if (e.button !== 0 || !screenshot) return;
    const startPoint = pointAt(e);
    start.current = startPoint;
    setSelection(null);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent<HTMLImageElement>) => {
    const point = pointAt(e);
    if (start.current) setSelection(makeRect(start.current, point));
    else pixelAt(point);
  };
  const up = (e: PointerEvent<HTMLImageElement>) => {
    if (!start.current) return;
    const endPoint = pointAt(e);
    const rect = makeRect(start.current, endPoint);
    start.current = null;
    if (rect.width < 5 && rect.height < 5) {
      setSelection(null);
      pixelAt(endPoint);
    } else {
      setSelection(rect);
      setStatus("Обрано область: " + rect.width + " × " + rect.height + " px");
    }
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const save = async () => {
    if (!screenshot || !buffer.current) return;
    setBusy(true); setStatus("");
    try {
      const selected = selection ?? { x:0, y:0, width:screenshot.width, height:screenshot.height };
      const canvas = document.createElement("canvas");
      canvas.width = selected.width;
      canvas.height = selected.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas недоступний");
      ctx.drawImage(buffer.current, selected.x, selected.y, selected.width, selected.height, 0, 0, selected.width, selected.height);
      const data = canvas.toDataURL("image/png").split(",")[1];
      const path = await invoke<string>("save_capture_png", { pngBase64: data });
      setStatus("PNG збережено: " + path);
    } catch (err) { setStatus("Помилка збереження: " + String(err)); }
    finally { setBusy(false); }
  };

  return <div className="tool-section screen-tools">
    <div className="tool-heading"><Camera size={16}/> Захоплення екрана</div>
    <p className="tool-help">Натисніть «Зробити знімок». Aurora тимчасово сховається, щоб не потрапити в кадр. Захоплюється основний монітор Windows, без фонового запису.</p>
    <div className="tool-inline">
      <button onClick={() => void capture()} disabled={busy}><Camera size={15}/> {busy ? "Обробка…" : "Зробити знімок"}</button>
      {screenshot && <button onClick={() => {setScreenshot(null); setSelection(null); setPicked(""); setStatus("Знімок очищено з пам'яті.");}}><RotateCcw size={14}/> Очистити</button>}
    </div>
    {screenshot && <>
      <div className="screen-preview">
        <img draggable={false} alt="Знімок основного екрана" src={screenshot.dataUrl}
          onPointerDown={down} onPointerMove={move} onPointerUp={up}
          onPointerCancel={() => { start.current = null; setSelection(null); }}/>
        {selection && <div className="screen-selection" style={{
          left: (selection.x/screenshot.width*100) + "%",
          top: (selection.y/screenshot.height*100) + "%",
          width: (selection.width/screenshot.width*100) + "%",
          height: (selection.height/screenshot.height*100) + "%",
        }}/>}
      </div>
      <p className="tool-help">Клацніть на знімку, щоб дізнатися колір. Протягніть мишкою, щоб виділити область для PNG.</p>
      <div className="tool-inline">
        <span className="screen-color" style={{background:picked || "#333"}}/>
        <strong className="screen-hex"><Pipette size={14}/> {picked || "Наведіть на знімок"}</strong>
        <button disabled={!picked} onClick={() => void nativeCopy(picked).then(()=>setStatus("Колір скопійовано: "+picked)).catch(e=>setStatus(String(e)))}><Copy size={14}/> HEX</button>
      </div>
      <div className="tool-inline">
        <button disabled={busy} onClick={() => void save()}><Download size={14}/> {selection ? "Зберегти область" : "Зберегти весь знімок"}</button>
        {selection && <button onClick={() => setSelection(null)}><Crop size={14}/> Скинути область</button>}
      </div>
    </>}
    {status && <div className="tool-notice" role="status">{status}</div>}
    <p className="tool-help">Знімки не надсилаються на сервер. Збереження виконується у папку «Завантаження». Захищений DRM-вміст Windows може не захоплюватися.</p>
  </div>;
}
