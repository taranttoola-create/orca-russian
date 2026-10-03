# tools/ — инструменты проекта

Самодостаточные скрипты для проверки и синхронизации перевода. Не требуют ничего, кроме Node.

## validate-catalog.mjs

Проверяет каталог `locales/ru.json` (или указанный файл) на всё, что важно при установке.

```bash
node tools/validate-catalog.mjs                          # проверить locales/ru.json
node tools/validate-catalog.mjs path/to/ru.json          # другой файл
node tools/validate-catalog.mjs --with-en /tmp/en.json   # + плейсхолдеры и покрытие
```

Что проверяет:
- **валидатором самой Orca** (вендоренный `vendor/plugin-language-pack-artifact.js`) —
  форма каталога, лимиты 20k записей / глубина 16 / значения ≤ 8192, защищённые пути;
- размер файла (< 5 МБ — лимит артефакта плагина);
- значения > 8192 отдельно;
- **дрейф плейсхолдеров** `{{...}}` относительно en.json — этого Orca НЕ делает, а строки
  с потерянной подстановкой отображаются криво (уже проскакивало в релиз);
- покрытие en.json: сколько не покрыто и почему (защищённые / oversize / реально переводимые).

Код возврата: 0 — всё хорошо, 1 — есть ошибки.

## sync-with-orca.mjs

Считает разницу между каталогом Orca (`en.json`) и нашим переводом.

```bash
node tools/sync-with-orca.mjs /path/to/en.json                      # показать diff
node tools/sync-with-orca.mjs /path/to/en.json --export missing.json
node tools/sync-with-orca.mjs /path/to/en.json --export-batches /tmp/batches --batch-size 120
```

Выводит: сколько новых ключей (и из них сколько реально переводить, сколько защищённых и
oversize), сколько устаревших (удалить), сколько наших заготовок `keybinding.*` (оставить).

`--export` пишет недостающее одним вложенным JSON — как раз в формате для перевода.
`--export-batches` сразу делит на батчи по N строк.

## Где брать en.json

Из тега Orca, соответствующего установленной версии:

```bash
V=$(defaults read /Applications/Orca.app/Contents/Info.plist CFBundleShortVersionString)
gh api "repos/stablyai/orca/contents/src/renderer/src/i18n/locales/en.json?ref=v$V" \
  --jq '.content' | base64 -d > /tmp/en-orca.json
node tools/sync-with-orca.mjs /tmp/en-orca.json
```

## vendor/

Вендоренные модули валидатора Orca, извлечённые из `app.asar`:
- `plugin-language-pack-artifact.js` — валидатор каталога;
- `plugin-translatable-chrome.js` — список 34 разрешённых «chrome»-путей.

Обновляются при выходе новых версий Orca, если правила поменялись:

```bash
cd tools/vendor
npx --yes @electron/asar extract-file /Applications/Orca.app/Contents/Resources/app.asar \
  out/shared/plugins/plugin-language-pack-artifact.js
npx --yes @electron/asar extract-file /Applications/Orca.app/Contents/Resources/app.asar \
  out/shared/plugins/plugin-translatable-chrome.js
```

`extract-file` складывает файл в текущую папку — запускать из `tools/vendor/`.
Если в новых версиях валидатор стал требовать другие модули (напр. `zod`), проверь
`node tools/validate-catalog.mjs` — он сообщит.
