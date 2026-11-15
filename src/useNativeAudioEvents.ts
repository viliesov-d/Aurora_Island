import { useEffect, useRef, type RefObject } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { MediaState, VolumeState } from "./MediaPane";

type Options = {
  enabled: boolean;
  volumeEnabled: boolean;
  mediaEnabled: boolean;
  expanded: boolean;
  hidden: boolean;
  media: MediaState | null;
  lastManualInteraction: RefObject<number>;
  onToast: (message: string) => void;
};

/**
 * Atoll-style status toasts using existing Win32/COM sound APIs.
 * Only watches system volume and Windows Media Session metadata while the
 * island is visible. Does not record sound, screenshots or microphone audio.
 */
export function useNativeAudioEvents({
  enabled, volumeEnabled, mediaEnabled, expanded, hidden,
  media, lastManualInteraction, onToast,
}: Options) {
  const lastVolume=useRef<VolumeState|null>(null);
  const lastTrack=useRef<string|null>(null);
  const onToastRef=useRef(onToast);
  useEffect(()=>{onToastRef.current=onToast},[onToast]);

  useEffect(()=>{
    if(!enabled||hidden||!volumeEnabled)return;
    let live=true, pending=false;
    // The first sample establishes a baseline; no toast on app startup.
    lastVolume.current=null;
    const poll=async()=>{
      if(!live||pending||document.hidden)return;
      pending=true;
      try {
        const snapshot=await invoke<VolumeState>("get_volume");
        if(!live)return;
        const previous=lastVolume.current;
        lastVolume.current=snapshot;
        if(!previous||expanded||Date.now()-lastManualInteraction.current<1100)return;
        if(previous.muted!==snapshot.muted || Math.abs(previous.percent-snapshot.percent)>=1){
          onToastRef.current(snapshot.muted
            ? "Звук вимкнено"
            : `Гучність · ${snapshot.percent}%`);
        }
      }catch{ /* Unavailable on some Windows audio devices; never disturb UI. */ }
      finally{pending=false}
    };
    void poll();
    const id=window.setInterval(()=>void poll(),650);
    return()=>{live=false;window.clearInterval(id)};
  },[enabled,hidden,volumeEnabled,expanded,lastManualInteraction]);

  useEffect(()=>{
    if(!enabled||hidden||!mediaEnabled) {
      lastTrack.current=null;
      return;
    }
    const track=media?.available&&media.playing&&media.title
      ? `${media.source}:${media.title}` : null;
    if(track&&track!==lastTrack.current&&lastTrack.current!==null&&!expanded){
      onToastRef.current("♫ "+media!.title.slice(0,32));
    }
    lastTrack.current=track;
  },[enabled,hidden,mediaEnabled,expanded,media?.available,media?.playing,media?.title,media?.source]);
}
