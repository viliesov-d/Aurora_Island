//! Native media controls via Windows SMTC and endpoint volume via Core Audio.
use serde::Serialize;

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaState {
    pub available: bool,
    pub title: String,
    pub artist: String,
    pub source: String,
    pub playing: bool,
    pub can_next: bool,
    pub can_previous: bool,
    pub position_seconds: u64,
    pub duration_seconds: u64,
}
#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VolumeState { pub percent: u8, pub muted: bool }

#[cfg(windows)]
mod native {
    use super::{MediaState, VolumeState};
    use std::sync::OnceLock;
    use windows::Media::Control::{
        GlobalSystemMediaTransportControlsSessionManager,
        GlobalSystemMediaTransportControlsSessionPlaybackStatus,
    };
    use windows::Win32::Media::Audio::{eMultimedia, eRender, IMMDeviceEnumerator, MMDeviceEnumerator};
    use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_ALL, COINIT_MULTITHREADED,
    };

    static MEDIA_MANAGER: OnceLock<GlobalSystemMediaTransportControlsSessionManager> = OnceLock::new();

    async fn manager() -> Result<GlobalSystemMediaTransportControlsSessionManager, String> {
        if let Some(cached) = MEDIA_MANAGER.get() { return Ok(cached.clone()); }
        windows::core::init_mta().map_err(|e| e.to_string())?;
        let created = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
            .map_err(|e| e.to_string())?
            .await.map_err(|e| e.to_string())?;
        let _ = MEDIA_MANAGER.set(created.clone());
        Ok(created)
    }

    pub async fn media_state() -> Result<MediaState, String> {
        let manager = manager().await?;
        let session = match manager.GetCurrentSession() {
            Ok(session) => session,
            Err(_) => return Ok(MediaState::default()),
        };
        let mut result = MediaState {
            available: true,
            source: session.SourceAppUserModelId().map(|s| s.to_string()).unwrap_or_default(),
            ..MediaState::default()
        };
        if let Ok(info) = session.GetPlaybackInfo() {
            result.playing = info.PlaybackStatus().map(|s| s == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing).unwrap_or(false);
            if let Ok(controls) = info.Controls() {
                result.can_next = controls.IsNextEnabled().unwrap_or(false);
                result.can_previous = controls.IsPreviousEnabled().unwrap_or(false);
            }
        }
        if let Ok(operation) = session.TryGetMediaPropertiesAsync() {
            if let Ok(props) = operation.await {
                result.title = props.Title().map(|s| s.to_string()).unwrap_or_default();
                result.artist = props.Artist().map(|s| s.to_string()).unwrap_or_default();
            }
        }
        if let Ok(timeline) = session.GetTimelineProperties() {
            let start = timeline.StartTime().map(|t| t.Duration).unwrap_or(0);
            let end = timeline.EndTime().map(|t| t.Duration).unwrap_or(0);
            let position = timeline.Position().map(|t| t.Duration).unwrap_or(0);
            if end > start {
                result.duration_seconds = ((end - start) / 10_000_000) as u64;
                result.position_seconds = ((position - start).max(0) / 10_000_000) as u64;
                result.position_seconds = result.position_seconds.min(result.duration_seconds);
            }
        }
        Ok(result)
    }

    pub async fn media_control(action: &str) -> Result<(), String> {
        let manager = manager().await?;
        let session = manager.GetCurrentSession().map_err(|_| "Немає активної медіасесії.".to_string())?;
        let request = match action {
            "toggle" => session.TryTogglePlayPauseAsync(),
            "next" => session.TrySkipNextAsync(),
            "previous" => session.TrySkipPreviousAsync(),
            _ => return Err("Невідома команда медіаплеєра.".to_string()),
        };
        if request.map_err(|e| e.to_string())?.await.map_err(|e| e.to_string())? {
            Ok(())
        } else {
            Err("Плеєр не підтримує цю команду.".to_string())
        }
    }

    struct ComScope(bool);
    impl Drop for ComScope {
        fn drop(&mut self) { if self.0 { unsafe { CoUninitialize(); } } }
    }
    fn with_endpoint<T>(f: impl FnOnce(&IAudioEndpointVolume) -> windows::core::Result<T>) -> Result<T, String> {
        // A sync Tauri command uses a worker thread, so initialize COM for that thread.
        let _scope = ComScope(unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) }.is_ok());
        let endpoint = (|| -> windows::core::Result<IAudioEndpointVolume> {
            let enumerator: IMMDeviceEnumerator = unsafe {
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?
            };
            let device = unsafe { enumerator.GetDefaultAudioEndpoint(eRender, eMultimedia)? };
            unsafe { device.Activate(CLSCTX_ALL, None) }
        })().map_err(|e| e.to_string())?;
        f(&endpoint).map_err(|e| e.to_string())
    }
    fn snapshot(endpoint: &IAudioEndpointVolume) -> windows::core::Result<VolumeState> {
        let fraction = unsafe { endpoint.GetMasterVolumeLevelScalar()? };
        let muted = unsafe { endpoint.GetMute()?.as_bool() };
        Ok(VolumeState { percent: (fraction.clamp(0.0,1.0)*100.0).round() as u8, muted })
    }
    pub fn get_volume() -> Result<VolumeState, String> { with_endpoint(snapshot) }
    pub fn set_volume(percent: u8) -> Result<VolumeState, String> {
        if percent > 100 { return Err("Гучність повинна бути від 0 до 100.".into()); }
        with_endpoint(|endpoint| {
            unsafe { endpoint.SetMasterVolumeLevelScalar(percent as f32/100.0, std::ptr::null())?; }
            snapshot(endpoint)
        })
    }
    pub fn set_mute(muted: bool) -> Result<VolumeState, String> {
        with_endpoint(|endpoint| {
            unsafe { endpoint.SetMute(muted, std::ptr::null())?; }
            snapshot(endpoint)
        })
    }
}

#[tauri::command]
pub async fn media_state() -> Result<MediaState, String> {
    #[cfg(windows)] { native::media_state().await }
    #[cfg(not(windows))] { Ok(MediaState::default()) }
}
#[tauri::command]
pub async fn media_control(action: String) -> Result<(), String> {
    #[cfg(windows)] { native::media_control(&action).await }
    #[cfg(not(windows))] { let _=action; Err("Медіакерування доступне лише у Windows.".into()) }
}
#[tauri::command]
pub fn get_volume() -> Result<VolumeState, String> {
    #[cfg(windows)] { native::get_volume() }
    #[cfg(not(windows))] { Err("Гучність доступна лише у Windows.".into()) }
}
#[tauri::command]
pub fn set_volume(percent: u8) -> Result<VolumeState, String> {
    #[cfg(windows)] { native::set_volume(percent) }
    #[cfg(not(windows))] { let _=percent; Err("Гучність доступна лише у Windows.".into()) }
}
#[tauri::command]
pub fn set_mute(muted: bool) -> Result<VolumeState, String> {
    #[cfg(windows)] { native::set_mute(muted) }
    #[cfg(not(windows))] { let _=muted; Err("Гучність доступна лише у Windows.".into()) }
}
