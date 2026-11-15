import { useMemo, useState } from "react";
import { Calculator, Command, Globe, Search, Sparkles } from "lucide-react";

type Result = { label: string; description: string; onClick: () => void };
const openWeb = (url:string) => {window.open(url,"_blank","noopener,noreferrer")};
function arithmetic(source: string): number {
  const tokens=source.match(/\d+(?:\.\d+)?|[()+\-*/%]/g) || [];
  if(tokens.join("")!==source.replace(/\s/g,"") || tokens.length>100) throw Error("Некоректний вираз");
  let at=0;
  const factor = ():number => {
    const next=tokens[at++];
    if(next==="-") return -factor();
    if(next==="+") return factor();
    if(next==="(") { const value=expr();if(tokens[at++]!==")")throw Error("Не закрито дужку");return value; }
    if(!next||!/^\d/.test(next)) throw Error("Очікується число");
    return Number(next);
  };
  const term=():number=> {let n=factor();while(["*","/","%"].includes(tokens[at])){const op=tokens[at++];const b=factor();n=op==="*"?n*b:op==="/"?n/b:n%b;}return n;};
  const expr=():number=>{let n=term();while(["+","-"].includes(tokens[at])){const op=tokens[at++];const b=term();n=op==="+"?n+b:n-b;}return n;};
  const answer=expr();
  if(at!==tokens.length||!Number.isFinite(answer))throw Error("Некоректний вираз");
  return answer;
}
function convert(query:string):string|null {
  const m=query.trim().match(/^(-?\d+(?:[.,]\d+)?)\s*(km|mi|kg|lb|cm|in|c|f)\s+(?:to|в|у|->)\s*(km|mi|kg|lb|cm|in|c|f)$/i);
  if(!m)return null;
  const n=Number(m[1].replace(",",".")), from=m[2].toLowerCase(),to=m[3].toLowerCase();
  const factors:Record<string,number>={km:1000,mi:1609.344,kg:1,lb:0.45359237,cm:0.01,in:0.0254};
  const domains:Record<string,string>={km:"distance",mi:"distance",cm:"distance",in:"distance",kg:"mass",lb:"mass",c:"temp",f:"temp"};
  if(domains[from]!==domains[to])return "Несумісні одиниці";
  let result:number;
  if(from==="c")result=to==="f"?n*9/5+32:n;
  else if(from==="f")result=to==="c"?(n-32)*5/9:n;
  else result=n*factors[from]/factors[to];
  return `${n} ${from} = ${Number(result.toFixed(5))} ${to}`;
}
export function CommandPalette({onSelectTab,onAskAI}:{onSelectTab:(tab:"home"|"media"|"tools"|"chat"|"settings")=>void;onAskAI:(text:string)=>void}) {
  const [query,setQuery]=useState("");
  const commands=useMemo<Result[]>(()=>[
    {label:"Огляд",description:"Відкрити головну панель",onClick:()=>onSelectTab("home")},
    {label:"Музика",description:"Системний плеєр і гучність",onClick:()=>onSelectTab("media")},
    {label:"Буфер, нотатки й інструменти",description:"Відкрити інструменти",onClick:()=>onSelectTab("tools")},
    {label:"AI-чат",description:"Відкрити помічника",onClick:()=>onSelectTab("chat")},
    {label:"Налаштування",description:"Теми та поведінка острова",onClick:()=>onSelectTab("settings")}
  ],[onSelectTab]);
  let result:string|null=null;
  const normalized=query.trim().replace(/^=/,"");
  if(normalized) {
    try {result=arithmetic(normalized).toLocaleString("uk-UA",{maximumFractionDigits:8});} catch {/* Not an arithmetic expression. */}
    if(!result)result=convert(query);
  }
  const matches=commands.filter(item=>(item.label+" "+item.description).toLowerCase().includes(query.toLowerCase())).slice(0,8);
  return <div className="tool-section command-palette">
    <div className="tool-heading"><Command size={16}/> Командний рядок</div>
    <input className="tool-input" autoFocus value={query} onChange={e=>setQuery(e.target.value)} placeholder="Пошук, 12*4, 15 km to mi, ? питання..." onKeyDown={e=>{if(e.key==="Enter"&&query.startsWith("?"))onAskAI(query.slice(1).trim());}}/>
    {result&&<div className="tool-item"><Calculator size={16}/><span>{result}</span><button onClick={()=>void navigator.clipboard.writeText(result!)}>Копіювати</button></div>}
    {query.startsWith("?")&&<button className="tool-command-action" onClick={()=>onAskAI(query.slice(1).trim())}><Sparkles size={16}/> Запитати Aurora AI</button>}
    {query&&!query.startsWith("?")&&<button className="tool-command-action" onClick={()=>openWeb("https://www.google.com/search?q="+encodeURIComponent(query))}><Globe size={16}/> Шукати в інтернеті</button>}
    {matches.map(item=><button className="tool-command-action" onClick={item.onClick} key={item.label}><Search size={15}/><span><b>{item.label}</b><small>{item.description}</small></span></button>)}
    <p className="tool-help">Команди працюють у вікні Aurora. Системний Alt+Space та запуск .exe/PowerShell ще не реалізовано.</p>
  </div>;
}
