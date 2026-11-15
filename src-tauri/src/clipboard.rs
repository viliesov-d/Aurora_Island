//! Explicit Windows text clipboard access. The opt-in history is managed in React and
//! never silently persists captured clipboard contents to disk.
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardSnapshot {
    pub sequence: u32,
    pub text: Option<String>,
}

#[cfg(windows)]
mod native {
    use super::ClipboardSnapshot;
    use windows_sys::Win32::System::DataExchange::{
        CloseClipboard, EmptyClipboard, GetClipboardData, GetClipboardSequenceNumber,
        IsClipboardFormatAvailable, OpenClipboard, SetClipboardData, CF_UNICODETEXT,
    };
    use windows_sys::Win32::System::Memory::{
        GlobalAlloc, GlobalFree, GlobalLock, GlobalSize, GlobalUnlock, GMEM_MOVEABLE,
    };

    struct OpenedClipboard;
    impl OpenedClipboard {
        fn new() -> Result<Self, String> {
            if unsafe { OpenClipboard(std::ptr::null_mut()) } == 0 {
                Err("Буфер обміну тимчасово зайнятий іншою програмою.".into())
            } else {
                Ok(Self)
            }
        }
    }
    impl Drop for OpenedClipboard {
        fn drop(&mut self) { unsafe { CloseClipboard(); } }
    }

    pub fn snapshot(last_sequence: u32) -> Result<ClipboardSnapshot, String> {
        let sequence = unsafe { GetClipboardSequenceNumber() };
        // Avoid opening clipboard unless Windows reports an actual change.
        if sequence == 0 || sequence == last_sequence {
            return Ok(ClipboardSnapshot { sequence, text: None });
        }
        let _opened = OpenedClipboard::new()?;
        if unsafe { IsClipboardFormatAvailable(CF_UNICODETEXT) } == 0 {
            return Ok(ClipboardSnapshot { sequence, text: None });
        }
        let handle = unsafe { GetClipboardData(CF_UNICODETEXT) };
        if handle.is_null() {
            return Ok(ClipboardSnapshot { sequence, text: None });
        }
        let length_bytes = unsafe { GlobalSize(handle) };
        // Limit reads to <= 40 KiB: no large secrets, image data or arbitrary formats.
        if length_bytes < 2 || length_bytes > 40_960 {
            return Ok(ClipboardSnapshot { sequence, text: None });
        }
        let locked = unsafe { GlobalLock(handle) };
        if locked.is_null() {
            return Err("Не вдалося прочитати текст із буфера.".into());
        }
        let units = length_bytes / 2;
        let utf16 = unsafe { std::slice::from_raw_parts(locked as *const u16, units) };
        let terminator = utf16.iter().position(|&c| c == 0).unwrap_or(units);
        let value = String::from_utf16_lossy(&utf16[..terminator]);
        unsafe { GlobalUnlock(handle); }
        Ok(ClipboardSnapshot {
            sequence,
            text: if value.trim().is_empty() { None } else { Some(value) },
        })
    }

    pub fn write(text: &str) -> Result<(), String> {
        let utf16: Vec<u16> = text.encode_utf16().chain(std::iter::once(0)).collect();
        if utf16.len() > 20_000 {
            return Err("Текст завеликий для швидкого копіювання.".into());
        }
        let bytes = utf16.len() * std::mem::size_of::<u16>();
        let allocated = unsafe { GlobalAlloc(GMEM_MOVEABLE, bytes) };
        if allocated.is_null() {
            return Err("Недостатньо пам’яті для копіювання.".into());
        }
        let locked = unsafe { GlobalLock(allocated) };
        if locked.is_null() {
            unsafe { GlobalFree(allocated); }
            return Err("Не вдалося підготувати буфер.".into());
        }
        unsafe {
            std::ptr::copy_nonoverlapping(utf16.as_ptr() as *const u8, locked as *mut u8, bytes);
            GlobalUnlock(allocated);
        }
        // The caller owns allocated until SetClipboardData succeeds.
        let _opened = match OpenedClipboard::new() {
            Ok(clipboard) => clipboard,
            Err(err) => {
                unsafe { GlobalFree(allocated); }
                return Err(err);
            }
        };
        if unsafe { EmptyClipboard() } == 0 {
            unsafe { GlobalFree(allocated); }
            return Err("Не вдалося очистити буфер обміну.".into());
        }
        if unsafe { SetClipboardData(CF_UNICODETEXT, allocated) }.is_null() {
            unsafe { GlobalFree(allocated); }
            return Err("Не вдалося скопіювати текст.".into());
        }
        Ok(()) // Windows takes ownership of allocated on successful SetClipboardData.
    }
}

#[tauri::command]
pub fn clipboard_snapshot(last_sequence: u32) -> Result<ClipboardSnapshot, String> {
    #[cfg(windows)] { native::snapshot(last_sequence) }
    #[cfg(not(windows))] {
        let _ = last_sequence;
        Err("Системний буфер обміну доступний лише у Windows.".into())
    }
}

#[tauri::command]
pub fn clipboard_write(text: String) -> Result<(), String> {
    #[cfg(windows)] { native::write(&text) }
    #[cfg(not(windows))] {
        let _ = text;
        Err("Системний буфер обміну доступний лише у Windows.".into())
    }
}
