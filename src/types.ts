export type Theme = "classic" | "glass" | "soft" | "neon";
export type Tab = "home" | "chat" | "settings";
export type Preferences = { theme: Theme; width: number; radius: number; opacity: number; accent: string; blur: number; glass: number; speed: number; autoHide: boolean; startup: boolean; modules: { clock: boolean; battery: boolean; timer: boolean } };
export type Message = { role: "user" | "assistant"; content: string };
export const defaults: Preferences = { theme: "glass", width: 340, radius: 26, opacity: 92, accent: "#8d83ff", blur: 12, glass: 65, speed: 75, autoHide: true, startup: false, modules: { clock: true, battery: true, timer: true } };
