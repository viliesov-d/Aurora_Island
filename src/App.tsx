import { lazy, Suspense, useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type CSSProperties } from "react";
import { AnimatePresence, motion } from "motion/react";
const ReactMarkdown = lazy(() => import("react-markdown"));
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize, PhysicalPosition } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { Battery, BatteryCharging, Bot, ChevronDown, Command, ExternalLink, Grip, MessageCircle, Minus, Pause, Play, Plus, Send, Settings2, ShieldCheck, Sparkles, Timer, Music2, X } from "lucide-react";
import { defaults, type Message, type Preferences, type Tab, type Theme } from "./types";
import { MediaPane, type MediaState, type VolumeState } from "./MediaPane";
import { Toolbox } from "./Toolbox";
import { CommandPalette } from "./CommandPalette";

const themeNames: Record<Theme,string> = { classic:"Classic", glass:"Liquid Glass", soft:"Soft Minimal", neon:"Neon" };
const initialMessages: Message[] = [{ role:"assistant", content:"Привіт! Я Aurora AI. Додайте власний OpenAI API key у налаштуваннях чату, щоб почати." }];

function loadPrefs(): Preferences {
  try {
    const raw = JSON.parse(localStorage.getItem("aurora:prefs") || "{}");
    const saved = { ...defaults, ...raw, modules: { ...defaults.modules, ...raw?.modules } };
    return {
      ...saved,
      width: Math.min(340, Math.max(240, Number(saved.width) || defaults.width)),
      opacity: Math.min(100, Math.max(35, Number(saved.opacity) || defaults.opacity)),
      blur: Math.min(24, Math.max(0, Number(saved.blur) || 0))
    };
  } catch { return defaults; }
}
function readMessages(): Message[] { try { return JSON.parse(localStorage.getItem("aurora:chat") || "null") || initialMessages; } catch { return initialMessages; } }

