import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

type CursorPosition = { x: number; y: number };
type Side = "left" | "right" | "top" | "bottom";
const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));

/**
 * Animated magnetic perimeter. The Win32 cursor sample works while the mouse
 * is still OUTSIDE the hit-tested WebView window; no synthetic cursor capture.
 * Variables are written straight to the element to avoid React rerenders.
 */
export function useMagneticPill(enabled: boolean, expanded: boolean) {
  const pillRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = pillRef.current;
    if (!el) return;
    const reset = () => {
      el.style.setProperty("--magnet-strength", "0");
      el.style.setProperty("--magnet-scale", "0.6");
      el.style.setProperty("--lens-x", "50%");
      el.style.setProperty("--lens-y", "0%");
    };
    if (!enabled || expanded || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      reset();
      return;
    }

    let live = true;
    let pending = false;
    let cursor: CursorPosition | null = null;
    let strength = 0;
    let edgeX = 50, edgeY = 22, glowX = 50, glowY = 0;
    let rotation = 0;
    let side: Side = "right";

    const poll = async () => {
      if (!live || pending || document.hidden) return;
      pending = true;
      try {
        cursor = await invoke<CursorPosition | null>("cursor_position");
      } catch {
        cursor = null;
      } finally {
        pending = false;
      }
    };

    const animate = () => {
      if (!live || document.hidden) return;
      const rect = el.getBoundingClientRect();
      let desired = 0;
      if (cursor) {
        // Distance from cursor to the nearest point on the capsule bounding box.
        const distanceX = Math.max(rect.left - cursor.x, 0, cursor.x - rect.right);
        const distanceY = Math.max(rect.top - cursor.y, 0, cursor.y - rect.bottom);
        const distance = Math.hypot(distanceX, distanceY);
        if (distance < 88) {
          desired = Math.pow(1 - distance / 88, 1.65);
          const nearLeft = Math.abs(cursor.x - rect.left);
          const nearRight = Math.abs(cursor.x - rect.right);
          const nearTop = Math.abs(cursor.y - rect.top);
          const nearBottom = Math.abs(cursor.y - rect.bottom);
          const closest = Math.min(nearLeft, nearRight, nearTop, nearBottom);
          if (closest === nearLeft) side = "left";
          else if (closest === nearRight) side = "right";
          else if (closest === nearTop) side = "top";
          else side = "bottom";

          const x = cursor.x - rect.left;
          const y = cursor.y - rect.top;
          if (side === "left") { edgeX = 8; edgeY = clamp(y, 12, rect.height - 12); rotation = 180; }
          else if (side === "right") { edgeX = rect.width - 8; edgeY = clamp(y, 12, rect.height - 12); rotation = 0; }
          else if (side === "top") { edgeX = clamp(x, 18, rect.width - 18); edgeY = 8; rotation = -90; }
          else { edgeX = clamp(x, 18, rect.width - 18); edgeY = rect.height - 8; rotation = 90; }
          glowX = clamp(x / rect.width * 100, 0, 100);
          glowY = clamp(y / rect.height * 100, 0, 100);
        }
      }

      // Spring-like settling with extra damping as the pointer moves away.
      const response = desired > strength ? .28 : .16;
      strength += (desired - strength) * response;
      if (Math.abs(strength) < .002) strength = 0;
      el.style.setProperty("--magnet-strength", strength.toFixed(3));
      el.style.setProperty("--magnet-scale", (0.58 + strength * 0.54).toFixed(3));
      el.style.setProperty("--edge-x", edgeX.toFixed(1) + "px");
      el.style.setProperty("--edge-y", edgeY.toFixed(1) + "px");
      el.style.setProperty("--edge-angle", rotation + "deg");
      el.style.setProperty("--lens-x", glowX.toFixed(1) + "%");
      el.style.setProperty("--lens-y", glowY.toFixed(1) + "%");
    };
    void poll();
    const pollTimer = window.setInterval(() => { void poll(); }, 70);
    const animationTimer = window.setInterval(animate, 25);
    return () => {
      live = false;
      window.clearInterval(pollTimer);
      window.clearInterval(animationTimer);
      reset();
    };
  }, [enabled, expanded]);
  return pillRef;
}
