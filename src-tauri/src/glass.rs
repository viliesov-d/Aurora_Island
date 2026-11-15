//! Local, bounded desktop texture for the glass lens. Never writes frames to disk.
use std::sync::Mutex;

#[derive(Default)]
pub struct GlassState(pub Mutex<bool>);

#[tauri::command]
pub fn configure_glass(window: tauri::WebviewWindow, state: tauri::State<'_, GlassState>, enabled: bool) -> Result<(), String> {
    let mut active = state.inner().0.lock().map_err(|e| e.to_string())?;
    #[cfg(windows)] {
        use windows_sys::Win32::UI::WindowsAndMessaging::{SetWindowDisplayAffinity, WDA_EXCLUDEFROMCAPTURE, WDA_NONE};
        if enabled {
            use winreg::{RegKey, enums::HKEY_LOCAL_MACHINE};
            let version = RegKey::predef(HKEY_LOCAL_MACHINE)
                .open_subkey("SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion").map_err(|e| e.to_string())?;
            let build: String = version.get_value("CurrentBuildNumber").map_err(|e| e.to_string())?;
            if build.parse::<u32>().unwrap_or(0) < 19041 {
                return Err("Живе скло потребує Windows 10 2004 або новішої.".into());
            }
        }
        let hwnd = window.hwnd().map_err(|e| e.to_string())?;
        if unsafe { SetWindowDisplayAffinity(hwnd.0, if enabled { WDA_EXCLUDEFROMCAPTURE } else { WDA_NONE }) } == 0 {
            return Err("Не вдалося налаштувати виключення острова із захоплення.".into());
        }
    }
    #[cfg(not(windows))] { let _ = window; if enabled { return Err("Живе скло доступне лише у Windows.".into()); } }
    *active = enabled;
    Ok(())
}

// Async commands run off the UI thread; one frame holds the capture gate until
// all GDI handles are released. Disabling waits for that frame and stops capture.
#[tauri::command]
pub async fn glass_frame(window: tauri::WebviewWindow, state: tauri::State<'_, GlassState>, expanded: bool) -> Result<tauri::ipc::Response, String> {
    let active = state.inner().0.lock().map_err(|e| e.to_string())?;
    if !*active {
        return Err("Glass capture is inactive".into());
    }
    if !window.is_visible().map_err(|e| e.to_string())? {
        return Ok(tauri::ipc::Response::new(Vec::<u8>::new()));
    }
    #[cfg(windows)] unsafe {
        use windows_sys::Win32::Graphics::Gdi::*;
        let size = window.inner_size().map_err(|e| e.to_string())?;
        let position = window.inner_position().map_err(|e| e.to_string())?;
        let scale = window.scale_factor().map_err(|e| e.to_string())?;
        let source_w = size.width as i32;
        let source_h = if expanded { size.height as i32 } else { ((88.0 * scale).ceil() as i32).min(size.height as i32) };
        if !(1..=4096).contains(&source_w) || !(1..=4096).contains(&source_h) {
            return Err("Glass capture bounds are invalid".into());
        }
        let ratio = (384.0 / source_w as f64).min(1.0);
        let w = (source_w as f64 * ratio).ceil() as i32;
        let h = (source_h as f64 * ratio).ceil() as i32;
        let screen = GetDC(std::ptr::null_mut());
        if screen.is_null() { return Err("Desktop DC unavailable".into()); }
        let memory = CreateCompatibleDC(screen);
        let bitmap = CreateCompatibleBitmap(screen, w, h);
        if memory.is_null() || bitmap.is_null() {
            if !bitmap.is_null() { DeleteObject(bitmap); }
            if !memory.is_null() { DeleteDC(memory); }
            ReleaseDC(std::ptr::null_mut(), screen);
            return Err("Glass capture allocation failed".into());
        }
        let old = SelectObject(memory, bitmap);
        if old.is_null() || old as isize == -1 {
            DeleteDC(memory); DeleteObject(bitmap); ReleaseDC(std::ptr::null_mut(), screen);
            return Err("Glass bitmap selection failed".into());
        }
        let result = (|| {
            SetStretchBltMode(memory, HALFTONE);
            if StretchBlt(memory, 0, 0, w, h, screen, position.x, position.y, source_w, source_h, SRCCOPY | CAPTUREBLT) == 0 {
                return Err("Desktop texture unavailable".into());
            }
            SelectObject(memory, old);
            let mut info: BITMAPINFO = std::mem::zeroed();
            info.bmiHeader.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
            info.bmiHeader.biWidth = w;
            info.bmiHeader.biHeight = -h;
            info.bmiHeader.biPlanes = 1;
            info.bmiHeader.biBitCount = 32;
            info.bmiHeader.biCompression = BI_RGB;
            let mut pixels = vec![0u8; (w * h * 4) as usize];
            if GetDIBits(memory, bitmap, 0, h as u32, pixels.as_mut_ptr().cast(), &mut info, DIB_RGB_COLORS) != h {
                return Err("Glass pixels unavailable".into());
            }
            for pixel in pixels.chunks_exact_mut(4) { pixel[3] = 255; }
            let mut bmp = Vec::with_capacity(54 + pixels.len());
            bmp.extend_from_slice(b"BM");
            bmp.extend_from_slice(&((54 + pixels.len()) as u32).to_le_bytes());
            bmp.extend_from_slice(&[0; 4]);
            bmp.extend_from_slice(&54u32.to_le_bytes());
            bmp.extend_from_slice(&40u32.to_le_bytes());
            bmp.extend_from_slice(&w.to_le_bytes());
            bmp.extend_from_slice(&(-h).to_le_bytes());
            bmp.extend_from_slice(&1u16.to_le_bytes());
            bmp.extend_from_slice(&32u16.to_le_bytes());
            bmp.extend_from_slice(&[0; 24]);
            bmp.extend_from_slice(&pixels);
            Ok(tauri::ipc::Response::new(bmp))
        })();
        SelectObject(memory, old);
        DeleteObject(bitmap);
        DeleteDC(memory);
        ReleaseDC(std::ptr::null_mut(), screen);
        return result;
    }
    #[cfg(not(windows))] { let _ = (window, expanded); Err("Windows only".into()) }
}
