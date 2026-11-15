import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

type Cursor = { x: number; y: number };
type Side = "left" | "right" | "top" | "bottom";
const limit = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));
const smooth = (n: number) => n * n * (3 - 2 * n);
const round = (n: number) => Math.round(n * 10) / 10;

/** A single continuous capsule path with tangent-connected curves. */
export function magneticPath(w: number, h: number, side: Side, px: number, py: number, pull: number) {
  const radius = h / 2;
  const b = limit(pull, 0, 1.08) * 13;
  const left = side === "left" ? b : 0;
  const right = side === "right" ? b : 0;
  const top = side === "top" ? b : 0;
  const bottom = side === "bottom" ? b : 0;
  const tx = limit(px, radius + 47, w - radius - 47);
  const bx = limit(px, radius + 47, w - radius - 47);
  const ry = limit(py, h * .38, h * .62);
  const ly = limit(py, h * .38, h * .62);
  const point = (x: number, y: number) => [round(x), round(y)].join(" ");
  const p = ["M", point(radius, 0)];
  if (top > .02) {
    p.push("L", point(tx - 40, 0));
    p.push("C", point(tx - 20, 0), point(tx - 19, -top), point(tx, -top));
    p.push("C", point(tx + 19, -top), point(tx + 20, 0), point(tx + 40, 0));
  }
  p.push("L", point(w - radius, 0));
  p.push("C", point(w - radius * .25, 0),
    point(w + right, ry * .20), point(w + right, ry));
  p.push("C", point(w + right, ry + (h - ry) * .80),
    point(w - radius * .25, h), point(w - radius, h));
  if (bottom > .02) {
    p.push("L", point(bx + 40, h));
    p.push("C", point(bx + 20, h), point(bx + 19, h + bottom), point(bx, h + bottom));
    p.push("C", point(bx - 19, h + bottom), point(bx - 20, h), point(bx - 40, h));
  }
  p.push("L", point(radius, h));
  p.push("C", point(radius * .25, h),
    point(-left, ly + (h - ly) * .80), point(-left, ly));
  p.push("C", point(-left, ly * .20),
    point(radius * .25, 0), point(radius, 0), "Z");
  return p.join(" ");
}

function edgeDistance(side: Side, x: number, y: number, w: number, h: number) {
  return side === "left" ? Math.abs(x) :
    side === "right" ? Math.abs(x - w) :
    side === "top" ? Math.abs(y) : Math.abs(y - h);
}

/**
 * Stable cursor spring: one animation-frame integrator, one IPC pointer sample
 * every 70ms, no React rerender and no redraw while idle.
 */
export function useMagneticPill(enabled: boolean, expanded: boolean) {
  const pillRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const pill = pillRef.current;
    const path = pill?.querySelector<SVGPathElement>(".magnetic-shape");
    const svg = pill?.querySelector<SVGSVGElement>(".magnetic-svg");
    if (!pill || !path || !svg) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let disposed = false, pending = false, frame = 0, lastFrame = 0;
    let pointer: Cursor | null = null;
    let side: Side = "right";
    let strength = 0, velocity = 0;
    let anchorX = 0, anchorY = 22;
    let width = 0, height = 0;
    const reset = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      svg.style.opacity = "0";
      pill.style.setProperty("--magnet-strength", "0");
      pill.style.setProperty("--lens-x", "50%");
      pill.style.setProperty("--lens-y", "0%");
    };
    const render = (time: number) => {
      frame = 0;
      if (disposed || document.hidden || reduceMotion.matches) return;
      const rect = pill.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      if (rect.width !== width || rect.height !== height) {
        width = rect.width; height = rect.height;
        svg.setAttribute("viewBox", "-20 -20 " + round(width + 40) + " " + round(height + 40));
        anchorX = width / 2; anchorY = height / 2;
      }
      let desired = 0;
      let targetX = anchorX, targetY = anchorY;
      if (pointer) {
        const x = pointer.x - rect.left, y = pointer.y - rect.top;
        const dx = Math.max(-x, 0, x - width);
        const dy = Math.max(-y, 0, y - height);
        const outside = Math.hypot(dx, dy);
        const isInside = dx === 0 && dy === 0;
        if (!isInside && outside < 100) {
          desired = smooth(1 - outside / 100);
        } else if (isInside) {
          const nearEdge = Math.min(x, width - x, y, height - y);
          desired = .36 * smooth(1 - limit(nearEdge / 19, 0, 1));
        }
        const sides: Side[] = ["left", "right", "top", "bottom"];
        let closest = side;
        for (const candidate of sides) {
          if (edgeDistance(candidate, x, y, width, height) + 10 <
              edgeDistance(closest, x, y, width, height)) closest = candidate;
        }
        side = closest; // Hysteresis prevents flicker near corners.
        targetX = limit(x, 0, width);
        targetY = limit(y, 0, height);
      }
      const dt = Math.min(.033, lastFrame ? (time - lastFrame) / 1000 : 1/60);
      lastFrame = time;
      const steps = Math.max(1, Math.ceil(dt / .008));
      for (let i = 0; i < steps; i++) {
        velocity += (250 * (desired - strength) - 30 * velocity) * dt / steps;
        strength += velocity * dt / steps;
      }
      const response = 1 - Math.exp(-14 * dt);
      anchorX += (targetX - anchorX) * response;
      anchorY += (targetY - anchorY) * response;
      if (Math.abs(desired - strength) < .002 && Math.abs(velocity) < .025) {
        strength = desired; velocity = 0;
      }
      const actual = limit(strength, 0, 1.08);
      svg.style.opacity = actual < .006 ? "0" : String(Math.min(.84, actual));
      if (actual >= .006) {
        path.setAttribute("d", magneticPath(width, height, side, anchorX, anchorY, actual));
        pill.style.setProperty("--lens-x", String(round(anchorX/width*100)) + "%");
        pill.style.setProperty("--lens-y", String(round(anchorY/height*100)) + "%");
      }
      pill.style.setProperty("--magnet-strength", String(round(actual)));
      if (Math.abs(desired - strength) > .002 || Math.abs(velocity) > .025 ||
          Math.abs(targetX - anchorX) > .8 || Math.abs(targetY - anchorY) > .8) {
        frame = requestAnimationFrame(render);
      }
    };
    const poll = async () => {
      if (disposed || pending || document.hidden || reduceMotion.matches) return;
      pending = true;
      try {
        pointer = await invoke<Cursor | null>("cursor_position");
      } catch { pointer = null; }
      finally {
        pending = false;
        if (!disposed && !frame) frame = requestAnimationFrame(render);
      }
    };
    const onVisibility = () => { if (document.hidden) reset(); else void poll(); };
    if (!enabled || expanded || reduceMotion.matches) { reset(); return; }
    void poll();
    const interval = window.setInterval(() => void poll(), 70);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      reset();
    };
  }, [enabled, expanded]);
  return pillRef;
}