export default function App() {
  const [prefs,setPrefs]=useState(loadPrefs); const [expanded,setExpanded]=useState(false); const [tab,setTab]=useState<Tab>("home");
  const [battery,setBattery]=useState<{batteryPercent:number|null;charging:boolean|null}|null>(null); const [messages,setMessages]=useState<Message[]>(readMessages); const [draft,setDraft]=useState(""); const [busy,setBusy]=useState(false); const [hasKey,setHasKey]=useState(false); const [apiKey,setApiKey]=useState(""); const [seconds,setSeconds]=useState(300); const [timerOn,setTimerOn]=useState(false); const [error,setError]=useState("");
  const [media,setMedia]=useState<MediaState|null>(null);
  const [volume,setVolume]=useState<VolumeState|null>(null);
  const [audioError,setAudioError]=useState("");
  const [mediaBusy,setMediaBusy]=useState(false);
  const volumeTimer=useRef<number|undefined>(undefined);
  const lastVolumeInteraction=useRef(0);
  const leaveTimer=useRef<number|undefined>(undefined);
  const hoverTimer=useRef<number|undefined>(undefined);
  const skipHover=useRef(false);
  const layoutQueue=useRef<Promise<void>>(Promise.resolve());
  const restoredPosition=useRef(false);
  const chatEnd=useRef<HTMLDivElement>(null);
  // Serializing layout mutations prevents stale window regions after rapid toggles.
  const resizeWindow=useCallback((open:boolean, pillWidth:number, radius:number)=>{
    layoutQueue.current=layoutQueue.current.catch(()=>{}).then(async()=>{
      const w=getCurrentWindow();
      const scale=await w.scaleFactor();
      const previous=await w.outerSize();
      const position=await w.outerPosition();
      const frameWidth=open?Math.max(430,pillWidth+110):pillWidth+16;
      const frameHeight=open?506:52;
      let x=Math.round(position.x+(previous.width-frameWidth*scale)/2);
      let y=position.y;
      if(!restoredPosition.current){
        restoredPosition.current=true;
        try {
          const saved=JSON.parse(localStorage.getItem("aurora:position") || "null");
          if(Number.isFinite(saved?.centerX)&&Number.isFinite(saved?.y)){
            x=Math.round(saved.centerX-frameWidth*scale/2);
            y=Math.round(saved.y);
          }
        } catch { /* Ignore invalid position data. */ }
      }
      await w.setSize(new LogicalSize(frameWidth,frameHeight));
      await w.setPosition(new PhysicalPosition(x,y));
      await invoke("set_native_region",{expanded:open,pillWidth,radius});
    }).catch(err=>{ console.warn("Aurora layout update failed",err); });
    return layoutQueue.current;
  },[]);
  const invokeMode=(open:boolean)=>{
    window.clearTimeout(hoverTimer.current);
    window.clearTimeout(leaveTimer.current);
    skipHover.current=!open;
    setExpanded(open);
  };
  const updatePrefs=(next:Partial<Preferences>)=>setPrefs(p=>({...p,...next}));
  useEffect(()=>{localStorage.setItem("aurora:prefs",JSON.stringify(prefs));document.documentElement.dataset.theme=prefs.theme;document.documentElement.style.setProperty("--pill-width",`${prefs.width}px`);document.documentElement.style.setProperty("--glass-blur",`${prefs.blur}px`);document.documentElement.style.setProperty("--glass-strength",String(prefs.glass/100));document.documentElement.style.setProperty("--motion-speed",`${prefs.speed/100}`);document.documentElement.style.setProperty("--surface-opacity",String(prefs.opacity/100));document.documentElement.style.setProperty("--island-radius",`${prefs.radius}px`);document.documentElement.style.setProperty("--accent",prefs.accent);},[prefs]);
  useEffect(()=>{void resizeWindow(expanded,prefs.width,prefs.radius)},[expanded,prefs.width,prefs.radius,resizeWindow]);
  useEffect(()=>{
    const w=getCurrentWindow();
    let saveTimer:number|undefined;
    let active=true;
    let unlisten:(()=>void)|undefined;
    void w.onMoved(()=>{
      window.clearTimeout(saveTimer);
      saveTimer=window.setTimeout(async()=>{
        try {
          const [p,size]=await Promise.all([w.outerPosition(),w.outerSize()]);
          if(active)localStorage.setItem("aurora:position",JSON.stringify({centerX:p.x+size.width/2,y:p.y}));
        } catch { /* Never block the UI on location persistence. */ }
      },650);
    }).then(dispose=>{if(active)unlisten=dispose;else dispose()}).catch(()=>{});
    return()=>{active=false;window.clearTimeout(saveTimer);unlisten?.()};
  },[]);
  useEffect(()=>{invoke<{batteryPercent:number|null;charging:boolean|null}>("system_info").then(setBattery).catch(()=>{});const id=window.setInterval(()=>invoke<{batteryPercent:number|null;charging:boolean|null}>("system_info").then(setBattery).catch(()=>{}),60000);return()=>clearInterval(id)},[]);
  useEffect(()=>{invoke<boolean>("has_api_key").then(setHasKey).catch(()=>{});},[]);
  const refreshMedia=useCallback(async()=>{
    try { const next=await invoke<MediaState>("media_state"); setMedia(next); setAudioError(""); }
    catch(e){setMedia(null);setAudioError(`Медіаплеєр: ${String(e)}`);}
  },[]);
  const refreshVolume=useCallback(async()=>{
    try {
      const next=await invoke<VolumeState>("get_volume");
      if(Date.now()-lastVolumeInteraction.current>800)setVolume(next);
    }catch(e){setVolume(null);setAudioError(`Гучність: ${String(e)}`);}
  },[]);
  useEffect(()=>{
    if(!prefs.modules.media&&!prefs.modules.volume)return;
    let cancelled=false;
    const poll=()=>{
      if(cancelled)return;
      if(prefs.modules.media)void refreshMedia();
      if(expanded&&prefs.modules.volume)void refreshVolume();
    };
    poll();
    const interval=window.setInterval(poll,expanded?3000:7000);
    return()=>{cancelled=true;window.clearInterval(interval)};
  },[expanded,prefs.modules.media,prefs.modules.volume,refreshMedia,refreshVolume]);
  useEffect(()=>()=>window.clearTimeout(volumeTimer.current),[]);
  const controlMedia=async(action:"toggle"|"next"|"previous")=>{
    if(mediaBusy)return;
    setMediaBusy(true);
    setAudioError("");
    try{await invoke("media_control",{action});await refreshMedia();}
    catch(e){setAudioError(`Керування музикою: ${String(e)}`);}
    finally{setMediaBusy(false);}
  };
  const changeVolume=(percent:number)=>{
    lastVolumeInteraction.current=Date.now();
    setVolume(p=>({percent,muted:p?.muted??false}));
    window.clearTimeout(volumeTimer.current);
    volumeTimer.current=window.setTimeout(async()=>{
      try{const next=await invoke<VolumeState>("set_volume",{percent});setVolume(next);setAudioError("");}
      catch(e){setAudioError(`Зміна гучності: ${String(e)}`);}
    },110);
  };
  const toggleMute=async()=>{
    if(!volume)return;
    lastVolumeInteraction.current=Date.now();
    try{setVolume(await invoke<VolumeState>("set_mute",{muted:!volume.muted}));setAudioError("");}
    catch(e){setAudioError(`Вимкнення звуку: ${String(e)}`);}
  };
  const timerDeadline=useRef<number|null>(null);
  useEffect(()=>{
    if(!timerOn)return;
    const tick=()=>{
      const remaining=Math.max(0,Math.ceil(((timerDeadline.current??Date.now())-Date.now())/1000));
      setSeconds(remaining);
      if(remaining===0){setTimerOn(false);timerDeadline.current=null;}
    };
    tick();
    const id=window.setInterval(tick,250);
    return()=>clearInterval(id);
  },[timerOn]);
  const toggleTimer=()=>{
    if(timerOn){setTimerOn(false);timerDeadline.current=null;return;}
    const duration=seconds||300;
    if(!seconds)setSeconds(duration);
    timerDeadline.current=Date.now()+duration*1000;
    setTimerOn(true);
  };
  const adjustTimer=(delta:number)=>{
    setTimerOn(false);
    timerDeadline.current=null;
    setSeconds(v=>Math.min(7200,Math.max(60,v+delta)));
  };
  useEffect(()=>{localStorage.setItem("aurora:chat",JSON.stringify(messages));chatEnd.current?.scrollIntoView({behavior:"smooth",block:"end"});},[messages]);
  useEffect(()=>{
    let unlisten: (()=>void)|undefined;
    listen<string>("chat:delta",e=>setMessages(m=>{if(!m.length||m[m.length-1].role!=="assistant")return [...m,{role:"assistant",content:e.payload}];return [...m.slice(0,-1),{...m[m.length-1],content:m[m.length-1].content+e.payload}]})).then(f=>unlisten=f);
    return()=>unlisten?.();
  },[]);
  useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();setTab("commands");setExpanded(true)}};window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey)},[]);
  const scheduleExpand=()=>{
    window.clearTimeout(leaveTimer.current);
    if(expanded||!prefs.hoverExpand||skipHover.current)return;
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current=window.setTimeout(()=>{if(!skipHover.current)invokeMode(true)},650);
  };
  const scheduleCollapse=()=>{
    window.clearTimeout(hoverTimer.current);
    skipHover.current=false;
    if(!prefs.autoHide||!expanded||tab!=="home")return;
    window.clearTimeout(leaveTimer.current);
    leaveTimer.current=window.setTimeout(()=>invokeMode(false),1400);
  };
  const sendMessage=async()=>{const text=draft.trim();if(!text||busy)return;setError("");setDraft("");const next=[...messages,{role:"user" as const,content:text}];setMessages([...next,{role:"assistant",content:""}]);setBusy(true);
    try { await invoke("stream_chat",{messages:next,model:"gpt-4.1-mini"}); }
    catch(e){setError(String(e));setMessages(m=>m.filter((x,i)=>!(x.role==="assistant"&&i===m.length-1&&x.content==="")));}
    finally{setBusy(false)}
  };
  const saveKey=async()=>{try{await invoke("save_api_key",{key:apiKey});setHasKey(true);setApiKey("");setError("")}catch(e){setError(String(e))}};
  const attachText=async(file?:File)=>{if(!file)return;if(file.size>256*1024){setError("Файл завеликий. Максимум 256 КБ.");return}try{const content=await file.text();setDraft(v=>`${v}${v?"\n\n":""}[Вміст файлу ${file.name}]\n${content}`)}catch{setError("Не вдалося прочитати текстовий файл.")}};
  const startDrag=(e:ReactPointerEvent)=>{
    if(e.button!==0)return;
    window.clearTimeout(hoverTimer.current);
    window.clearTimeout(leaveTimer.current);
    skipHover.current=true;
    void getCurrentWindow().startDragging().catch(err=>setError(String(err)));
  };
  const fmt=(n:number)=>`${String(Math.floor(n/60)).padStart(2,"0")}:${String(n%60).padStart(2,"0")}`;

  return <main className={`app ${expanded?"is-open":""}`} onPointerEnter={scheduleExpand} onPointerLeave={scheduleCollapse}>
    <section className={`island theme-${prefs.theme}`} style={{"--island-width":`${prefs.width}px`} as CSSProperties}>
      <div className="pill" onPointerDown={e=>{if(e.target===e.currentTarget)startDrag(e)}}>
        <button type="button" className="drag-handle" onPointerDown={startDrag} aria-label="Перемістити острів" title="Перемістити острів"><Grip size={14}/></button><button className="pill-brand" aria-label="Відкрити Aurora Island" onClick={()=>invokeMode(!expanded)}><span className="brand-mark"><Sparkles size={14}/></span><span className="brand-name">aurora</span></button>
        <div className="pill-status">
          {prefs.modules.battery&&battery?.batteryPercent!=null&&<span className="battery-chip">{battery.charging?<BatteryCharging size={14}/>:<Battery size={14}/>} {battery.batteryPercent}%</span>}
          {prefs.modules.clock&&<span className="time-chip"><ClockDisplay kind="time"/></span>}
          {prefs.modules.media&&media?.available&&prefs.width>=275&&<button className="pill-media" aria-label="Відкрити музику" title={media.title||"Керування музикою"} onClick={()=>{setTab("media");invokeMode(true)}}><Music2 size={15}/></button>}
          <button className="pill-expand" aria-label={expanded?"Згорнути":"Розгорнути"} onClick={()=>void invokeMode(!expanded)}>{expanded?<ChevronDown size={16}/>:<Plus size={16}/>}</button>
        </div>
      </div>
      <AnimatePresence initial={false}>{expanded&&<motion.div className="panel" initial={{opacity:0,y:-8,scale:.985}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:-8,scale:.985}} transition={{duration:.24}}>
        <header className="panel-head"><div><div className="eyebrow">PERSONAL DESKTOP COMPANION</div><h1>{tab==="home"?"Центр керування":tab==="media"?"Музика та звук":tab==="chat"?"Aurora AI":tab==="tools"?"Інструменти":tab==="commands"?"Команди":"Налаштування"}</h1></div><div className="head-actions"><button className="icon-btn" title="Налаштування" onClick={()=>setTab(tab==="settings"?"home":"settings")}><Settings2 size={16}/></button><button className="icon-btn" title="Згорнути" onClick={()=>void invokeMode(false)}><Minus size={17}/></button><button className="icon-btn" title="Приховати в трей" onClick={()=>invoke("hide_to_tray").catch(()=>{})}><X size={16}/></button></div></header>
        <nav className="tabs"><button className={tab==="home"?"active":""} onClick={()=>setTab("home")}><Command size={15}/> Огляд</button>{(prefs.modules.media||prefs.modules.volume)&&<button className={tab==="media"?"active":""} onClick={()=>setTab("media")}><Music2 size={15}/> Музика</button>}<button className={tab==="chat"?"active":""} onClick={()=>setTab("chat")}><MessageCircle size={15}/> AI чат</button><button className={tab==="tools"?"active":""} onClick={()=>setTab("tools")}><Command size={15}/> Інструменти</button><button className={tab==="commands"?"active":""} onClick={()=>setTab("commands")}><Command size={15}/> Пошук</button><button className={tab==="settings"?"active":""} onClick={()=>setTab("settings")}><Settings2 size={15}/> Налаштування</button></nav>
        <div className="panel-body">
          {tab==="home"&&<div className="home-grid">
            <article className="welcome-card"><div className="card-top"><div className="weather-icon"><Sparkles size={20}/></div><span className="live-label"><i/> LIVE</span></div><div className="big-clock"><ClockDisplay kind="time"/></div><div className="date-line"><ClockDisplay kind="date"/></div><div className="welcome-foot"><span>Робочий простір</span><span className="online-dot">● Готово</span></div></article>
            <div className="module-stack">
              {prefs.modules.battery&&<article className="mini-card"><div className="module-icon battery-icon"><BatteryCharging size={16}/></div><div><b>Батарея</b><span>{battery?.batteryPercent!=null?`${battery.batteryPercent}%${battery.charging?" · заряджається":""}`:"Недоступно"}</span></div><div className="battery-track"><i style={{width:`${battery?.batteryPercent??0}%`}}/></div></article>}
              {prefs.modules.timer&&<article className="mini-card timer-card"><div className="module-icon timer-icon"><Timer size={16}/></div><div><b>Таймер</b><span>{fmt(seconds)} · {timerOn?"залишилось":"призупинено"}</span></div><div className="timer-controls"><button className="small-action" aria-label="Мінус 5 хвилин" title="Мінус 5 хвилин" onClick={()=>adjustTimer(-300)}><Minus size={13}/></button><button className="small-action" aria-label={timerOn?"Пауза":"Пуск"} onClick={toggleTimer}>{timerOn?<Pause size={14}/>:<Play size={14}/>}</button><button className="small-action" aria-label="Плюс 5 хвилин" title="Плюс 5 хвилин" onClick={()=>adjustTimer(300)}><Plus size={13}/></button></div></article>}
              {prefs.modules.media&&<article className="mini-card music-mini"><div className="module-icon music-icon"><Music2 size={16}/></div><div className="music-mini-meta"><b>{media?.available?(media.title||"Поточний трек"):"Музика"}</b><span>{media?.available?(media.artist||"Медіаплеєр Windows"):"Очікування відтворення"}</span></div><button className="small-action" aria-label="Відкрити керування музикою" onClick={()=>setTab("media")}><Music2 size={14}/></button></article>}
              <article className="mini-card"><div className="module-icon chat-icon"><Bot size={16}/></div><div><b>AI-помічник</b><span>{hasKey?"Ключ збережено DPAPI":"Потрібен API key"}</span></div><button className="small-action" onClick={()=>setTab("chat")}><MessageCircle size={14}/></button></article>
            </div>
            <div className="quick-row"><button onClick={()=>setTab("tools")}><Command size={15}/> Інструменти</button><button onClick={()=>setTab("chat")}><MessageCircle size={15}/> Запитати AI</button><button onClick={()=>invoke("open_personal_chatgpt").catch(e=>setError(String(e)))}><ExternalLink size={15}/> ChatGPT у браузері</button><button onClick={()=>void invokeMode(false)}><Grip size={15}/> Згорнути острів</button></div>
          </div>}
          {tab==="tools"&&<Toolbox onAskAI={value=>{setDraft(value);setTab("chat")}}/>}
          {tab==="commands"&&<CommandPalette onSelectTab={setTab} onAskAI={value=>{if(value){setDraft(value);setTab("chat")}}}/>}
          {tab==="media"&&<MediaPane media={prefs.modules.media?media:null} volume={prefs.modules.volume?volume:null} mediaEnabled={prefs.modules.media} volumeEnabled={prefs.modules.volume} busy={mediaBusy} error={audioError} onControl={controlMedia} onVolumeChange={changeVolume} onMute={()=>void toggleMute()} onRefresh={()=>{void refreshMedia();void refreshVolume();}}/>}
          {tab==="chat"&&<div className="chat-view"><div className="chat-topline"><span><ShieldCheck size={14}/> API-ключ захищений DPAPI</span><label className="attach-btn">Прикріпити файл<input type="file" accept=".txt,.md,.json,.csv,.log,.yaml,.yml,.xml" onChange={e=>attachText(e.target.files?.[0])}/></label></div><div className="messages">{messages.map((m,i)=><div className={`message ${m.role}`} key={i}><div className="avatar">{m.role==="assistant"?<Sparkles size={14}/>:"Я"}</div><div className="bubble">{m.role==="assistant"?<Suspense fallback={m.content}><ReactMarkdown>{m.content|| (busy&&i===messages.length-1?"Думаю…":"")}</ReactMarkdown></Suspense>:m.content}</div></div>)}<div ref={chatEnd}/></div>{error&&<div className="error-msg">{error}</div>}<form className="composer" onSubmit={e=>{e.preventDefault();void sendMessage()}}><textarea value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();void sendMessage()}}} placeholder="Напишіть повідомлення…"/><button type="submit" disabled={busy||!draft.trim()} aria-label="Надіслати"><Send size={16}/></button></form><div className="chat-foot">Відповіді надходять через офіційний OpenAI API · модель GPT-4.1 mini</div></div>}
          {tab==="settings"&&<div className="settings-view"><div className="settings-section"><div className="section-title">ОФОРМЛЕННЯ</div><div className="theme-grid">{(Object.keys(themeNames) as Theme[]).map(t=><button key={t} className={`theme-option ${prefs.theme===t?"selected":""}`} onClick={()=>updatePrefs({theme:t})}><span className={`theme-preview preview-${t}`}><i/></span><span>{themeNames[t]}</span></button>)}</div><Slider label="Ширина острова" value={prefs.width} min={240} max={340} suffix=" px" onChange={v=>updatePrefs({width:v})}/><Slider label="Заокруглення" value={prefs.radius} min={18} max={38} suffix=" px" onChange={v=>updatePrefs({radius:v})}/><Slider label="Прозорість" value={prefs.opacity} min={35} max={100} suffix="%" onChange={v=>updatePrefs({opacity:v})}/><label className="color-row">Акцентний колір<input type="color" value={prefs.accent} onChange={e=>updatePrefs({accent:e.target.value})}/></label>{prefs.theme==="glass"&&<><Slider label="Розмиття фону" value={prefs.blur} min={0} max={24} suffix=" px" onChange={v=>updatePrefs({blur:v})}/><Slider label="Інтенсивність скла" value={prefs.glass} min={10} max={100} suffix="%" onChange={v=>updatePrefs({glass:v})}/></>}<Slider label="Швидкість анімації" value={prefs.speed} min={35} max={140} suffix="%" onChange={v=>updatePrefs({speed:v})}/></div>
            <div className="settings-section"><div className="section-title">МОДУЛІ</div><Toggle label="Годинник" checked={prefs.modules.clock} onChange={v=>updatePrefs({modules:{...prefs.modules,clock:v}})}/><Toggle label="Батарея (Windows API)" checked={prefs.modules.battery} onChange={v=>updatePrefs({modules:{...prefs.modules,battery:v}})}/><Toggle label="Таймер" checked={prefs.modules.timer} onChange={v=>updatePrefs({modules:{...prefs.modules,timer:v}})}/><Toggle label="Керування музикою (SMTC)" checked={prefs.modules.media} onChange={v=>updatePrefs({modules:{...prefs.modules,media:v}})}/><Toggle label="Системна гучність" checked={prefs.modules.volume} onChange={v=>updatePrefs({modules:{...prefs.modules,volume:v}})}/></div>
            <div className="settings-section"><div className="section-title">ПОВЕДІНКА</div><Toggle label="Розгортати при наведенні (із затримкою)" checked={prefs.hoverExpand} onChange={v=>updatePrefs({hoverExpand:v})}/><Toggle label="Згортати після відведення курсора" checked={prefs.autoHide} onChange={v=>updatePrefs({autoHide:v})}/><Toggle label="Запускати з Windows" checked={prefs.startup} onChange={v=>{invoke("set_startup",{enabled:v}).then(()=>updatePrefs({startup:v})).catch(e=>setError(String(e)))}}/><div className="openai-key"><div><b>OpenAI API key</b><span>{hasKey?"Ключ зашифрований для вашого облікового запису Windows":"Зберігається через Windows DPAPI"}</span></div><div className="key-row"><input type="password" value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder="sk-…"/><button onClick={()=>void saveKey()} disabled={!apiKey}>Зберегти</button></div>{error&&<div className="error-msg">{error}</div>}</div></div>
          </div>}
        </div>
        <footer className="panel-footer"><span><span className="footer-mark"><Sparkles size={11}/></span> AURORA ISLAND <span className="footer-version">v0.1 · Windows</span></span><span>Перетягніть острів, щоб змінити позицію</span></footer>
      </motion.div>}</AnimatePresence>
    </section>
  </main>
}

function Slider({label,value,min,max,suffix,onChange}:{label:string;value:number;min:number;max:number;suffix:string;onChange:(v:number)=>void}){return <label className="slider-row"><span>{label}<b>{value}{suffix}</b></span><input type="range" min={min} max={max} value={value} onChange={e=>onChange(Number(e.target.value))}/></label>}
function Toggle({label,checked,onChange}:{label:string;checked:boolean;onChange:(v:boolean)=>void}){return <label className="toggle-row"><span>{label}</span><input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)}/><i/></label>}
function ClockDisplay({kind}:{kind:"time"|"date"}){const [now,setNow]=useState(()=>new Date());useEffect(()=>{const id=window.setInterval(()=>setNow(new Date()),1000);return()=>clearInterval(id)},[]);return <>{kind==="time"?now.toLocaleTimeString("uk-UA",{hour:"2-digit",minute:"2-digit"}):now.toLocaleDateString("uk-UA",{weekday:"long",day:"numeric",month:"long"})}</>}
