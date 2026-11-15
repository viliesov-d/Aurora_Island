Warning: truncated output (original token count: 1112)
Total output lines: 38

# Aurora Island

Легкий Dynamic Island для Windows 10/11 на Tauri 2, Rust, React і TypeScript. Проєкт натхненний [Island](https://github.com/exuupery/island), [Atoll](https://github.com/Ebullioscopic/Atoll) та [win-dynamic-island](https://github.com/649472774/win-dynamic-island). Вихідний код цих проєктів не копіювався.

## Поточний стан

Це перший робочий етап: компактний always-on-top острів із розгортанням при наведенні або натисканні, spring-анімаціями, клікабельною областю форми острова, перетягуванням, чотирма стилями, локальними налаштуваннями (ширина, заокруглення, прозорість, акцентний колір, розмиття, інтенсивність скла, швидкість), годинником, батареєю, таймером, системним треєм, автозапуском і потоковим чатом через OpenAI Responses API. Ключ чату захищається Windows DPAPI. Текстові вкладення до 256 КБ додаються до запиту.

Реальне заломлення пікселів фону не реалізоване: Windows 11 отримує системний фон DWM (Desktop Acrylic), а відблиски зроблені CSS-шарами. На Windows 10 Liquid Glass переходить на CSS-матеріал. Це не фінальна реалізація повного ТЗ. Ще не підключені системний мікшер, керування музикою через SMTC, системні сповіщення, стан завантажень, історія буфера обміну, глобальні гарячі клавіші, англійська локалізація, збереже…112 tokens truncated…js 22+, Rust stable/MSVC, Microsoft C++ Build Tools, WebView2 Runtime та NSIS (для інсталятора).

```powershell
npm ci
npm run tauri -- dev
```

Збірка інсталятора:

```powershell
npm run tauri -- build --bundles nsis
```

Інсталятор буде у `src-tauri/target/release/bundle/nsis/`. GitHub Actions workflow `.github/workflows/build-windows.yml` виконує ту саму збірку на Windows Runner і зберігає `.exe` як workflow artifact.

## OpenAI API

Відкрийте Налаштування → OpenAI API key, вставте власний ключ і збережіть. Ключ захищається Windows DPAPI для поточного облікового запису. Запити йдуть напряму на `https://api.openai.com/v1/responses`, обрана модель — `gpt-4.1-mini`. Історія діалогів зберігається локально у браузерному сховищі WebView. Окрема кнопка відкриває особистий ChatGPT у браузері.

## Налаштування

Вибір теми, ширини, заокруглення, прозорості, акцентного кольору, розмиття, інтенсивності скла, швидкості анімації, автозгортання і доступних модулів зберігається локально у `localStorage`. Автозапуск додається до `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run`.

## Ліцензії

Власний код проєкту: MIT. Всі залежності зберігають свої ліцензії; див. відповідні записи пакетів Cargo/npm. Референсні репозиторії використані для ознайомлення з UX і Windows/Tauri архітектурними підходами, їхній код не скопійований.


## Покращення взаємодії (v0.2)

- Компактний острів за замовчуванням має ширину **280 px** та висоту **44 px**; панель відкривається в окремому віконному розмірі, не розтягуючи сам острів.
- Кнопки відкривають/згортають панель незалежно від наведення. Автоматичне відкриття після **650 мс** можна вимкнути в налаштуваннях.
- Системний drag запускається з окремої ручки; положення зберігається між запусками у локальному сховищі (центр по X та координата Y).
- Виправлено горизонтальне зміщення панелі під час motion-анімації: анімований `transform` більше не конфліктує з `translateX(-50%)`.
- Замість мікроскопічних шрифтів у панелі використано розбірливіші розміри; контент прокручується в межах вікна.
- Справжній таймер відраховує час до нуля, а не збільшує лічильник. Є пауза та кнопки зміни на п’ять хвилин.
- Оновлено SSE-парсинг: UTF-8 не декодується частинами, які можуть розривати українські символи.

Після оновлення на Windows перевірте кліки по іконках, рух за ручку, поведінку на дисплеях із масштабуванням 125%/150%, розгортання та згортання. Автоматична перевірка CI не замінює ручне тестування нативного вікна.


## Етап 3 — системна музика та гучність

- Нова вкладка **Музика** показує активний Windows SMTC сеанс: назву треку, виконавця, стан відтворення, доступні кнопки попередній / пауза / наступний, а також позицію (коли плеєр її надає).
- Гучність системного пристрою відтворення: 0–100%, перемикач mute. Працює через Core Audio, не через клавіатурні медіаклавіші.
- Компактний острів показує кнопку музики, коли є активна медіасесія. У налаштуваннях окремі перемикачі музики й звуку.
- Підтримуються плеєри, які надають сеанс через Windows SMTC; конкретний браузер/програвач може не підтримувати метадані або перемикання.
- Опитування SMTC — раз на 3 секунди при відкритій панелі і раз на 7 секунд у компактному стані, без окремих фонових процесів.

Перевірка на реальному Windows: запустіть трек у Spotify / браузері, відкрийте вкладку Музика, перевірте кнопки, системний повзунок гучності, mute і стан відсутності плеєра. Результати CI підтверджують компіляцію, але не взаємодію із системними медіасесіями.


## Island 1.2.10 reference: toolbox milestone

The `feat/island-toolbox-2026-11-15` branch adds a native-looking **Інструменти** tab without replacing the existing Tauri/Windows media architecture.

Implemented:
- Manual text clipboard history, search, pin, delete and copy. Browser clipboard access is permission-dependent. **No global clipboard watcher or automatic paste**.
- Session-only file shelf (add, list, save, remove). It **does not** yet support native drag-and-drop out of the island or persistence across application restarts.
- Text conversion: case, whitespace, JSON, URL encoding, Unicode-safe Base64, copy and handoff to the existing AI chat.
- Autosaved plain-text note.
- User-selected weather city with live temperature/wind via Open-Meteo. Weather requests require internet access.
- Local quick-links collection, with an HTTPS/HTTP scheme allowlist.
- In-window command palette with calculator, distance/mass/temperature conversions, in-app search and AI handoff. Ctrl+K works while the app has keyboard focus; system-wide Alt+Space is not yet available.
- Reminders stored locally with in-app due-time alerts while the app stays running.

Already implemented before this milestone: 4 themes, pill open/close, repositioning, battery, timer, secure API key, AI chat, SMTC music and Core Audio volume.

**Still to implement from the reference's feature list:** full Windows clipboard monitoring and secure paste, persistent native file shelf with drag-out, launcher for local apps/files and global search, global hotkeys, screen capture/markup/recording/OCR/QR/color picker, voice dictation, extended Windows controls (Bluetooth/Wi-Fi/VPN/power), native notification listener, downloads/OBS/Steam activity, AI agent hooks, media lyrics/equalizer, characters, full weather forecast/alerts, device selectors, and comprehensive Windows integration tests.

The source archive of Island 1.2.10 contains images and documentation, not the original application code. These are original Aurora features inspired by its behavior rather than a copy.

For Windows validation, also run `npm run tauri -- build --bundles nsis`, then manually verify WebView clipboard permissions, window hit-testing and weather requests. The frontend `npm run build` is not a substitute for Windows integration testing.

## Stage 2: Windows-native clipboard, shortcut, reminders

- **Clipboard (Windows):** native Unicode text read/write via Win32, with a 40 KiB read cap. Manual capture persists only when explicitly added. Automatic monitoring is **opt-in** in Settings and polls the Windows clipboard sequence number ~every 1.5 seconds. Automatically captured entries live only in the React/WebView process memory (neither sessionStorage nor localStorage); pinning an entry explicitly makes it persistent. Stored history can be deleted from the Tools tab. The first sample after activation is discarded.
- **Global shortcut:** `Ctrl+Alt+Space` summons the island's Command tab from another app, with an on/off toggle. If another program already owns the shortcut, an error is shown in Settings and Aurora still launches. `Ctrl+K` remains available when Aurora has keyboard focus. The hotkey currently has a fixed key combination.
- **Windows notifications:** optional native toasts for a completed timer and due reminders, powered by `tauri-plugin-notification`. Test from Settings. On Windows the notifications plugin requires an **installed application**; dev builds may display PowerShell branding. System notification settings / Focus Assist can suppress popups. The app must be running for reminders to fire, since there is no background Windows service.
- **Privacy:** no automatic clipboard read before consent; no uploads of captured text; no auto-paste into other apps. Users should disable monitoring when handling passwords or sensitive documents.
- **Scope:** this is not a native notification listener for *other apps* and it does not collect system notification contents. Those require a separate implementation with user consent.

Windows-specific testing: install the NSIS artifact, copy Unicode text in another app, enable monitoring and verify transient history, pin to preserve, press `Ctrl+Alt+Space` outside Aurora, test while hidden in tray, set a 1-minute reminder, and test the native toast button. Also test at 125%/150% display scaling.


## Visual refresh: sharp corners, Acrylic glass, magnetic edge

This redesign keeps the existing native player, ChatGPT/API chat, clipboard, notifications and toolbox unchanged.

- **Crisper edges:** the Win32 `SetWindowRgn` is now an *overscanned hit-test mask*, 7–10 logical pixels outside the CSS-rendered shell. CSS remains responsible for the visible rounded edge and its antialiasing. A narrow transparent margin can intercept clicks at the edge; the rest of the desktop stays interactive.
- **Native Acrylic:** Liquid Glass uses Windows 11 DWM backdrop (or legacy Windows 10 Acrylic when supported), plus a layered CSS reflective lens: high-frequency rim highlights, soft refractions mimicked in the reflection layer, saturated blur, changing specular highlights. It is **not** Apple's actual GPU optical refraction shader, and backdrop availability varies by Windows build/transparency settings.
- **Four truly distinct themes:** Classic (matte charcoal, Windows-style segmented UI), Liquid Glass (native acrylic, reflective/translucent surfaces), Soft Minimal (light matte with dark typography), Neon (angular futuristic edges and circuitry accents). Cards, typography, button shapes, borders, nav, backgrounds and shadows change together.
- **Cursor magnetism:** opt-in (default on), a native `GetCursorPos` sample ~14 times per second while the pill is collapsed, with an interpolated edge deformation and moving highlight. Disabled in reduced-motion mode and while expanded. Toggle in Settings → Behavior.
- **Readable expanded layout:** 568 logical px native window, up to 710 logical px high, limited by current monitor; 14 px content text, larger chat, cards, toolbar, settings and navigation. Delayed native window collapse allows the exit spring animation to finish before shrinking the hit region. Monitor size and DPI scaling are taken into account.

**Manual Windows QA before merging:** install the PR's NSIS artifact, test edges at 100/125/150/200% DPI, monitor boundaries, dragging, clickable controls in all themes, native Acrylic on Windows 10/11, animation smoothness, mouse attraction from outside the capsule, auto-hide, hotkey and tray. Check that the island does not block unrelated desktop clicks or leave an invisible region after collapse.


## Mechanic-parity milestone: Atoll reference (Fuwni)

This milestone ports core interaction **behavior** from [Atoll / dynamic-island-windows](https://github.com/Fuwni/dynamic-island-windows) to Aurora's Tauri 2/Rust/React architecture, with implementation specific to Aurora. Atoll is MIT licensed (Copyright (c) 2026 mykolaichechelnytskyi); see the [Atoll LICENSE](https://github.com/Fuwni/dynamic-island-windows/blob/main/LICENSE).

Completed in this milestone:
- **Single continuous spring-morph plate** behind compact and expanded content instead of the two separately floating surfaces. The native Windows hit-test region is one rounded rectangle when expanded so it no longer clips the visual bridge between the pill and full panel.
- **Compact live activity arbitration:** timer, media, charging, and a short timer-finished notice; while multiple activities are available, the mouse wheel over the pill cycles between them.
- **Safer pointer behavior:** do not treat a click on a button as a drag; begin native drag from the dedicated handle/background only after a >7 logical-pixel movement threshold; upward flick gesture on the handle can hide the pill.
- **Swipe-hide + restore strip:** small clickable (and hoverable) strip remains; original window position is saved separately and restored on return. Global hotkey can reopen the island as well. Position lock setting prevents accidental movement.
- **Atoll-style hover lifecycle:** 120ms to expand, about 420ms after leaving to fold, immediate close on an outside mouse press, but **never auto-fold during text input**. Close on Esc.
- **No global mouse hooks:** while expanded, the native cursor sampling command reports button state to the frontend, avoiding permissions and invasive monitoring. While compact, native spring hover remains optional.
- **Privacy:** no new data sent to Atoll, Microsoft, or any external service. Existing clipboard watching stays opt-in.

Not implemented by this foundational milestone: Atoll's complete multi-page feature set (calendar/ICS, game FPS, notification mirroring, Discord call sidepill, character animations, downloads monitoring, voice, OCR/QR, integrated AI-provider sign-in, updater, launchers and program controls); these require individual Windows services and UI components, not copying WPF sources into React.

**Windows QA:** installed NSIS artifact, compact↔expanded morph, Windows scaling (100/125/150/200%), clicking outside, editing chat input and settings text fields, cursor drag, swipe up and restore, global hotkey while hidden, wheel activity cycling with a timer + media simultaneously, near-screen edges, and tray behavior. UI build success alone does not prove runtime behavior.


## Windows shell hotfix (user-reported screenshots, 2026-11-15)
- Fixed a Windows 10/11 overlay bug where using native Acrylic on a transparent frameless WebView produced a **full rectangular translucent plate** outside the actual island; it could also cause native titlebar minimize/maximize/close buttons to reappear. We now turn off native whole-window Acrylic and explicitly strip non-client Win32 styles (at startup, after theme transitions, and after region updates).
- The Liquid Glass appearance retains rounded, masked CSS glass with stronger contrast and highlights; **true backdrop refraction is a later separate render-pass feature**, not claimed in this hotfix.
- Native window now expands *before* React begins the shell-morph animation; the delayed shrink waits for the spring to finish. The visible panel, Win32 hit region and typography no longer animate against mismatched viewport dimensions.
- Improved themes, settings grid, text contrast over bright wallpapers, button spacing and accessibility for 125% and 150% DPI.
- Opened as stacked PR from the Atoll mechanics branch; does not modify the default branch until Windows QA.

**Manual QA:** verify no OS titlebar; no grey rectangle outside compact/expanded capsule with high contrast wallpaper; click-through; expanding/collapsing and dragging; all four themes; switching between styles; readability and text wrapping; Windows 10 and 11 at 100/125/150% scaling. Test native Windows behavior on the installed .exe; browser/TypeScript build alone is not enough.

## Stage after the window hotfix: system volume/media HUD

- Aurora now checks *Windows system output volume* at a moderate, fixed interval (650ms) while shown. Changing the system volume or mute state through a keyboard/media key displays a compact, short-lived indicator. The first sample never triggers a notification.
- When Windows Media Session reports a new playing track, the collapsed island briefly displays its title (up to 32 characters); the compact media badge has a lightweight CSS equalizer.
- User-initiated volume changes *inside Aurora* suppress duplicate sound toasts. The effect is disabled automatically when the island is hidden and can be turned off in Settings > Behavior > "Системний HUD: гучність і нова музика".
- There is **no audio recording, microphone access, image capture or network transmission** for this feature.
- This is a focused initial system-events milestone inspired by Atoll; fullscreen/game handling, mic/camera privacy badges, downloads and third-party notifications are separate follow-ups.

**Test on Windows:** volume up/down/mute with hardware keys, paused music, new track, startup, hidden/restored island, disable HUD, reduced-motion animations. In particular, ensure that a music title change is never misreported as a system notification from a different app.
