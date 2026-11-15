import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

export type ClipboardRecord = { id: number; text: string; pinned: boolean };
export type ClipboardSnapshot = { sequence: number; text: string | null };
export const LIVE_CLIPS_EVENT = "aurora:clipboard-updated";
let liveClips: ClipboardRecord[] = [];

export function getLiveClips(): ClipboardRecord[] {
  return liveClips.slice();
}

function saveLiveClips(clips: ClipboardRecord[]) {
  liveClips = clips.slice(0, 25);
  window.dispatchEvent(new Event(LIVE_CLIPS_EVENT));
}

export function removeLiveClip(id: number) {
  saveLiveClips(getLiveClips().filter(c => c.id !== id));
}
export function clearLiveClips() { saveLiveClips([]); }

export async function nativeCopy(text: string) {
  try {
    await invoke("clipboard_write", { text });
  } catch {
    await navigator.clipboard.writeText(text);
  }
}
export async function nativeRead(): Promise<string> {
  try {
    const info = await invoke<ClipboardSnapshot>("clipboard_snapshot", { lastSequence: 0 });
    return info.text || "";
  } catch {
    return navigator.clipboard.readText();
  }
}

export function useClipboardWatcher(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let disposed = false, active = false, primed = false, lastSequence = 0;
    const poll = async () => {
      if (disposed || active) return;
      active = true;
      try {
        const snapshot = await invoke<ClipboardSnapshot>("clipboard_snapshot", { lastSequence });
        if (disposed) return;
        if (!primed) {
          // Enabling monitoring never silently imports the clipboard's old contents.
          primed = true;
          lastSequence = snapshot.sequence;
          return;
        }
        if (snapshot.sequence !== lastSequence) {
          lastSequence = snapshot.sequence;
          const next = snapshot.text?.slice(0, 10_000);
          if (next?.trim()) {
            const previous = getLiveClips().filter(c => c.text !== next);
            saveLiveClips([{ id: Date.now(), text: next, pinned: false }, ...previous]);
          }
        }
      } catch {
        // Other apps sometimes hold OpenClipboard briefly. Retry next poll.
      } finally { active = false; }
    };
    void poll();
    const timer = window.setInterval(() => { void poll(); }, 1500);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [enabled]);
}

export async function showWindowsNotification(title: string, body: string) {
  await invoke("notify_user", { title, body });
}

type Reminder = { id: number; title: string; at: number; done: boolean };
const NOTIFIED_KEY = "aurora:reminder-notified";

export function useReminderNotifications(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    const already = new Set<number>();
    try {
      const values = JSON.parse(sessionStorage.getItem(NOTIFIED_KEY) || "[]");
      if (Array.isArray(values)) for (const id of values) if (typeof id === "number") already.add(id);
    } catch {}
    const scan = async () => {
      if (disposed) return;
      let reminders: Reminder[] = [];
      try {
        const parsed = JSON.parse(localStorage.getItem("aurora:reminders") || "[]");
        if (Array.isArray(parsed)) reminders = parsed;
      } catch {}
      const due = reminders.filter(r => !r.done && typeof r.id === "number" &&
        typeof r.at === "number" && r.at <= Date.now() && !already.has(r.id)).slice(0, 3);
      for (const reminder of due) {
        if (disposed) return;
        already.add(reminder.id);
        try {
          sessionStorage.setItem(NOTIFIED_KEY, JSON.stringify([...already].slice(-150)));
        } catch {}
        try { await showWindowsNotification("Aurora Island · Нагадування", reminder.title.slice(0, 300)); }
        catch (error) { console.warn("Native reminder notification failed", error); }
      }
    };
    void scan();
    const interval = window.setInterval(() => { void scan(); }, 15_000);
    return () => { disposed = true; window.clearInterval(interval); };
  }, [enabled]);
}
