import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

type Cursor = { x: number; y: number; leftPressed: boolean };

function editingText() {
  const active = document.activeElement;
  return active instanceof HTMLTextAreaElement ||
    (active instanceof HTMLInputElement &&
      !["checkbox","radio","range","button","color"].includes(active.type)) ||
    (active instanceof HTMLElement && active.isContentEditable);
}

function insideRect(x: number, y: number, rect: DOMRect, margin = 9) {
  return x >= rect.left - margin && x <= rect.right + margin &&
    y >= rect.top - margin && y <= rect.bottom + margin;
}

/**
 * Atoll-style outside-close semantics. Transparent Win32 hit regions do not
 * receive outside pointer events, so this uses a lightweight native sample.
 * No global mouse hooks, recordings or background clipboard access.
 */
export function useOutsideCollapse(
  open: boolean,
  autoHide: boolean,
  onCollapse: () => void,
) {
  const callback = useRef(onCollapse);
  useEffect(() => { callback.current = onCollapse; }, [onCollapse]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    let pending = false;
    let downBefore = false;
    let outsideSince: number | null = null;
    let started = performance.now();
    const sample = async () => {
      if (!alive || pending || document.hidden) return;
      pending = true;
      try {
        const pointer = await invoke<Cursor | null>("cursor_position");
        if (!alive || !pointer) return;
        const p = document.querySelector<HTMLElement>(".island .panel");
        const pill = document.querySelector<HTMLElement>(".island .pill");
        if (!p || !pill) return;
        const outside = !insideRect(pointer.x,pointer.y,p.getBoundingClientRect()) &&
          !insideRect(pointer.x,pointer.y,pill.getBoundingClientRect());
        const mouseDown = Boolean(pointer.leftPressed);
        const justPressed = mouseDown && !downBefore;
        downBefore = mouseDown;
        const now = performance.now();
        // Give the window resizing and entry spring time to complete.
        if (now-started < 380) { outsideSince=null; return; }
        if (!outside) { outsideSince=null; return; }
        if (editingText()) { outsideSince=null; return; }
        if (outsideSince===null) outsideSince=now;
        if (justPressed || (autoHide && now-outsideSince>420)) {
          outsideSince=null;
          callback.current();
        }
      } catch { /* Initializing outside Tauri or a temporarily busy window. */ }
      finally { pending=false; }
    };
    const id=window.setInterval(()=>void sample(),35);
    return()=>{alive=false;window.clearInterval(id);};
  },[open,autoHide]);
}
