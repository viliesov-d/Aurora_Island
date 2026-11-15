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
- Reminders stored locally with in-app due-time alerts while the app stays running.

Already implemented before this milestone: 4 themes, pill open/close, repositioning, battery, timer, secure API key, AI chat, SMTC music and Core Audio volume.

**Still to implement from the reference's feature list:** full Windows clipboard monitoring and secure paste, persistent native file shelf with drag-out, launcher for local apps/files and global search, global hotkeys, screen capture/markup/recording/OCR/QR/color picker, voice dictation, extended Windows controls (Bluetooth/Wi-Fi/VPN/power), native notification listener, downloads/OBS/Steam activity, AI agent hooks, media lyrics/equalizer, characters, full weather forecast/alerts, device selectors, and comprehensive Windows integration tests.

The source archive of Island 1.2.10 contains images and documentation, not the original application code. These are original Aurora features inspired by its behavior rather than a copy.

For Windows validation, also run `npm run tauri -- build --bundles nsis`, then manually verify WebView clipboard permissions, window hit-testing and weather requests. The frontend `npm run build` is not a substitute for Windows integration testing.
