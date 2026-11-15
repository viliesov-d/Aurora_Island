mod secure_key;

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager, WindowEvent};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SystemInfo {
    battery_percent: Option<u8>,
    charging: Option<bool>,
    platform: String,
}

#[derive(Deserialize, Serialize, Clone)]
struct ChatMessage { role: String, content: String }

#[tauri::command]
fn system_info() -> SystemInfo {
    #[cfg(windows)]
    {
        use windows_sys::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
        let mut status: SYSTEM_POWER_STATUS = unsafe { std::mem::zeroed() };
        let ok = unsafe { GetSystemPowerStatus(&mut status) } != 0;
        return SystemInfo {
            battery_percent: if ok && status.BatteryLifePercent <= 100 { Some(status.BatteryLifePercent) } else { None },
            charging: if ok { Some(status.BatteryFlag & 8 != 0) } else { None },
            platform: "Windows".into(),
        };
    }
    #[cfg(not(windows))]
    SystemInfo { battery_percent: None, charging: None, platform: std::env::consts::OS.into() }
}

#[tauri::command]
fn save_api_key(app: tauri::AppHandle, key: String) -> Result<(), String> {
    if !key.trim().starts_with("sk-") { return Err("Перевірте формат API-ключа OpenAI.".into()); }
    let path = app.path().app_data_dir().map_err(|e| e.to_string())?.join("openai-key.dpapi");
    std::fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    let encrypted = secure_key::protect(key.as_bytes())?;
    std::fs::write(path, encrypted).map_err(|e| e.to_string())
}

#[tauri::command]
fn has_api_key(app: tauri::AppHandle) -> bool {
    app.path().app_data_dir().ok().map(|p| p.join("openai-key.dpapi").exists()).unwrap_or(false)
}

#[tauri::command]
async fn stream_chat(app: tauri::AppHandle, messages: Vec<ChatMessage>, model: String) -> Result<(), String> {
    let path = app.path().app_data_dir().map_err(|e| e.to_string())?.join("openai-key.dpapi");
    let encrypted = std::fs::read(path).map_err(|_| "Спочатку додайте API-ключ у налаштуваннях чату.".to_string())?;
    let key = String::from_utf8(secure_key::unprotect(&encrypted)?).map_err(|e| e.to_string())?;
    let input: Vec<serde_json::Value> = messages.iter().map(|m| serde_json::json!({"role":m.role,"content":[{"type":"input_text","text":m.content}]})).collect();
    let client = reqwest::Client::new();
    let response = client.post("https://api.openai.com/v1/responses")
        .bearer_auth(key).json(&serde_json::json!({"model":model,"input":input,"stream":true}))
        .send().await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        let status = response.status(); let body = response.text().await.unwrap_or_default();
        return Err(format!("OpenAI повернув {status}: {}", body.chars().take(400).collect::<String>()));
    }
    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    while let Some(item) = stream.next().await {
        let bytes = item.map_err(|e| e.to_string())?;
        buffer.push_str(&String::from_utf8_lossy(&bytes));
        while let Some(end) = buffer.find("\n\n") {
            let event = buffer.drain(..end + 2).collect::<String>();
            for line in event.lines().filter(|l| l.starts_with("data: ")) {
                let data = &line[6..]; if data == "[DONE]" { continue; }
                let value: serde_json::Value = match serde_json::from_str(data) { Ok(v) => v, Err(_) => continue };
                if value["type"] == "response.output_text.delta" {
                    if let Some(delta) = value["delta"].as_str() { let _ = app.emit("chat:delta", delta); }
                }
                if value["type"] == "response.failed" || value["type"] == "error" {
                    let message = value["response"]["error"]["message"].as_str().unwrap_or("Помилка потокової відповіді");
                    return Err(message.to_string());
                }
            }
        }
    }
    let _ = app.emit("chat:done", ());
    Ok(())
}

#[tauri::command]
fn set_startup(enabled: bool) -> Result<(), String> {
    #[cfg(windows)] {
        use winreg::{enums::HKEY_CURRENT_USER, RegKey};
        let key = RegKey::predef(HKEY_CURRENT_USER).open_subkey_with_flags("Software\\Microsoft\\Windows\\CurrentVersion\\Run", winreg::enums::KEY_WRITE).map_err(|e|e.to_string())?;
        if enabled { let exe = std::env::current_exe().map_err(|e|e.to_string())?; key.set_value("AuroraIsland", &format!("\"{}\" --startup", exe.display())).map_err(|e|e.to_string())?; }
        else { let _ = key.delete_value("AuroraIsland"); }
        return Ok(());
    }
    #[cfg(not(windows))] { let _ = enabled; Err("Автозапуск доступний лише у Windows-застосунку.".into()) }
}

