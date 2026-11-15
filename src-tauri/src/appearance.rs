//! Native appearance helpers for Windows 10 / 11.
//! Cursor sampling gives the magnetic edge proximity *outside* the WebView hit-region.
use serde::Serialize;
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CursorPoint { pub x: f64, pub y: f64, pub left_pressed: bool }

#[tauri::command]
pub fn cursor_position(window: tauri::WebviewWindow) -> Result<Option<CursorPoint>, String> {
    #[cfg(windows)] {
        use windows_sys::Win32::Foundation::POINT;
        use windows_sys::Win32::UI::WindowsAndMessaging::GetCursorPos;
        use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON};
        if !window.is_visible().map_err(|e| e.to_string())? {
            return Ok(None);
        }
        let mut p = POINT { x: 0, y: 0 };
        if unsafe { GetCursorPos(&mut p) } == 0 {
            return Ok(None);
        }
        let position = window.outer_position().map_err(|e| e.to_string())?;
        let scale = window.scale_factor().map_err(|e| e.to_string())?;
        if scale <= 0.0 { return Ok(None); }
        Ok(Some(CursorPoint {
            x: (p.x - position.x) as f64 / scale,
            y: (p.y - position.y) as f64 / scale,
            left_pressed: (unsafe { GetAsyncKeyState(VK_LBUTTON as i32) } as u16 & 0x8000) != 0,
        }))
    }
    #[cfg(not(windows))] {
        let _ = window;
        Ok(None)
    }
}

/// Remove any Win32 non-client frame that may be reintroduced by DWM or
/// a Windows backdrop effect. A region alone does not prevent caption buttons.
#[cfg(windows)]
pub fn ensure_borderless(window: &tauri::WebviewWindow) -> Result<(), String> {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetWindowLongW, SetWindowLongW, SetWindowPos, GWL_STYLE, GWL_EXSTYLE,
        WS_CAPTION, WS_THICKFRAME, WS_SYSMENU, WS_MINIMIZEBOX, WS_MAXIMIZEBOX,
        WS_POPUP, WS_EX_APPWINDOW, WS_EX_CLIENTEDGE, WS_EX_DLGMODALFRAME,
        WS_EX_STATICEDGE, WS_EX_WINDOWEDGE, WS_EX_TOOLWINDOW,
        SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, SWP_FRAMECHANGED,
    };
    use windows_sys::Win32::Graphics::Dwm::{
        DwmSetWindowAttribute, DWMWA_NCRENDERING_POLICY, DWMNCRP_DISABLED,
    };
    let hwnd = window.hwnd().map_err(|e| e.to_string())?;
    unsafe {
        let old = GetWindowLongW(hwnd.0, GWL_STYLE) as u32;
        let desired = (old & !(WS_CAPTION | WS_THICKFRAME | WS_SYSMENU |
            WS_MINIMIZEBOX | WS_MAXIMIZEBOX)) | WS_POPUP;
        let old_ex = GetWindowLongW(hwnd.0, GWL_EXSTYLE) as u32;
        let desired_ex = (old_ex & !(WS_EX_WINDOWEDGE | WS_EX_CLIENTEDGE |
            WS_EX_STATICEDGE | WS_EX_DLGMODALFRAME | WS_EX_APPWINDOW))
            | WS_EX_TOOLWINDOW;
        if old != desired { SetWindowLongW(hwnd.0, GWL_STYLE, desired as i32); }
        if old_ex != desired_ex { SetWindowLongW(hwnd.0, GWL_EXSTYLE, desired_ex as i32); }
        // DWM must not draw the caption/buttons even if the nonclient frame is
        // temporarily re-created during a WebView2 material/theme transition.
        let policy: i32 = DWMNCRP_DISABLED;
        let _ = DwmSetWindowAttribute(
            hwnd.0, DWMWA_NCRENDERING_POLICY as u32,
            (&policy as *const i32).cast(),
            std::mem::size_of::<i32>() as u32,
        );
        if old != desired || old_ex != desired_ex {
            if SetWindowPos(hwnd.0, std::ptr::null_mut(), 0, 0, 0, 0,
                SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER |
                SWP_FRAMECHANGED) == 0 {
                return Err("Windows не дозволив оновити рамку острова.".into());
            }
        }
    }
    Ok(())
}

/// Theme changes are strictly CSS. Do not reconfigure DWM or Win32 styles
/// while the capsule is animating; applying/removing native Acrylic was
/// repainting the whole WebView and occasionally reviving a system caption.
#[tauri::command]
pub fn set_native_material(window: tauri::WebviewWindow, theme: String) -> Result<(), String> {
    let _ = theme;
    #[cfg(windows)] { ensure_borderless(&window) }
    #[cfg(not(windows))] { let _ = window; Ok(()) }
}

/// Same-monitor fullscreen policy adapted from Atoll (see THIRD_PARTY_NOTICES.md).
#[tauri::command]
pub fn sync_window_environment(window: tauri::WebviewWindow, enabled: bool) -> Result<bool, String> {
    let mut fullscreen = false;
    #[cfg(windows)] unsafe {
        use windows_sys::Win32::{Foundation::RECT, Graphics::Gdi::*, UI::WindowsAndMessaging::*};
        let ours = window.hwnd().map_err(|e| e.to_string())?.0;
        let foreground = GetForegroundWindow();
        if enabled && !foreground.is_null() && foreground != ours && IsIconic(foreground) == 0 {
            let mut class = [0u16; 128];
            let len = GetClassNameW(foreground, class.as_mut_ptr(), class.len() as i32);
            let class = String::from_utf16_lossy(&class[..len.max(0) as usize]);
            let shell = matches!(class.as_str(), "Progman" | "WorkerW" | "Shell_TrayWnd" |
                "Shell_SecondaryTrayWnd" | "Windows.UI.Core.CoreWindow" | "XamlExplorerHostIslandWindow");
            let monitor = MonitorFromWindow(foreground, MONITOR_DEFAULTTONEAREST);
            if !shell && monitor == MonitorFromWindow(ours, MONITOR_DEFAULTTONEAREST) {
                let mut info: MONITORINFO = std::mem::zeroed();
                info.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
                let mut rect: RECT = std::mem::zeroed();
                if GetMonitorInfoW(monitor, &mut info) != 0 && GetWindowRect(foreground, &mut rect) != 0 {
                    let bounds = info.rcMonitor;
                    fullscreen = rect.left <= bounds.left && rect.top <= bounds.top &&
                        rect.right >= bounds.right && rect.bottom >= bounds.bottom;
                }
            }
        }
    }
    #[cfg(not(windows))] let _ = enabled;
    window.set_ignore_cursor_events(fullscreen).map_err(|e|e.to_string())?;
    Ok(fullscreen)
}
