import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type CSSProperties } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
const ReactMarkdown = lazy(() => import("react-markdown"));
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize, PhysicalPosition, currentMonitor, monitorFromPoint } from "@tauri-apps/api/window";
import { createTransitionGate, stableWindowGeometry } from "./windowBehavior";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { Battery, BatteryCharging, Bot, ChevronDown, ChevronUp, Command, ExternalLink, Grip, MessageCircle, Minus, Pause, Play, Plus, Send, Settings2, ShieldCheck, Sparkles, Timer, Music2, X } from "lucide-react";
import { defaults, type Message, type Preferences, type Tab, type Theme } from "./types";
import { MediaPane, type MediaState, type VolumeState } from "./MediaPane";
import { Toolbox } from "./Toolbox";
import { CommandPalette } from "./CommandPalette";
import { useMagneticPill } from "./useMagneticPill";
import { useOutsideCollapse } from "./useOutsideCollapse";
import { useNativeAudioEvents } from "./useNativeAudioEvents";
import { CompactActivity, useLiveActivity, activityIcons, type Activity } from "./LiveActivity";
import { useClipboardWatcher, useReminderNotifications, showWindowsNotification } from "./nativeIntegration";

const themeNames: Record<Theme,string> = { classic:"Classic", glass:"Liquid Glass", soft:"Soft Minimal", neon:"Neon" };
const initialMessages: Message[] = [{ role:"assistant", content:"Привіт! Я Aurora AI. Додайте власний OpenAI API key у налаштуваннях чату, щоб почати." }];

function loadPrefs(): Preferences {
  try {
    const raw = JSON.parse(localStorage.getItem("aurora:prefs") || "{}");
    const saved = { ...defaults, ...raw, modules: { ...defaults.modules, ...raw?.modules } };
    return {
      ...saved,
      width: Math.min(340, Math.max(240, Number(saved.width) || defaults.width)),
      radius: Math.min(38, Math.max(18, Number(saved.radius) || defaults.radius)),
      speed: Math.min(140, Math.max(35, Number(saved.speed) || defaults.speed)),
      opacity: Math.min(100, Math.max(35, Number(saved.opacity) || defaults.opacity)),
      blur: Math.min(30, Math.max(0, Number(saved.blur) || 0)),
      hoverExpand: false
    };
  } catch { return defaults; }
}
function readMessages(): Message[] { try { return JSON.parse(localStorage.getItem("aurora:chat") || "null") || initialMessages; } catch { return initialMessages; } }

