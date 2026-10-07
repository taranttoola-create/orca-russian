# KNOWLEDGE.md — факты об Orca и накопленные грабли

Технические знания, добытые в процессе. Многие — результат разбора исходников Orca
и экспериментов. Не выводи заново то, что уже здесь.

## Плагины-языковые паки: как работает

- Манифест `orca-plugin.json`: `manifestVersion: 1`, `pluginApi: 1`, `contributes.languagePacks`
  со списком `{ locale, path }`.
- Orca читает каталог и добавляет его как ресурс i18next под синтетическим языком
  (`plugin<hex>`). Выбор языка хранится в `orca-data.json` → `settings.uiLanguage`.
- **Валидатор каталога** (`out/shared/plugins/plugin-language-pack-artifact.js`):
  - корень — объект;
  - ≤ 20 000 записей;
  - глубина ≤ 16;
  - значения — строки ≤ **8192** символов;
  - ключи: без точек, без управляющих символов, ≤ 128 символов, не `__proto__`/`prototype`/`constructor`;
  - **защищённые пути** `auto.components.settings.Plugin*` отклоняют весь каталог,
    кроме 34 разрешённых «chrome»-путей из `plugin-translatable-chrome.ts`.
- **Лимиты артефакта плагина:** языковой файл ≤ 5 МБ; содержимое ≤ 2000 файлов / 50 МБ;
  симлинки запрещены; сегменты путей проверяются на Windows-совместимость.

## Правило зарезервированных id (важно)

Начиная с Orca 1.4.196, плагин с id, начинающимся на `orca-`, разрешён **только** если
источник — организация `stablyai` на GitHub. Иначе:
`reserved plugin identity ... must resolve to the stablyai organization`, а UI показывает
общее «Plugin installation failed». **Наш id — `russian`, не трогать.**

## Правило установки из Git (проверено на 1.4.212 и 1.4.218)

- URL обязан быть HTTPS или SSH (исполняемые git-хелперы запрещены).
- **Обязателен `#ref`** (тег или коммит) — иначе ошибка «Add an explicit #ref».
- Установка идёт в временную папку, затем копируется в
  `~/Library/Application Support/Orca/plugins/<pluginKey>/<contentHash>/`.
- `current` — указатель на активную версию; старая версия сохраняется (можно откатить).
- Запись в `plugins.lock.json` хранит `ref`, `resolvedCommit`, `contentHash`.


## Свой источник маркетплейса (проверено на 1.4.219)

Позволяет раздавать пак, не дожидаясь `stablyai/orca-plugins`: пользователь добавляет репозиторий
как источник и ставит/обновляет плагин из вкладки **All**.

- Индекс — файл **`orca-marketplace.json` в корне репозитория** (константа
  `PLUGIN_MARKETPLACE_FILENAME`), лимит 16 МиБ, читается `pluginMarketplaceSchema.parse`.
- Схема (zod, `strictObject`): `{name, owner, plugins:[{id, source{kind:"git",url,ref},
  description?, categories[]}]}`; лишние ключи запрещены, `owner` — регексп
  `^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$`, `categories` — слаги, значения из
  `["themes","icons","icon-themes","terminal-themes","skills"]` **отбрасываются** при показе.
- `id` — квалифицированный ключ `<publisher>.<id>`; при установке Orca сверяет его с манифестом
  из репозитория (`expectedPluginKey`), так что он обязан совпадать.
- Диалог **Settings → Plugins → Manage sources → Add source** («Marketplace sources») имеет два
  обязательных поля: **Git URL** и **Git ref**; ref предзаполнен `main` и без него кнопка не активна.
- Порядок работы: `git clone <url> <ref>` во временную папку → чтение `orca-marketplace.json` →
  снапшот; при установке — повторный клон по `source.ref` из записи.
- Проверка индекса «как в Orca» (без запуска приложения):
  `npx @electron/asar` → распаковать `out/shared` и `out/main` → `require` модуля
  `out/shared/plugins/plugin-marketplace.js` → `pluginMarketplaceSchema.safeParse(json)`.

