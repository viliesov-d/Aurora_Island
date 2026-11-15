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