export default function App() {
  const [prefs,setPrefs]=useState(loadPrefs); const [expanded,setExpanded]=useState(false);
  const [tab,setTab]=useState<Tab>(()=>{
    try {
      const previous=localStorage.getItem("aurora:last-tab");
      return (["home","media","chat","tools","commands","settings"] as string[]).includes(previous||"") ? previous as Tab : "home";
    }catch{return "home"}
  });
  const [hidden,setHidden]=useState(()=>{try{return localStorage.getItem("aurora:hidden")==="true"}catch{return false}});
  const hiddenLatest=useRef(hidden); hiddenLatest.current=hidden;
  const [fullscreenHidden,setFullscreenHidden]=useState(false);
  useEffect(()=>{
    let active=true,pending=false;
    const poll=async()=>{
      if(pending)return;
      pending=true;
      try{
        const next=await invoke<boolean>('sync_window_environment',{enabled:prefs.hideInFullscreen});
        if(active)setFullscreenHidden(next);
      }catch(e){console.warn('Fullscreen policy unavailable',e);}
      finally{pending=false;}
    };
    void poll();
    const timer=window.setInterval(()=>void poll(),750);
    return()=>{active=false;window.clearInterval(timer);};
  },[prefs.hideInFullscreen]);
  const [toast,setToast]=useState<string|null>(null);
  useClipboardWatcher(prefs.clipboardWatch);
  useReminderNotifications(prefs.notifications);
  const pillRef = useMagneticPill(prefs.cursorPull&&!hidden&&!fullscreenHidden, expanded);
  const [battery,setBattery]=useState<{batteryPercent:number|null;charging:boolean|null}|null>(null); const [messages,setMessages]=useState<Message[]>(readMessages); const [draft,setDraft]=useState(""); const [busy,setBusy]=useState(false); const [hasKey,setHasKey]=useState(false); const [apiKey,setApiKey]=useState(""); const [seconds,setSeconds]=useState(300); const [timerOn,setTimerOn]=useState(false); const [error,setError]=useState("");
  const [media,setMedia]=useState<MediaState|null>(null);
  const [volume,setVolume]=useState<VolumeState|null>(null);
  const [audioError,setAudioError]=useState("");
  const [mediaBusy,setMediaBusy]=useState(false);
  const volumeTimer=useRef<number|undefined>(undefined);
  const lastVolumeInteraction=useRef(0);
  useNativeAudioEvents({ enabled:prefs.systemHud, volumeEnabled:prefs.modules.volume,
    mediaEnabled:prefs.modules.media, expanded, hidden:hidden||fullscreenHidden, media,
    lastManualInteraction:lastVolumeInteraction, onToast:setToast });
  const leaveTimer=useRef<number|undefined>(undefined);
  const hoverTimer=useRef<number|undefined>(undefined);
  const layoutQueue=useRef<Promise<void>>(Promise.resolve());
  const collapseResizeTimer=useRef<number|undefined>(undefined);
  const transitionGate=useRef(createTransitionGate());
  const reducedMotion=useReducedMotion();
  const chatEnd=useRef<HTMLDivElement>(null);
  const dragAnchor=useRef<{x:number;y:number;at:number}|null>(null);
  const suppressClick=useRef(false);
  const timerInitial=useRef(300);
  // A single stable WebView geometry. Only the Win32 HIT REGION changes
  // between compact and expanded; the actual WebView never resizes on click.
  const initializedNative = useRef(false);
  const previousExpanded = useRef(false);
  const morphMs = reducedMotion?0:Math.max(280, Math.min(1120, Math.round(520 * 75 / prefs.speed)));
  const updateHitRegion=useCallback((open:boolean, hide:boolean, width:number, radius:number)=>{
    layoutQueue.current=layoutQueue.current.catch(()=>{}).then(async()=>{
      await invoke("set_native_region",{expanded:open, pillWidth:width, radius, hidden:hide});
    });
    return layoutQueue.current;
  },[]);
  const initializeWindow=useCallback(()=>{
    layoutQueue.current=layoutQueue.current.catch(()=>{}).then(async()=>{
      if(initializedNative.current)return;
      const w=getCurrentWindow();
      const scale=await w.scaleFactor();
      const previous=await w.outerSize();
      const position=await w.outerPosition();
      let monitor=await currentMonitor().catch(()=>null);
      const width=568;
      // Match viewport to the monitor once. Never change dimensions during
      // the compact -> expanded animation: it stutters DWM/WebView2.
      const height=monitor
        ? Math.max(360,Math.min(700,Math.floor(monitor.size.height/scale)-24))
        : 690;
      let x=position.x+(previous.width-width*scale)/2;
      let y=position.y;
      try {
        const saved=JSON.parse(localStorage.getItem("aurora:position")||"null");
        if(Number.isFinite(saved?.centerX)&&Number.isFinite(saved?.y)){
          x=saved.centerX-width*scale/2;
          y=saved.y;
          monitor=await monitorFromPoint(saved.centerX,saved.y+22*scale).catch(()=>null)??monitor;
        }
      }catch{}
      const geometry=monitor?stableWindowGeometry(scale,{x,y,width:width*scale},
        {...monitor.workArea.position,...monitor.workArea.size}):{x,y,width,height};
      await w.setSize(new LogicalSize(geometry.width,geometry.height));
      await w.setPosition(new PhysicalPosition(Math.round(geometry.x),Math.round(geometry.y)));
      await invoke("set_native_region",{
        expanded:false,pillWidth:prefs.width,radius:prefs.radius,hidden,
      });
      // Material and borderless state must finish BEFORE the window is shown,
      // otherwise WebView2 can flash the original Windows title bar.
      await invoke("set_native_material",{theme:prefs.theme}).catch(err=>{
        console.warn("Native material fallback:",err);
      });
      initializedNative.current=true;
      await w.show(); // Never display the native window before mask/chrome setup.
    });
    return layoutQueue.current;
  },[]);

  const invokeMode=(open:boolean)=>{
    window.clearTimeout(collapseResizeTimer.current);
    window.clearTimeout(hoverTimer.current);
    window.clearTimeout(leaveTimer.current);
    const wasPending=transitionGate.current.pending;
    const token=transitionGate.current.begin(open);
    if(token===null)return;
    if(!open){
      setExpanded(false);
      if(wasPending&&!expanded)void updateHitRegion(false,hidden,prefs.width,prefs.radius).catch(e=>setError(String(e)));
      return;
    }
    if(expanded){transitionGate.current.finish(token);return;}
    if(hidden)setHidden(false);
    void updateHitRegion(true,false,prefs.width,prefs.radius).then(()=>{
      if(transitionGate.current.finish(token)){
        setExpanded(true);
      }
    }).catch(err=>{
      if(transitionGate.current.finish(token))setError("Не вдалося розкрити острів: "+String(err));
    });
  };

  const invokeModeRef=useRef(invokeMode);invokeModeRef.current=invokeMode;
  const latestLayout=useRef({expanded,hidden,width:prefs.width,radius:prefs.radius});
  latestLayout.current={expanded,hidden,width:prefs.width,radius:prefs.radius};
  useEffect(()=>{
    let active=true,dispose:(()=>void)|undefined;
    void getCurrentWindow().onScaleChanged(()=>{
      layoutQueue.current=layoutQueue.current.catch(()=>{}).then(async()=>{
        if(!active||!initializedNative.current)return;
        const w=getCurrentWindow();
        const [scale,size,position,monitor]=await Promise.all([w.scaleFactor(),w.outerSize(),w.outerPosition(),currentMonitor()]);
        if(!monitor)return;
        const geometry=stableWindowGeometry(scale,{...position,width:size.width},
          {...monitor.workArea.position,...monitor.workArea.size});
        await w.setSize(new LogicalSize(geometry.width,geometry.height));
        await w.setPosition(new PhysicalPosition(geometry.x,geometry.y));
        const next=latestLayout.current;
        await invoke('set_native_region',{expanded:next.expanded,hidden:next.hidden,pillWidth:next.width,radius:next.radius});
      });
      void layoutQueue.current.catch(e=>{if(active)setError(String(e));});
    }).then(unlisten=>{if(active)dispose=unlisten;else unlisten();}).catch(console.warn);
    return()=>{active=false;dispose?.();};
  },[]);
  const hideToHandle=()=>{
    transitionGate.current.begin(false);
    window.clearTimeout(collapseResizeTimer.current);
    setExpanded(false);
    setHidden(true);
  };
  const restoreFromHandle=()=>{
    setHidden(false);
    setExpanded(false);
  };
  useOutsideCollapse(expanded&&!hidden&&!fullscreenHidden,prefs.autoHide,()=>invokeMode(false));
  useEffect(()=>{try{localStorage.setItem("aurora:last-tab",tab)}catch{}},[tab]);
  useEffect(()=>{try{localStorage.setItem("aurora:hidden",String(hidden))}catch{}},[hidden]);
  useEffect(()=>{
    if(!toast)return;
    const id=window.setTimeout(()=>setToast(null),4600);
    return()=>window.clearTimeout(id);
  },[toast]);
  const updatePrefs=(next:Partial<Preferences>)=>setPrefs(p=>({...p,...next}));
  useEffect(()=>{localStorage.setItem("aurora:prefs",JSON.stringify(prefs));document.documentElement.dataset.theme=prefs.theme;document.documentElement.style.setProperty("--pill-width",`${prefs.width}px`);document.documentElement.style.setProperty("--glass-blur",`${prefs.blur}px`);document.documentElement.style.setProperty("--glass-strength",String(prefs.glass/100));document.documentElement.style.setProperty("--motion-speed",`${prefs.speed/100}`);document.documentElement.style.setProperty("--surface-opacity",String(prefs.opacity/100));document.documentElement.style.setProperty("--island-radius",`${prefs.radius}px`);document.documentElement.style.setProperty("--accent",prefs.accent);},[prefs]);
  useEffect(()=>{
    let alive=true;
    void initializeWindow().catch(e=>{
      if(alive)setError("Не вдалося підготувати вікно: "+String(e));
    });
    return()=>{alive=false};
  },[initializeWindow]);
  useEffect(()=>{
    window.clearTimeout(collapseResizeTimer.current);
    if(!initializedNative.current)return;
    if(transitionGate.current.pending&&!expanded&&!hidden)return;
    const wasOpen=previousExpanded.current;
    previousExpanded.current=expanded;
    if(hidden){
      void updateHitRegion(false,true,prefs.width,prefs.radius);
    }else if(expanded){
      // Open requests already switched the native hit mask before React morph.
    }else if(wasOpen){
      // Wait for CSS clip-path animation to finish before tightening hit tests.
      collapseResizeTimer.current=window.setTimeout(()=>{
        if(!transitionGate.current.pending)
          void updateHitRegion(false,false,prefs.width,prefs.radius);
      },morphMs+90);
    }else{
      void updateHitRegion(false,false,prefs.width,prefs.radius);
    }
    return()=>window.clearTimeout(collapseResizeTimer.current);
  },[expanded,hidden,prefs.width,prefs.radius,morphMs,updateHitRegion]);
  // Theme changes are paint-only; touching Win32 non-client flags here caused
  // intermittent titlebar flashes. Borderless is initialized once and
  // reasserted natively on focus and tray/global-hotkey restore.
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
          if(active&&!hiddenLatest.current)localStorage.setItem("aurora:position",JSON.stringify({centerX:p.x+size.width/2,y:p.y}));
        } catch { /* Never block the UI on location persistence. */ }
      },650);
    }).then(dispose=>{if(active)unlisten=dispose;else dispose()}).catch(()=>{});
    return()=>{active=false;window.clearTimeout(saveTimer);unlisten?.()};
  },[]);
  useEffect(()=>{invoke<{batteryPercent:number|null;charging:boolean|null}>("system_info").then(setBattery).catch(()=>{});const id=window.setInterval(()=>invoke<{batteryPercent:number|null;charging:boolean|null}>("system_info").then(setBattery).catch(()=>{}),60000);return()=>clearInterval(id)},[]);
  useEffect(()=>{invoke<boolean>("has_api_key").then(setHasKey).catch(()=>{});},[]);
  useEffect(()=>{
    let cancelled=false;
    invoke("set_global_hotkey",{enabled:prefs.globalHotkey}).catch(e=>{
      if(!cancelled)setError(`Глобальна клавіша: ${String(e)}`);
    });
    return()=>{cancelled=true};
  },[prefs.globalHotkey]);
  useEffect(()=>{
    let active=true;
    let unlisten:(()=>void)|undefined;
    listen("aurora:open-commands",()=>{
      if(!active)return;
      window.clearTimeout(hoverTimer.current);
      window.clearTimeout(leaveTimer.current);
      setTab("commands");
      invokeModeRef.current(true);
    }).then(dispose=>{if(active)unlisten=dispose;else dispose()}).catch(console.warn);
    return()=>{active=false;unlisten?.()};
  },[]);
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
      if(remaining===0){setTimerOn(false);timerDeadline.current=null;setToast("Таймер завершився");
        if(prefs.notifications)void showWindowsNotification("Aurora Island","Таймер завершився").catch(console.warn);
      }
    };
    tick();
    const id=window.setInterval(tick,250);
    return()=>clearInterval(id);
  },[timerOn,prefs.notifications]);
  const toggleTimer=()=>{
    if(timerOn){setTimerOn(false);timerDeadline.current=null;return;}
    const duration=seconds||300;
    if(!seconds)setSeconds(duration);
    timerInitial.current=duration;
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
  useEffect(()=>{const onKey=(e:KeyboardEvent)=>{
    if(e.key==="Escape"&&(expanded||transitionGate.current.pending)){e.preventDefault();invokeModeRef.current(false)}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){
      e.preventDefault();setTab("commands");invokeModeRef.current(true);
    }
  };window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey)},[expanded]);
  const sendMessage=async()=>{const text=draft.trim();if(!text||busy)return;setError("");setDraft("");const next=[...messages,{role:"user" as const,content:text}];setMessages([...next,{role:"assistant",content:""}]);setBusy(true);
    try { await invoke("stream_chat",{messages:next,model:"gpt-4.1-mini"}); }
    catch(e){setError(String(e));setMessages(m=>m.filter((x,i)=>!(x.role==="assistant"&&i===m.length-1&&x.content==="")));}
    finally{setBusy(false)}
  };
  const saveKey=async()=>{try{await invoke("save_api_key",{key:apiKey});setHasKey(true);setApiKey("");setError("")}catch(e){setError(String(e))}};
  const attachText=async(file?:File)=>{if(!file)return;if(file.size>256*1024){setError("Файл завеликий. Максимум 256 КБ.");return}try{const content=await file.text();setDraft(v=>`${v}${v?"\n\n":""}[Вміст файлу ${file.name}]\n${content}`)}catch{setError("Не вдалося прочитати текстовий файл.")}};
  const beginDrag=(e:ReactPointerEvent)=>{
    if(e.button!==0||hidden)return;
    dragAnchor.current={x:e.clientX,y:e.clientY,at:performance.now()};
    suppressClick.current=false;
  };
  const moveDrag=(e:ReactPointerEvent)=>{
    const start=dragAnchor.current;
    if(!start||(e.buttons&1)===0||prefs.lockPosition)return;
    const dx=e.clientX-start.x,dy=e.clientY-start.y,dt=Math.max(16,performance.now()-start.at);
    if(dy<-22&&Math.abs(dx)<46&&dy/dt<-.65){
      dragAnchor.current=null;suppressClick.current=true;hideToHandle();
    }else if(Math.hypot(dx,dy)>=7){
      dragAnchor.current=null;suppressClick.current=true;
      window.clearTimeout(hoverTimer.current);
      void getCurrentWindow().startDragging().catch(err=>setError(String(err)));
    }
  };
  const endDrag=()=>{dragAnchor.current=null};
  const fmt=(n:number)=>`${String(Math.floor(n/60)).padStart(2,"0")}:${String(n%60).padStart(2,"0")}`;
  const activities=useMemo<Activity[]>(()=>{
    const list:Activity[]=[];
    if(prefs.modules.timer&&timerOn) list.push({
      id:"timer",title:"Таймер",detail:fmt(seconds),
      icon:activityIcons.timer,progress:Math.max(0,Math.min(1,seconds/Math.max(60,timerInitial.current))),
      onOpen:()=>{setTab("home");invokeMode(true);}
    });
    if(prefs.modules.media&&media?.available&&media.playing) list.push({
      id:"music",title:media.title?.slice(0,34)||"Відтворення",
      detail:media.artist?.slice(0,32)||"Музика Windows",
      icon:activityIcons.music,
      progress:media.durationSeconds>0?media.positionSeconds/media.durationSeconds:undefined,
      onOpen:()=>{setTab("media");invokeMode(true);}
    });
    if(prefs.modules.battery&&battery?.charging&&battery.batteryPercent!=null) list.push({
      id:"battery",title:"Заряджання",detail:`${battery.batteryPercent}%`,
      icon:activityIcons.battery,progress:battery.batteryPercent/100,
      onOpen:()=>{setTab("home");invokeMode(true);}
    });
    return list;
  },[prefs.modules.timer,prefs.modules.media,prefs.modules.battery,timerOn,seconds,media,battery]);
  const live=useLiveActivity(activities);
  const smartToggle=()=>{
    if(!expanded&&prefs.smartOpen){
      if(live.selected?.id==="music")setTab("media");
      else if(live.selected?.id==="timer")setTab("home");
    }
    invokeMode(!expanded&&!transitionGate.current.pending);
  };

  return <main className={`app ${expanded?"is-open":""} ${hidden?"is-hidden":""} ${fullscreenHidden?"fullscreen-hidden":""}`} style={{"--morph-duration":`${morphMs}ms`} as CSSProperties}>
    <section className={`island theme-${prefs.theme}`} style={{"--island-width":`${prefs.width}px`} as CSSProperties}>
      <div className="island-morph" aria-hidden="true">
        <span className="morph-layer morph-compact"/>
        <span className="morph-layer morph-full"/>
        <span className="morph-rim"/>
      </div>
      {hidden?<button className="island-restore" onClick={restoreFromHandle} aria-label="Повернути Aurora Island" title="Повернути Aurora Island"><span/></button>:<>
      <div ref={pillRef} className="pill"
        onPointerDown={e=>{if(e.target===e.currentTarget)beginDrag(e)}} onPointerMove={moveDrag}
        onPointerUp={endDrag} onPointerCancel={endDrag}
        onClick={e=>{if(e.target===e.currentTarget&&!suppressClick.current)smartToggle();suppressClick.current=false;}}
        onWheel={e=>{if(!expanded)live.rotate(e)}}>
        <svg className="magnetic-svg" aria-hidden="true" focusable="false"><path className="magnetic-shape" /></svg>
        <button type="button" className="drag-handle" onPointerDown={beginDrag} aria-label="Перемістити острів" title="Перемістити острів"><Grip size={14}/></button>
        <button className="pill-brand" aria-label="Відкрити Aurora Island" onClick={smartToggle}>
          <span className="brand-mark"><Sparkles size={14}/></span>
          {!live.selected&&!toast&&<span className="brand-name">aurora</span>}
        </button>
        <div className="pill-status">
          {!expanded&&toast&&<span className="live-toast" role="status">{toast}</span>}
          {!expanded&&!toast&&live.selected&&<button className="live-open" onClick={live.selected.onOpen} title="Відкрити активність"><CompactActivity activity={live.selected} count={live.count}/></button>}
          {!expanded&&!toast&&!live.selected&&prefs.modules.battery&&battery?.batteryPercent!=null&&<span className="battery-chip">{battery.charging?<BatteryCharging size={14}/>:<Battery size={14}/>} {battery.batteryPercent}%</span>}
          {!expanded&&!toast&&!live.selected&&prefs.modules.clock&&<span className="time-chip"><ClockDisplay kind="time"/></span>}
          {!expanded&&!toast&&!live.selected&&prefs.modules.media&&media?.available&&prefs.width>=275&&<button className="pill-media" aria-label="Відкрити музику" title={media.title||"Керування музикою"} onClick={()=>{setTab("media");invokeMode(true)}}><Music2 size={15}/></button>}
          <button className="pill-expand" aria-label={expanded?"Згорнути":"Розгорнути"} onClick={smartToggle}>{expanded?<ChevronDown size={16}/>:<Plus size={16}/>}</button>
        </div>
      </div>
      <AnimatePresence initial={false}>{expanded&&<motion.div className="panel" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:morphMs/1400,ease:[.22,1,.36,1]}}>
        <header className="panel-head" onPointerDown={e=>{if(!(e.target as HTMLElement).closest("button, input, textarea, a"))beginDrag(e)}} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}><div><div className="eyebrow">PERSONAL DESKTOP COMPANION</div><h1>{tab==="home"?"Центр керування":tab==="media"?"Музика та звук":tab==="chat"?"Aurora AI":tab==="tools"?"Інструменти":tab==="commands"?"Команди":"Налаштування"}</h1></div><div className="head-actions"><button className="icon-btn" title="Налаштування" onClick={()=>setTab(tab==="settings"?"home":"settings")}><Settings2 size={16}/></button><button className="icon-btn" title="Згорнути" onClick={()=>void invokeMode(false)}><Minus size={17}/></button><button className="icon-btn" title="Сховати до смужки" onClick={hideToHandle}><ChevronUp size={17}/></button><button className="icon-btn" title="Приховати в трей" onClick={()=>invoke("hide_to_tray").catch(()=>{})}><X size={16}/></button></div></header>
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
          {tab==="settings"&&<div className="settings-view"><div className="settings-section"><div className="section-title">ОФОРМЛЕННЯ</div><div className="theme-grid">{(Object.keys(themeNames) as Theme[]).map(t=><button key={t} className={`theme-option ${prefs.theme===t?"selected":""}`} onClick={()=>updatePrefs({theme:t})}><span className={`theme-preview preview-${t}`}><i/></span><span>{themeNames[t]}</span></button>)}</div><Slider label="Ширина острова" value={prefs.width} min={240} max={340} suffix=" px" onChange={v=>updatePrefs({width:v})}/><Slider label="Заокруглення" value={prefs.radius} min={18} max={38} suffix=" px" onChange={v=>updatePrefs({radius:v})}/><Slider label="Прозорість" value={prefs.opacity} min={35} max={100} suffix="%" onChange={v=>updatePrefs({opacity:v})}/><label className="color-row">Акцентний колір<input type="color" value={prefs.accent} onChange={e=>updatePrefs({accent:e.target.value})}/></label>{prefs.theme==="glass"&&<><Slider label="М’якість відблисків" value={prefs.blur} min={0} max={30} suffix=" px" onChange={v=>updatePrefs({blur:v})}/><Slider label="Інтенсивність скла" value={prefs.glass} min={10} max={100} suffix="%" onChange={v=>updatePrefs({glass:v})}/></>}<Slider label="Швидкість анімації" value={prefs.speed} min={35} max={140} suffix="%" onChange={v=>updatePrefs({speed:v})}/></div>
            <div className="settings-section"><div className="section-title">МОДУЛІ</div><Toggle label="Годинник" checked={prefs.modules.clock} onChange={v=>updatePrefs({modules:{...prefs.modules,clock:v}})}/><Toggle label="Батарея (Windows API)" checked={prefs.modules.battery} onChange={v=>updatePrefs({modules:{...prefs.modules,battery:v}})}/><Toggle label="Таймер" checked={prefs.modules.timer} onChange={v=>updatePrefs({modules:{...prefs.modules,timer:v}})}/><Toggle label="Керування музикою (SMTC)" checked={prefs.modules.media} onChange={v=>updatePrefs({modules:{...prefs.modules,media:v}})}/><Toggle label="Системна гучність" checked={prefs.modules.volume} onChange={v=>updatePrefs({modules:{...prefs.modules,volume:v}})}/></div>
            <div className="settings-section"><div className="section-title">ПОВЕДІНКА</div><Toggle label="Приховувати над повноекранними програмами" checked={prefs.hideInFullscreen} onChange={v=>updatePrefs({hideInFullscreen:v})}/><Toggle label="Згортати після відведення курсора" checked={prefs.autoHide} onChange={v=>updatePrefs({autoHide:v})}/>
              <Toggle label="Пружний край, що тягнеться до курсора" checked={prefs.cursorPull} onChange={v=>updatePrefs({cursorPull:v})}/>
              <Toggle label="Заблокувати положення острова" checked={prefs.lockPosition} onChange={v=>updatePrefs({lockPosition:v})}/>
              <Toggle label="Розумне відкриття активності" checked={prefs.smartOpen} onChange={v=>updatePrefs({smartOpen:v})}/>
              <Toggle label="Системний HUD: гучність і нова музика" checked={prefs.systemHud} onChange={v=>updatePrefs({systemHud:v})}/>
              <Toggle label="Глобальна клавіша Ctrl+Alt+Space" checked={prefs.globalHotkey} onChange={v=>updatePrefs({globalHotkey:v})}/>
              <Toggle label="Автоматична історія буфера обміну" checked={prefs.clipboardWatch} onChange={v=>updatePrefs({clipboardWatch:v})}/>
              <p className="tool-help">Автозбереження буфера вимкнено за замовчуванням. При ввімкненні нові записи відстежуються у Windows та зберігаються тільки в сесії, без запису на диск. У буфер можуть потрапити паролі й особисті дані.</p>
              <Toggle label="Сповіщення Windows (таймер і нагадування)" checked={prefs.notifications} onChange={v=>updatePrefs({notifications:v})}/>
              {prefs.notifications&&<button className="native-test" onClick={()=>void showWindowsNotification("Aurora Island","Системні сповіщення увімкнені").catch(e=>setError(String(e)))}>Перевірити сповіщення</button>}<Toggle label="Запускати з Windows" checked={prefs.startup} onChange={v=>{invoke("set_startup",{enabled:v}).then(()=>updatePrefs({startup:v})).catch(e=>setError(String(e)))}}/><div className="openai-key"><div><b>OpenAI API key</b><span>{hasKey?"Ключ зашифрований для вашого облікового запису Windows":"Зберігається через Windows DPAPI"}</span></div><div className="key-row"><input type="password" value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder="sk-…"/><button onClick={()=>void saveKey()} disabled={!apiKey}>Зберегти</button></div>{error&&<div className="error-msg">{error}</div>}</div></div>
          </div>}
        </div>
        <footer className="panel-footer"><span><span className="footer-mark"><Sparkles size={11}/></span> AURORA ISLAND <span className="footer-version">v0.1 · Windows</span></span><span>Перетягніть острів, щоб змінити позицію</span></footer>
      </motion.div>}</AnimatePresence>
      </>}
    </section>
  </main>
}

function Slider({label,value,min,max,suffix,onChange}:{label:string;value:number;min:number;max:number;suffix:string;onChange:(v:number)=>void}){return <label className="slider-row"><span>{label}<b>{value}{suffix}</b></span><input type="range" min={min} max={max} value={value} onChange={e=>onChange(Number(e.target.value))}/></label>}
function Toggle({label,checked,onChange}:{label:string;checked:boolean;onChange:(v:boolean)=>void}){return <label className="toggle-row"><span>{label}</span><input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)}/><i/></label>}
function ClockDisplay({kind}:{kind:"time"|"date"}){const [now,setNow]=useState(()=>new Date());useEffect(()=>{const id=window.setInterval(()=>setNow(new Date()),1000);return()=>clearInterval(id)},[]);return <>{kind==="time"?now.toLocaleTimeString("uk-UA",{hour:"2-digit",minute:"2-digit"}):now.toLocaleDateString("uk-UA",{weekday:"long",day:"numeric",month:"long"})}</>}