## Генерация ключей в каталоге Orca (для понимания, почему строк нет)

Инструмент `config/scripts/localize-renderer-strings.mjs` генерирует ключи так:
```
sha1(`${filePath}:${text}`).digest('hex').slice(0, 10)
→ `auto.<ключ-из-пути>.<hash>`
```
Пример: `auto.components.settings.ShortcutCommandBlock.287e07ddde`.
**Следствие:** строки, которые не обёрнуты в `translate()` в месте вызова, в каталоге
отсутствуют и недостижимы для языкового пака. Так устроены названия сочетаний клавиш,
имена команд в палитре, часть настроек терминала и шорткатов.

## Что НЕ переводится через языковой пак

| Что | Почему | Статус |
| --- | --- | --- |
| Названия сочетаний клавиш (88 шт + 42 вкладки агентов + 9 групп) | хардкод в `src/shared/keybindings/definitions-core-*.ts`, рендер без `translate()` | issue **#25048**, патч отправлен; наш задел — 139 ключей `keybinding.*` в v1.3.3 |
| Плюральные формы (`_few`/`_many`) | Orca выбирает форму в JS по `_one`/`_other`; CLDR для ru не используется | PR #12505 (чужой), не смержен |
| Защищённые диалоги доверия плагинов | Orca запрещает намеренно (безопасность) | переводить не нужно и нельзя |
| ~3990 строк-литералов вне каталога | не обёрнуты в `translate()` | дамп отправлен в #17913 |

## Плюрали: как устроено

- Ключи вида `..._one` / `..._other`. У нас 19 семейств, заполнены корректно.
- Orca выбирает форму тернарником `count === 1 ? _one : _other` в коде, поэтому форм
  `_few`/`_many` **в каталоге быть не должно** (мёртвый груз) и они ничего не дадут.
- Для русского это значит: при 2–4 покажется форма `_other` («5 запусков» вместо «2 запуска»).
  Исправимо только в приложении.

## Где искать исходники Orca для сверки

Не клонировать весь репозиторий (тяжёлый, ~400 МБ, может виснуть). Варианты:

```bash
# 1) Отдельные файлы через API:
gh api "repos/stablyai/orca/contents/<путь>?ref=vX.Y.Z" --jq '.content' | base64 -d

# 2) Список файлов в дереве:
gh api "repos/stablyai/orca/git/trees/vX.Y.Z?recursive=1" --jq '.tree[].path' | grep <что-то>

# 3) Sparse checkout (только нужные папки):
git init orca-src && cd orca-src
git remote add origin https://github.com/stablyai/orca
git config core.sparseCheckout true
printf '/src/shared/keybindings/\n/src/renderer/src/i18n/\n' > .git/info/sparse-checkout
git fetch --depth 1 origin refs/tags/vX.Y.Z && git checkout FETCH_HEAD
```

Проверять валидатором можно и без исходников — распаковав `app.asar`
(`tools/validate-catalog.mjs` делает это сам через `npx @electron/asar`).

## Отдельные распаковки Orca делать с осторожностью

- `app.asar` подписан; **правка `app.asar` ломает подпись** и приводила к белому экрану.
  Восстановление: `brew upgrade --cask --force stablyai/orca/orca`.
- Не патчить установленную Орку. Все изменения — только через языковой пак или апстрим.

## Наш каталог: опорные цифры (v1.3.5)

- Переводов: **15 196** (с вложенностью при валидации — 17 076).
- Целевой каталог Orca 1.4.222: 15 239 ключей.
- Не покрыто: 182 = 180 защищённых `Plugin*` + 2 oversize CSS. Это норма, не долг; допустимых недостающих строк и устаревших ключей нет.
- Сохранены 139 резервных ключей `keybinding.*`; Orca 1.4.222 их ещё не читает.
- Размер файла: 1354 КБ (лимит 5 МБ). Индекс маркетплейса указывает на v1.3.5.
- В Orca 1.4.222 добавлены 43 ключа локализации настроек оболочки терминала; они переведены в v1.3.5. Названия действий сочетаний клавиш и русские плюрали в этом релизе не исправлены.
