import { useEffect, useMemo, useState } from "react";
import { Clipboard, Copy, FileText, FolderOpen, Globe2, Search, StickyNote, Trash2, WandSparkles, Check, Plus } from "lucide-react";

type Tool = "clipboard" | "shelf" | "text" | "notes" | "weather" | "launcher";
type Clip = { id: number; text: string; pinned: boolean };
type LinkEntry = { id: number; label: string; url: string };
const store = <T,>(key: string, fallback: T): T => { try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; } };
function urlSafe(value: string): string | null {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}
function transform(text: string, action: string) {
  switch(action) {
    case "upper": return text.toLocaleUpperCase("uk-UA");
    case "lower": return text.toLocaleLowerCase("uk-UA");
    case "title": return text.toLocaleLowerCase("uk-UA").replace(/(^|\s)\p{L}/gu, x => x.toLocaleUpperCase("uk-UA"));
    case "json": try { return JSON.stringify(JSON.parse(text), null, 2); } catch { throw Error("Некоректний JSON"); }
    case "encode": return encodeURIComponent(text);
    case "decode": return decodeURIComponent(text);
    case "base64": return btoa(Array.from(new TextEncoder().encode(text), c => String.fromCharCode(c)).join(""));
    case "unbase64": return new TextDecoder().decode(Uint8Array.from(atob(text), c => c.charCodeAt(0)));
    case "trim": return text.trim().replace(/[ \t]+/g, " ");
    default: return text;
  }
}
export function Toolbox({ onAskAI }: { onAskAI: (text: string) => void }) {
  const [tool, setTool] = useState<Tool>("clipboard");
  const [notice, setNotice] = useState("");
  const [clips, setClips] = useState<Clip[]>(() => store("aurora:clips", []));
  const [query, setQuery] = useState("");
  const [note, setNote] = useState(() => store("aurora:note", ""));
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [links, setLinks] = useState<LinkEntry[]>(() => store("aurora:links", [{id:1,label:"ChatGPT",url:"https://chatgpt.com/"},{id:2,label:"GitHub",url:"https://github.com/"}]));
  const [linkLabel, setLinkLabel] = useState("");
  const [linkURL, setLinkURL] = useState("");
  const [city, setCity] = useState(() => store("aurora:weather-city", "Черкаси"));
  const [forecast, setForecast] = useState<{name:string; temperature:number; wind:number; code:number}|null>(null);
  const [weatherBusy, setWeatherBusy] = useState(false);
  useEffect(() => { try { localStorage.setItem("aurora:clips", JSON.stringify(clips.slice(0, 50))); } catch {} }, [clips]);
  useEffect(() => { try { localStorage.setItem("aurora:note", JSON.stringify(note)); } catch {} }, [note]);
  useEffect(() => { try { localStorage.setItem("aurora:links", JSON.stringify(links)); } catch {} }, [links]);
  const filtered = useMemo(() => clips.filter(c => c.text.toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a,b)=>Number(b.pinned)-Number(a.pinned)), [clips,query]);
  const capture = async () => {
    try {
      const value = await navigator.clipboard.readText();
      if (!value.trim()) return setNotice("Буфер обміну порожній");
      setClips(v => [{ id: Date.now(), text: value.slice(0, 20000), pinned: false }, ...v.filter(c=>c.text!==value)].slice(0,50));
      setNotice("Додано до історії");
    } catch { setNotice("Windows WebView заборонив читання. Скопіюйте текст і вставте у поле нижче."); }
  };
  const copy = async (value: string) => {
    try { await navigator.clipboard.writeText(value); setNotice("Скопійовано"); } catch { setNotice("Не вдалося записати в буфер"); }
  };
  const [manual, setManual] = useState("");
  const addManual = () => { if(manual.trim()) { setClips(v=>[{id:Date.now(),text:manual.slice(0,20000),pinned:false},...v].slice(0,50));setManual(""); } };
  const doTransform = (action:string) => { try { setText(transform(text, action));setNotice("Готово"); } catch(e) { setNotice(String(e)); } };
  const getWeather = async () => {
    setWeatherBusy(true); setNotice("");
    const controller = new AbortController();
    const timeout = window.setTimeout(()=>controller.abort(),10000);
    try {
      const cityResult = await fetch("https://geocoding-api.open-meteo.com/v1/search?count=1&language=uk&name="+encodeURIComponent(city.trim()), {signal:controller.signal}).then(r=>r.json());
      const place=cityResult.results?.[0];
      if(!place) throw Error("Місто не знайдено");
      const data=await fetch("https://api.open-meteo.com/v1/forecast?latitude="+place.latitude+"&longitude="+place.longitude+"&current=temperature_2m,wind_speed_10m,weather_code", {signal:controller.signal}).then(r=>r.json());
      if(typeof data.current?.temperature_2m!=="number") throw Error("Прогноз недоступний");
      setForecast({name:place.name,temperature:data.current.temperature_2m,wind:data.current.wind_speed_10m,code:data.current.weather_code});
      localStorage.setItem("aurora:weather-city",JSON.stringify(city));
    } catch(e) {setNotice("Погода: "+String(e));} finally{clearTimeout(timeout);setWeatherBusy(false);}
  };
  const tabs: {id:Tool; name:string}[] = [{id:"clipboard",name:"Буфер"},{id:"shelf",name:"Файли"},{id:"text",name:"Текст"},{id:"notes",name:"Нотатки"},{id:"weather",name:"Погода"},{id:"launcher",name:"Посилання"}];
  return <div className="toolbox">
    <div className="tool-tabs">{tabs.map(t=><button key={t.id} className={tool===t.id?"selected":""} onClick={()=>{setTool(t.id);setNotice("");}}>{t.name}</button>)}</div>
    {notice&&<div className="tool-notice" role="status">{notice}</div>}
    {tool==="clipboard"&&<div className="tool-section">
      <div className="tool-heading"><Clipboard size={16}/> Історія буфера <button onClick={capture}>Зчитати зараз</button></div>
      <p className="tool-help">Зберігає текст локально лише коли ви натискаєте «Зчитати» або додаєте його вручну. Паролі не слід додавати.</p>
      <div className="tool-inline"><input value={manual} onChange={e=>setManual(e.target.value)} placeholder="Вставте текст Ctrl+V" /><button onClick={addManual}><Plus size={14}/></button></div>
      <input className="tool-input" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Пошук в історії..." />
      {filtered.map(c=><div key={c.id} className="tool-item"><span title={c.text}>{c.text.slice(0,220)}</span><button title="Закріпити" onClick={()=>setClips(v=>v.map(i=>i.id===c.id?{...i,pinned:!i.pinned}:i))}>{c.pinned?"★":"☆"}</button><button title="Копіювати" onClick={()=>void copy(c.text)}><Copy size={14}/></button><button title="Видалити" onClick={()=>setClips(v=>v.filter(i=>i.id!==c.id))}><Trash2 size={14}/></button></div>)}
      {!filtered.length&&<p className="tool-help">Історія поки порожня.</p>}
      {!!clips.length&&<button className="tool-quiet" onClick={()=>setClips([])}>Очистити історію</button>}
    </div>}
    {tool==="shelf"&&<div className="tool-section">
      <div className="tool-heading"><FolderOpen size={16}/> Тимчасова полиця файлів</div>
      <p className="tool-help">Файли залишаються доступними в цій сесії вікна. Вони не завантажуються в інтернет.</p>
      <label className="tool-upload">+ Додати файли<input type="file" multiple onChange={e=>setFiles(v=>[...v,...Array.from(e.target.files||[])])}/></label>
      {files.map((f,i)=><div className="tool-item" key={i}><FileText size={14}/><span>{f.name} · {(f.size/1024).toFixed(1)} КБ</span><button onClick={()=>{const u=URL.createObjectURL(f);const a=document.createElement("a");a.href=u;a.download=f.name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}}>Зберегти</button><button onClick={()=>setFiles(v=>v.filter((_,j)=>j!==i))}><Trash2 size={14}/></button></div>)}
    </div>}
    {tool==="text"&&<div className="tool-section">
      <div className="tool-heading"><WandSparkles size={16}/> Текстові інструменти</div>
      <textarea className="tool-textarea" value={text} onChange={e=>setText(e.target.value)} placeholder="Введіть або вставте текст..." />
      <div className="tool-action-grid">{[["upper","ВЕЛИКІ"],["lower","малі"],["title","Кожне Слово"],["trim","Пробіли"],["json","Формат JSON"],["encode","URL encode"],["decode","URL decode"],["base64","Base64 +"],["unbase64","Base64 −"]].map(([id,label])=><button key={id} onClick={()=>doTransform(id)}>{label}</button>)}</div>
      <div className="tool-inline"><button onClick={()=>void copy(text)}><Copy size={13}/> Копіювати</button><button onClick={()=>onAskAI(text)} disabled={!text.trim()}><WandSparkles size={13}/> Запитати AI</button></div>
    </div>}
    {tool==="notes"&&<div className="tool-section">
      <div className="tool-heading"><StickyNote size={16}/> Швидка нотатка <span className="tool-saved"><Check size={12}/> Автозбереження</span></div>
      <textarea className="tool-textarea tool-note" value={note} onChange={e=>setNote(e.target.value)} placeholder="Запишіть думку, список справ або ідею..." />
      <div className="tool-inline"><button onClick={()=>void copy(note)}><Copy size={13}/> Копіювати</button><button onClick={()=>setNote("")}>Очистити</button></div>
    </div>}
    {tool==="weather"&&<div className="tool-section">
      <div className="tool-heading"><Globe2 size={16}/> Погода за вибраним містом</div>
      <div className="tool-inline"><input value={city} onChange={e=>setCity(e.target.value)} placeholder="Назва міста"/><button onClick={()=>void getWeather()} disabled={weatherBusy}>{weatherBusy?"...":"Оновити"}</button></div>
      {forecast&&<div className="tool-weather"><b>{forecast.name}</b><strong>{Math.round(forecast.temperature)}°</strong><span>Вітер {Math.round(forecast.wind)} км/год · код умов {forecast.code}</span></div>}
      <p className="tool-help">Дані Open-Meteo. Локація визначається тільки за введеною назвою міста.</p>
    </div>}
    {tool==="launcher"&&<div className="tool-section">
      <div className="tool-heading"><Search size={16}/> Швидкі посилання</div>
      {links.map(l=><div key={l.id} className="tool-item"><Globe2 size={14}/><span>{l.label}</span><button onClick={()=>{const url=urlSafe(l.url);if(url) window.open(url,"_blank","noopener,noreferrer");}}>Відкрити</button><button onClick={()=>setLinks(v=>v.filter(x=>x.id!==l.id))}><Trash2 size={14}/></button></div>)}
      <div className="tool-inline"><input value={linkLabel} onChange={e=>setLinkLabel(e.target.value)} placeholder="Назва"/><input value={linkURL} onChange={e=>setLinkURL(e.target.value)} placeholder="https://..."/><button onClick={()=>{const url=urlSafe(linkURL);if(!url||!linkLabel.trim())return setNotice("Вкажіть назву та http(s) адресу");setLinks(v=>[...v,{id:Date.now(),label:linkLabel.trim(),url}]);setLinkURL("");setLinkLabel("");}}>+</button></div>
    </div>}
  </div>;
}
