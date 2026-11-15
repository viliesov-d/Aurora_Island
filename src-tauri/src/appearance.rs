//! Native appearance helpers for Windows 10 / 11.
//! Cursor sampling gives the magnetic edge proximity *outside* the WebView hit-region.
use serde::Serialize;
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CursorPoint { pub x: f64, pub y: f64 }

#[tauri::command]
pub fn cursor_position(window: tauri::WebviewWindow) -> Result<Option<CursorPoint>, String> {
    #[cfg(windows)] {
        use windows_sys::Win32::Foundation::POINT;
        use windows_sys::Win32::UI::WindowsAndMessaging::GetCursorPos;
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
        }))
    }
    #[cfg(not(windows))] {
        let _ = window;
        Ok(None)
    }
}

/// Windows 11 uses DWM system acrylic; older supported Windows 10 builds use
/// the composition acrylic path. Unlike CSS blur, this samples the OS backdrop.
#[tauri::command]
pub fn set_native_material(window: tauri::WebviewWindow, theme: String) -> Result<(), String> {
    #[cfg(windows)] {
        if theme == "glass" {
            window_vibrancy::apply_acrylic(&window, Some((24, 28, 42, 102)))
                .map_err(|err| err.to_string())
        } else {
            window_vibrancy::clear_acrylic(&window)
                .map_err(|err| err.to_string())
        }
    }
    #[cfg(not(windows))] {
        let _ = (window, theme);
        Ok(())
    }
}