#[tauri::command]
fn hide_to_tray(window: tauri::WebviewWindow) -> Result<(), String> { window.hide().map_err(|e|e.to_string()) }

#[tauri::command]
fn open_personal_chatgpt() -> Result<(), String> {
    #[cfg(windows)] unsafe {
        use std::ffi::c_void;
        #[link(name="Shell32")] extern "system" { fn ShellExecuteW(hwnd:*mut c_void, operation:*const u16, file:*const u16, parameters:*const u16, directory:*const u16, show:i32)->isize; }
        let operation:Vec<u16>="open\0".encode_utf16().collect();
        let url:Vec<u16>="https://chatgpt.com/\0".encode_utf16().collect();
        let result=ShellExecuteW(std::ptr::null_mut(),operation.as_ptr(),url.as_ptr(),std::ptr::null(),std::ptr::null(),1);
        if result<=32 { return Err("Не вдалося відкрити браузер.".into()); }
        return Ok(());
    }
    #[cfg(not(windows))] Err("Відкриття браузера доступне у Windows-застосунку.".into())
}

#[tauri::command]
fn set_native_region(window: tauri::WebviewWindow, expanded: bool, pill_width: f64, radius: f64) -> Result<(), String> {
    #[cfg(windows)] unsafe {
        use windows_sys::Win32::Graphics::Gdi::{CombineRgn, CreateRoundRectRgn, DeleteObject, SetWindowRgn, RGN_OR};
        let scale = window.scale_factor().map_err(|e|e.to_string())?;
        let size = window.inner_size().map_err(|e|e.to_string())?;
        let px = |n:f64| (n*scale).round() as i32;
        let w = px(pill_width.min(size.width as f64/scale));
        let h = size.height as i32;
        let p = px(48.0);
        let left = ((size.width as i32-w)/2).max(0);
        let pill = CreateRoundRectRgn(left, 0, left+w, p, px(radius*2.0), px(radius*2.0));
        let region = if expanded {
            let card = CreateRoundRectRgn(0, px(54.0), size.width as i32, h, px(radius*1.8), px(radius*1.8));
            let union = CreateRoundRectRgn(0,0,1,1,1,1);
            let _ = CombineRgn(union, pill, card, RGN_OR);
            let _ = DeleteObject(pill);
            let _ = DeleteObject(card);
            union
        } else { pill };
        if let Ok(hwnd) = window.hwnd() {
            if SetWindowRgn(hwnd.0, region, 1) == 0 { let _=DeleteObject(region); return Err("Не вдалося застосувати форму вікна.".into()); }
        } else { let _=DeleteObject(region); }
    }
    #[cfg(not(windows))] { let _ = (window,expanded,pill_width,radius); }
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![system_info, save_api_key, has_api_key, stream_chat, set_startup, hide_to_tray, set_native_region, open_personal_chatgpt])
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_always_on_top(true);
                let _ = window.set_decorations(false);
                if let Ok(Some(monitor)) = window.primary_monitor() {
                    if let Ok(scale) = window.scale_factor() {
                        let msize = monitor.size(); let mpos = monitor.position();
                        let x = mpos.x + ((msize.width as f64 - 360.0*scale)/2.0).round() as i32;
                        let _ = window.set_position(tauri::PhysicalPosition::new(x.max(mpos.x), mpos.y+8));
                    }
                }
                let handle = app.handle().clone();
                window.on_window_event(move |event| { if let WindowEvent::CloseRequested { api, .. } = event { api.prevent_close(); if let Some(w) = handle.get_webview_window("main") { let _ = w.hide(); } } });
            }
            let show = MenuItem::with_id(app, "show", "Відкрити Aurora Island", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Вийти", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            let tray_icon = app.default_window_icon().cloned();
            let mut tray = TrayIconBuilder::new().menu(&menu).on_menu_event(|app,event| match event.id.as_ref() {
                "show" => if let Some(w)=app.get_webview_window("main") { let _=w.show(); let _=w.set_focus(); },
                "quit" => app.exit(0), _ => {}
            });
            if let Some(icon) = tray_icon { tray = tray.icon(icon); }
            tray.build(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Aurora Island failed to start");
}

