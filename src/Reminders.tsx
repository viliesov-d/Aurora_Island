import { useEffect, useState } from "react";
import { Bell, CheckCircle2, Trash2 } from "lucide-react";

type Reminder = { id: number; title: string; at: number; done: boolean };
const read = (): Reminder[] => {
  try {const value = JSON.parse(localStorage.getItem("aurora:reminders") || "[]");return Array.isArray(value)?value.filter(x=>typeof x.title==="string"&&typeof x.at==="number"):[];} catch {return [];}
};
function localDateTime(date: Date): string {
  const pad=(x:number)=>String(x).padStart(2,"0");
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
export function Reminders() {
  const [items,setItems]=useState<Reminder[]>(read);
  const [title,setTitle]=useState("");
  const [at,setAt]=useState(()=>localDateTime(new Date(Date.now()+30*60000)));
  const [now,setNow]=useState(Date.now());
  const [notice,setNotice]=useState("");
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer)},[]);
  useEffect(()=>{try{localStorage.setItem("aurora:reminders",JSON.stringify(items))}catch{}},[items]);
  const due=items.filter(x=>!x.done&&x.at<=now);
  const create=()=>{
    const date=new Date(at).getTime();
    if(!title.trim()||!Number.isFinite(date)||date<Date.now()){setNotice("Введіть текст і майбутню дату.");return}
    setItems(v=>[...v,{id:Date.now(),title:title.trim().slice(0,200),at:date,done:false}]);
    setTitle("");setNotice("Нагадування збережено локально.");
  };
  return <div className="tool-section">
    <div className="tool-heading"><Bell size={16}/> Нагадування</div>
    <p className="tool-help">Нагадування показуються в острові, поки застосунок працює. Це не системна служба Windows.</p>
    {due.map(x=><div className="tool-item reminder-due" role="alert" key={x.id}><Bell size={16}/><span>Час нагадування: {x.title}</span><button onClick={()=>setItems(v=>v.map(y=>y.id===x.id?{...y,done:true}:y))}><CheckCircle2 size={15}/> Готово</button></div>)}
    <input className="tool-input" value={title} onChange={e=>setTitle(e.target.value)} placeholder="Про що нагадати?"/>
    <div className="tool-inline"><input type="datetime-local" value={at} onChange={e=>setAt(e.target.value)}/><button onClick={create}>Додати</button></div>
    {notice&&<p className="tool-help">{notice}</p>}
    {items.slice().sort((a,b)=>Number(a.done)-Number(b.done)||a.at-b.at).map(x=><div className="tool-item" key={x.id}>
      <span>{x.done?"✓ ":""}{x.title}<small style={{display:"block",opacity:.65}}>{new Date(x.at).toLocaleString("uk-UA")}</small></span>
      {!x.done&&<button title="Виконано" onClick={()=>setItems(v=>v.map(y=>y.id===x.id?{...y,done:true}:y))}><CheckCircle2 size={15}/></button>}
      <button title="Видалити" onClick={()=>setItems(v=>v.filter(y=>y.id!==x.id))}><Trash2 size={15}/></button>
    </div>)}
  </div>;
}
