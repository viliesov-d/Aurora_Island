export type Theme = "classic" | "glass" | "soft" | "neon";
export type Tab = "home" | "media" | "chat" | "tools" | "commands" | "settings";
export type Preferences = { theme: Theme; width: number; radius: number; opacity: number; accent: string; blur: number; glass: number; speed: number; autoHide: boolean; hoverExpand: boolean; startup: boolean; globalHotkey: boolean; clipboardWatch: boolean; notifications: boolean; modules: { clock: boolean; battery: boolean; timer: boolean; media: boolean; volume: boolean } };
export type Message = { role: "user" | "assistant"; content: string };
export const defaults: Preferences = { theme: "glass", width: 280, radius: 24, opacity: 92, accent: "#8d83ff", blur: 12, glass: 65, speed: 75, autoHide: true, hoverExpand: true, startup: false, globalHotkey: true, clipboardWatch: false, notifications: false, modules: { clock: true, battery: true, timer: true, media: true, volume: true } };
