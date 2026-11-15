import { Music2, Pause, Play, RefreshCw, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";

export type MediaState = {
  available: boolean;
  title: string;
  artist: string;
  source: string;
  playing: boolean;
  canNext: boolean;
  canPrevious: boolean;
  positionSeconds: number;
  durationSeconds: number;
};
export type VolumeState = { percent: number; muted: boolean };

type Props = {
  media: MediaState | null;
  volume: VolumeState | null;
  mediaEnabled: boolean;
  volumeEnabled: boolean;
  busy: boolean;
  error: string;
  onControl: (action: "toggle" | "next" | "previous") => void;
  onVolumeChange: (percent: number) => void;
  onMute: () => void;
  onRefresh: () => void;
};

const asTime = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function MediaPane({
  media, volume, mediaEnabled, volumeEnabled, busy, error,
  onControl, onVolumeChange, onMute, onRefresh
}: Props) {
  const active = mediaEnabled && media?.available === true;
  const duration = media?.durationSeconds ?? 0;
  const position = media?.positionSeconds ?? 0;
  const progress = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;
  const source = media?.source?.split(/[\\/]/).pop() || "Windows Media";

  return <div className="media-screen">
    {mediaEnabled && <section className="media-player">
      <div className="media-kicker">ЗАРАЗ ВІДТВОРЮЄТЬСЯ</div>
      <div className="media-cover"><Music2 size={36} strokeWidth={1.5}/></div>
      {active ? <>
        <div className="media-track-name" title={media?.title}>{media?.title || "Невідомий трек"}</div>
        <div className="media-track-artist">{media?.artist || "Невідомий виконавець"}</div>
        <div className="media-app-source">{source}</div>
        <div className="media-controls">
          <button title="Попередній трек" aria-label="Попередній трек" disabled={busy || !media?.canPrevious} onClick={()=>onControl("previous")}><SkipBack size={19}/></button>
          <button className="play-primary" title={media?.playing?"Пауза":"Відтворити"} aria-label={media?.playing?"Пауза":"Відтворити"} disabled={busy} onClick={()=>onControl("toggle")}>{media?.playing?<Pause size={22} fill="currentColor"/>:<Play size={22} fill="currentColor"/>}</button>
          <button title="Наступний трек" aria-label="Наступний трек" disabled={busy || !media?.canNext} onClick={()=>onControl("next")}><SkipForward size={19}/></button>
        </div>
        {duration>0 && <div className="media-progress">
          <div className="media-progress-track"><i style={{width:`${progress}%`}}/></div>
          <div className="media-progress-labels"><span>{asTime(position)}</span><span>{asTime(duration)}</span></div>
        </div>}
      </> : <div className="media-empty">
        <b>Немає активної музики</b>
        Запустіть відтворення в Spotify, браузері або іншому плеєрі, що підтримує Windows SMTC.
      </div>}
    </section>}
    {volumeEnabled && <section className="volume-card">
      <div className="volume-top"><strong>Системна гучність</strong><span>{volume ? `${volume.percent}%` : "Недоступна"}</span></div>
      <div className="volume-controls">
        <button className="volume-toggle" aria-label={volume?.muted?"Увімкнути звук":"Вимкнути звук"} title={volume?.muted?"Увімкнути звук":"Вимкнути звук"} disabled={!volume} onClick={onMute}>
          {volume?.muted||volume?.percent===0?<VolumeX size={18}/>:<Volume2 size={18}/>}
        </button>
        <input className="volume-range" type="range" min={0} max={100} step={1} value={volume?.percent??0} disabled={!volume} aria-label="Гучність Windows" onChange={e=>onVolumeChange(Number(e.target.value))}/>
      </div>
    </section>}
    {error && <div className="media-error" role="alert">{error}</div>}
    <button className="media-refresh" onClick={onRefresh}><RefreshCw size={13} style={{verticalAlign:"middle",marginRight:5}}/> Оновити стан</button>
  </div>;
}
