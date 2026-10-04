# WORKFLOW.md — как выпускать новые версии

Пошаговый процесс. Выполняй по порядку, ничего не пропуская.

## Предусловия

- Есть доступ к сети (GitHub, GitVerse, raw-файлы Orca).
- Для пуша в GitVerse нужен ключ: `~/.ssh/id_ed25519_gitverse` (в ssh-агент не загружен,
  передавай явно через `GIT_SSH_COMMAND`, см. ниже).
- Для проверки каталога нужен распакованный `app.asar` — `tools/validate-catalog.mjs`
  распаковывает сам (использует `npx @electron/asar`).

## Шаг 1. Узнать актуальную версию Orca

```bash
defaults read /Applications/Orca.app/Contents/Info.plist CFBundleShortVersionString
```

## Шаг 2. Скачать каталог Orca этой версии

```bash
# тег должен существовать в репозитории stablyai/orca
gh api "repos/stablyai/orca/contents/src/renderer/src/i18n/locales/en.json?ref=vX.Y.Z" \
  --jq '.content' | base64 -d > /tmp/en-orca.json
```

## Шаг 3. Посчитать diff

```bash
node tools/sync-with-orca.mjs /tmp/en-orca.json
# покажет: сколько новых ключей, сколько удалено, сколько изменено,
# сколько из новых защищённых (>8192, Plugin*) и сколько реально надо перевести
```

## Шаг 4. Перевести недостающее

- Экспортируй недостающее в батчи (инструмент подскажет команду).
- Переводи по правилам из `CONTRIBUTING.md` (глоссарий, плейсхолдеры, продуктовые имена).
- Рекомендуется по одному батчу за раз, не параллельно (лимиты API).

## Шаг 5. Собрать новый `locales/ru.json`

- Добавить переводы, удалить устаревшие ключи, вычистить пустые контейнеры.
- **Не добавлять** значения > 8192 символов.
- **Не добавлять** пути `auto.components.settings.Plugin*` (кроме 34 разрешённых — они уже есть).

## Шаг 6. Проверить

```bash
node tools/validate-catalog.mjs
# проверяет: валидность JSON, лимиты (20k записей, глубина 16, значения <= 8192),
# защищённые пути, дрейф плейсхолдеров, покрытие en.json
```

Всё должно быть зелёным. Если нет — чини, не выпускай.

## Шаг 7. Поднять версию и обновить метаданные

1. `orca-plugin.json` → поднять `version` (например 1.3.4 → 1.3.5).
2. `CHANGELOG.md` → добавить запись сверху (дата, что изменилось).
3. `README.md` → обновить таблицу версий, счётчик строк, ссылки `#vX.Y.Z`.
4. `CONTRIBUTING.md` → обновить пример `git tag vX.Y.Z` (если там зафиксирован).

## Шаг 8. Закоммитить, поставить тег, запушить в ОБА зеркала

```bash
git add -A
git commit -m "vX.Y.Z: краткое описание"
git tag vX.Y.Z

git push origin main --tags
GIT_SSH_COMMAND="ssh -i ~/.ssh/id_ed25519_gitverse -o IdentitiesOnly=yes" \
  git push gitverse main --tags
```

Проверить, что обе ссылки отдают один коммит:
```bash
git ls-remote origin main refs/tags/vX.Y.Z
GIT_SSH_COMMAND="ssh -i ~/.ssh/id_ed25519_gitverse -o IdentitiesOnly=yes" \
  git ls-remote gitverse main refs/tags/vX.Y.Z
```

## Шаг 9. Проверить, что ставится (чистый клон)

```bash
d=$(mktemp -d)
git clone -q --depth 1 --branch vX.Y.Z https://github.com/taranttoola-create/orca-russian "$d"
node tools/validate-catalog.mjs "$d/locales/ru.json"
rm -rf "$d"
```

## Шаг 10. Создать GitHub-релиз (чтобы была чистая ссылка «на версию»)

```bash
gh release create vX.Y.Z --repo taranttoola-create/orca-russian \
  --title "vX.Y.Z — ..." --notes-file CHANGELOG-entry.md --latest
```

Ссылка «на последнюю версию»: `https://github.com/taranttoola-create/orca-russian/releases/latest`

## Шаг 11. Обновить PR в маркетплейс (если он ещё открыт)

```bash
# в форке orca-plugins, ветка add-russian-language-pack
sed -i '' 's|"ref": "vX.Y.Z_старый"|"ref": "vX.Y.Z"|' orca-marketplace.json
git commit -am "Update Russian pack to vX.Y.Z"
git push origin add-russian-language-pack
```

Заголовок PR тоже обновить через `gh pr edit 9 --repo stablyai/orca-plugins --title "..."`.

## Шаг 11а. Обновить свой источник маркетплейса

`orca-marketplace.json` в корне этого репозитория — индекс для «своего источника
маркетплейса». В нём лежит **тег**, а не «последняя версия», поэтому при выпуске его нужно
переставить на новый тег, иначе пользователи этого источника останутся на старой версии:

```bash
sed -i '' 's|"ref": "vX.Y.Z_старый"|"ref": "vX.Y.Z"|' orca-marketplace.json
git commit -am "Индекс маркетплейса: vX.Y.Z"
git push origin main
```

Обновить заодно и число записей в `description`, если оно изменилось. Индекс читается Orca
из корня репозитория (лимит 16 МиБ) — сам файл версии не имеет, отдельный тег ему не нужен.

## Шаг 12. Обновить пак в своей Orca (вручную)

Orca **не** обновляет git-плагин сама: `current` в
`~/Library/Application Support/Orca/plugins/taranttoola-create.russian/` продолжает
указывать на старую копию, пока пак не переустановят. Поэтому после каждого релиза:

Settings → Plugins → Install plugin → вкладка **Git URL** → вставить
`https://github.com/taranttoola-create/orca-russian#vX.Y.Z`
Затем: Settings → Appearance → Language → «Русский язык для Orca» (после переименования
id или установки заново язык приходится выбирать повторно — старый id в `uiLanguage`
не разрешается).

Инсталлятор Orca кладёт содержимое в `plugins/<pluginKey>/<contentHash>/` и пишет
provenance в `.install-provenance/<contentHash>.json` (там `resolvedCommit` и `ref`).
Проверить, какая версия активна, можно так:

```bash
P="$HOME/Library/Application Support/Orca/plugins/taranttoola-create.russian"
jq -r .entry.version "$P/.install-provenance/$(cat "$P/current").json"
```

**Не подменять содержимое в этой папке руками** — имя каталога и provenance связаны,
чистая переустановка через UI надёжнее.

## Частые ошибки при пуше

- **GitVerse: Permission denied (publickey)** → ключ не в агенте. Используй
  `GIT_SSH_COMMAND="ssh -i ~/.ssh/id_ed25519_gitverse -o IdentitiesOnly=yes"`.
- **Тег уже существует на remote** → если пересоздаёшь тег: `git push -f origin <tag>`.
- **GitHub: tag already exists** → то же, форс-пуш тега.
