//! Manual desktop capture with Win32 GDI. No background recording or automatic uploads.
//! The overlay is hidden temporarily so it does not appear in the screenshot.
use serde::Serialize;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use tauri::Manager;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenCapture {
    pub width: u32,
    pub height: u32,
    pub data_url: String,
}

#[cfg(windows)]
fn grab_primary_screen() -> Result<ScreenCapture, String> {
    use image::codecs::png::PngEncoder;
    use image::{ColorType, ImageEncoder};
    use windows_sys::Win32::Graphics::Gdi::{
        BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject,
        GetDC, GetDIBits, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER,
        BI_RGB, CAPTUREBLT, DIB_RGB_COLORS, SRCCOPY,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetSystemMetrics, SM_CXSCREEN, SM_CYSCREEN,
    };

    // Win32 returns physical pixel dimensions for a DPI-aware Tauri process.
    let width = unsafe { GetSystemMetrics(SM_CXSCREEN) };
    let height = unsafe { GetSystemMetrics(SM_CYSCREEN) };
    if width <= 0 || height <= 0 ||
       (width as u64) * (height as u64) > 20_000_000 {
        return Err("Непідтримувана роздільна здатність екрана (максимум 20 млн пікселів).".into());
    }
    let null_hwnd = std::ptr::null_mut();
    let screen = unsafe { GetDC(null_hwnd) };
    if screen.is_null() {
        return Err("Не вдалося отримати контекст екрана.".into());
    }

    // Keep handles under RAII guards for every failure path.
    struct ScreenDC(windows_sys::Win32::Graphics::Gdi::HDC);
    impl Drop for ScreenDC {
        fn drop(&mut self) {
            unsafe {
                windows_sys::Win32::Graphics::Gdi::ReleaseDC(std::ptr::null_mut(), self.0);
            }
        }
    }
    struct MemoryDC(windows_sys::Win32::Graphics::Gdi::HDC);
    impl Drop for MemoryDC {
        fn drop(&mut self) {
            unsafe { windows_sys::Win32::Graphics::Gdi::DeleteDC(self.0); }
        }
    }
    struct Bitmap(windows_sys::Win32::Graphics::Gdi::HBITMAP);
    impl Drop for Bitmap {
        fn drop(&mut self) {
            unsafe { windows_sys::Win32::Graphics::Gdi::DeleteObject(self.0); }
        }
    }
    let _screen_dc = ScreenDC(screen);
    let memory = unsafe { CreateCompatibleDC(screen) };
    if memory.is_null() { return Err("Не вдалося створити буфер зображення.".into()); }
    let _memory_dc = MemoryDC(memory);
    let bitmap = unsafe { CreateCompatibleBitmap(screen, width, height) };
    if bitmap.is_null() { return Err("Не вдалося створити знімок.".into()); }
    let _bitmap = Bitmap(bitmap);
    let previous = unsafe { SelectObject(memory, bitmap) };
    if previous.is_null() {
        return Err("Не вдалося вибрати растровий буфер.".into());
    }
    let blit_ok = unsafe {
        BitBlt(memory, 0, 0, width, height, screen, 0, 0, SRCCOPY | CAPTUREBLT)
    } != 0;
    // The bitmap MUST be deselected before GetDIBits.
    unsafe { SelectObject(memory, previous); }
    if !blit_ok { return Err("Windows не дозволив захопити зображення.".into()); }

    let mut info: BITMAPINFO = unsafe { std::mem::zeroed() };
    info.bmiHeader = BITMAPINFOHEADER {
        biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
        biWidth: width,
        biHeight: -height,  // Top-down rows; matches HTML canvas.
        biPlanes: 1,
        biBitCount: 32,
        biCompression: BI_RGB,
        ..unsafe { std::mem::zeroed() }
    };
    let mut rgba = vec![0u8; width as usize * height as usize * 4];
    let scan_lines = unsafe {
        GetDIBits(
            screen, bitmap, 0, height as u32, rgba.as_mut_ptr().cast(),
            &mut info, DIB_RGB_COLORS,
        )
    };
    if scan_lines != height {
        return Err("Windows не повернув усі рядки зображення.".into());
    }
    // GDI gives us little-endian BGRA, with an unspecified alpha byte.
    for pixel in rgba.chunks_exact_mut(4) {
        pixel.swap(0, 2);
        pixel[3] = 255;
    }

    let mut png = Vec::new();
    PngEncoder::new(&mut png)
        .write_image(&rgba, width as u32, height as u32, ColorType::Rgba8.into())
        .map_err(|e| format!("Не вдалося створити PNG: {e}"))?;
    Ok(ScreenCapture {
        width: width as u32,
        height: height as u32,
        data_url: format!("data:image/png;base64,{}", STANDARD.encode(png)),
    })
}

#[tauri::command]
pub async fn capture_screen(window: tauri::WebviewWindow) -> Result<ScreenCapture, String> {
    #[cfg(windows)] {
        let was_visible = window.is_visible().map_err(|e| e.to_string())?;
        if was_visible { window.hide().map_err(|e| e.to_string())?; }
        // Give DWM enough time to remove the island from the desktop image.
        tokio::time::sleep(std::time::Duration::from_millis(220)).await;
        let result = tauri::async_runtime::spawn_blocking(grab_primary_screen)
            .await.map_err(|e| e.to_string())?;
        if was_visible {
            // Restore even when capture itself failed.
            let restore = window.show().and_then(|_| window.set_focus()).map_err(|e| e.to_string());
            if let Err(err) = restore { return Err(format!("Не вдалося відновити острів: {err}")); }
        }
        result
    }
    #[cfg(not(windows))] {
        let _ = window;
        Err("Захоплення екрана доступне лише у Windows.".into())
    }
}

#[tauri::command]
pub fn save_capture_png(app: tauri::AppHandle, png_base64: String) -> Result<String, String> {
    if png_base64.len() > 34_000_000 {
        return Err("PNG завеликий для збереження.".into());
    }
    let bytes = STANDARD.decode(png_base64).map_err(|_| "Некоректне кодування PNG.".to_string())?;
    if bytes.len() < 32 || !bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Err("Невірний формат зображення.".into());
    }
    let folder = app.path().download_dir().map_err(|e| e.to_string())?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH).map_err(|e| e.to_string())?
        .as_millis();
    let path = folder.join(format!("Aurora-Capture-{stamp}.png"));
    std::fs::write(&path, bytes).map_err(|e| format!("Не вдалося зберегти файл: {e}"))?;
    Ok(path.display().to_string())
}
