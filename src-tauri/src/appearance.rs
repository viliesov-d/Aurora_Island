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
        GetWindowLongW, SetWindowLongW, SetWindowPos, GWL_STYLE,
        WS_CAPTION, WS_THICKFRAME, WS_SYSMENU, WS_MINIMIZEBOX, WS_MAXIMIZEBOX,
        WS_POPUP, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, SWP_FRAMECHANGED,
    };
    let hwnd = window.hwnd().map_err(|e| e.to_string())?;
    unsafe {
        let old_style = GetWindowLongW(hwnd.0, GWL_STYLE) as u32;
        let borderless = (old_style &
            !(WS_CAPTION | WS_THICKFRAME | WS_SYSMENU | WS_MINIMIZEBOX | WS_MAXIMIZEBOX))
            | WS_POPUP;
        if old_style != borderless {
            SetWindowLongW(hwnd.0, GWL_STYLE, borderless as i32);
            if SetWindowPos(
                hwnd.0, std::ptr::null_mut(), 0, 0, 0, 0,
                SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED
            ) == 0 {
                return Err("Windows не дозволив прибрати системну рамку.".into());
            }
        }
    }
    Ok(())
}

/// Native full-window acrylic fills the entire rectangle of a transparent
/// WebView2 window (including outside the capsule) and may restore native
/// titlebar buttons. Keep the Windows compositor transparent instead; render
/// the frosted lens only inside Aurora's rounded DOM surface.
#[tauri::command]
pub fn set_native_material(window: tauri::WebviewWindow, theme: String) -> Result<(), String> {
    #[cfg(windows)] {
        let _ = theme;
        // Revert any acrylic left by earlier Aurora sessions or theme switches.
        let _ = window_vibrancy::clear_acrylic(&window);
        window.set_decorations(false).map_err(|e| e.to_string())?;
        ensure_borderless(&window)
    }
    #[cfg(not(windows))] {
        let _ = (window, theme);
        Ok(())
    }
}
