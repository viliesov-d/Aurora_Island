import { BatteryCharging, Clock3, Music2, PauseCircle, Timer, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState, type WheelEvent } from "react";

export type Activity = {
  id: "timer" | "music" | "battery";
  title: string;
  detail: string;
  icon: LucideIcon;
  progress?: number;
  onOpen: () => void;
};

/**
 * Compact activities are ordered by urgency. The mouse wheel swaps active
 * experiences without opening the panel, as in Atoll. Selection survives
 * ordinary updates of the music title or timer countdown.
 */
export function useLiveActivity(activities: Activity[]) {
  const signature = useMemo(() => activities.map(a=>a.id).join("|"),[activities]);
  const [selectedId, setSelectedId] = useState<Activity["id"]|null>(null);
  useEffect(() => {
    if (selectedId && activities.some(a=>a.id===selectedId)) return;
    setSelectedId(activities[0]?.id??null);
  },[signature,selectedId,activities]);
  const selected=activities.find(a=>a.id===selectedId)??activities[0]??null;
  const rotate=(event: WheelEvent) => {
    if(activities.length<2) return;
    event.preventDefault();
    event.stopPropagation();
    const index=activities.findIndex(a=>a.id===selected?.id);
    const next=(index+(event.deltaY>0?1:-1)+activities.length)%activities.length;
    setSelectedId(activities[next].id);
  };
  return {selected,rotate,count:activities.length};
}

export function CompactActivity({activity, count}:{activity:Activity;count:number}) {
  const Icon=activity.icon;
  return <div className="live-activity" title={activity.title+" · прокрутіть для інших активностей"}
    aria-label={activity.title+" "+activity.detail}>
      <div className="live-icon"><Icon size={16}/></div>
      <div className="live-meta"><b>{activity.title}</b><span>{activity.detail}</span></div>
      {typeof activity.progress==="number"&&<span className="live-ring" style={{"--progress":String(Math.round(activity.progress*100))+"%"} as React.CSSProperties}/>}
      {count>1&&<small className="live-count">{count}</small>}
    </div>;
}

export const activityIcons={music:Music2,timer:Timer,paused:PauseCircle,battery:BatteryCharging,clock:Clock3};
