#!/usr/bin/env node
// Валидатор каталога перевода для плагина русской локализации Orca.
//
// Проверяет то же, что и Orca при установке, плюс то, что Orca не ловит:
//   - валидность JSON и форму каталога (лимиты Orca: 20k записей, глубина 16, значения <= 8192);
//   - защищённые пути auto.components.settings.Plugin* (кроме 34 разрешённых);
//   - дрейф плейсхолдеров {{...}} относительно en.json Orca (Orca это НЕ проверяет);
//   - покрытие en.json (чего ещё нет в переводе).
//
// Использование:
//   node tools/validate-catalog.mjs                      # проверить locales/ru.json
//   node tools/validate-catalog.mjs path/to/ru.json      # проверить другой файл
//   node tools/validate-catalog.mjs --with-en /tmp/en.json   # + сверка плейсхолдеров и покрытия
//
// Сверка с en.json — опциональна: чтобы получить en.json, скачай его из тега Orca
// (см. docs/WORKFLOW.md, шаг 2) и передай через --with-en.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

// Вендоренный валидатор Orca (из out/shared/plugins/). Обновляется при желании:
// node tools/vendor-refresh.mjs  (если добавишь такой скрипт) или вручную из app.asar.
const artifact = require(path.join(__dirname, 'vendor', 'plugin-language-pack-artifact.js'))

const args = process.argv.slice(2)
let catalogPath = null
let enPath = null
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--with-en') enPath = args[++i]
  else if (!catalogPath && !args[i].startsWith('--')) catalogPath = args[i]
}
const repoRoot = path.resolve(__dirname, '..')
catalogPath = catalogPath
  ? path.resolve(catalogPath)
  : path.join(repoRoot, 'locales', 'ru.json')

const problems = []
const notes = []

function fail(msg) { problems.push(msg) }
function note(msg) { notes.push(msg) }

// ---- 1. JSON + форма каталога (валидатор Orca) ----
let raw
try {
  raw = fs.readFileSync(catalogPath, 'utf8')
} catch (e) {
  console.error(`НЕ НАЙДЕН каталог: ${catalogPath}`)
  process.exit(2)
}
let json
try {
  json = JSON.parse(raw)
} catch (e) {
  fail(`невалидный JSON: ${e.message}`)
}

if (json) {
  const res = artifact.validatePluginLanguagePackCatalog(json)
  if (!res.ok) fail(`валидатор Orca отклонил каталог: ${res.error}`)
  else note(`валидатор Orca: OK, записей ${res.entries} (лимит ${artifact.PLUGIN_LANGUAGE_CATALOG_MAX_ENTRIES})`)
}

// ---- 2. Плоская карта листьев ----
function walk(o, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(o || {})) {
    const p = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, p, out)
    else out[p] = v
  }
  return out
}
const ru = json ? walk(json) : {}

// ---- 3. Размер файла (< 5 МБ — лимит артефакта плагина) ----
const sizeBytes = Buffer.byteLength(raw, 'utf8')
if (sizeBytes > 5 * 1024 * 1024) fail(`файл ${(sizeBytes / 1048576).toFixed(2)} МБ > 5 МБ`)
else note(`размер файла: ${(sizeBytes / 1024).toFixed(0)} КБ (лимит 5 МБ)`)

// ---- 4. Явные проверки, которые стоит видеть отдельно ----
const tooLong = Object.entries(ru).filter(([, v]) => typeof v === 'string' && v.length > 8192)
for (const [k, v] of tooLong) fail(`значение > 8192 (${v.length}) в ${k}`)

function isProtected(p) {
  if (!p.startsWith('auto.components.settings.')) return false
  return /^plugin/i.test(p.slice('auto.components.settings.'.length))
}
const protectedKeys = Object.keys(ru).filter(isProtected)
if (protectedKeys.length > 40) {
  // не ошибка: валидатор выше уже поймал бы запрещённое; это подсказка
  note(`protected-ключей: ${protectedKeys.length} (разрешённые chrome-пути ~34)`)
}

// ---- 5. Сверка с en.json (плейсхолдеры + покрытие) ----
if (enPath) {
  if (!fs.existsSync(enPath)) fail(`--with-en: файл не найден: ${enPath}`)
  else {
    const en = walk(JSON.parse(fs.readFileSync(enPath, 'utf8')))
    const ph = /\{\{\s*[\w.]+\s*\}\}/g
    let drift = 0
    for (const [k, ruv] of Object.entries(ru)) {
      const env = en[k]
      if (typeof env !== 'string' || typeof ruv !== 'string') continue
      const a = new Set((env.match(ph) || []).map((s) => s.replace(/\s+/g, '')))
      const b = new Set((ruv.match(ph) || []).map((s) => s.replace(/\s+/g, '')))
      const missing = [...a].filter((x) => !b.has(x))
      const extra = [...b].filter((x) => !a.has(x))
      if (missing.length || extra.length) {
        drift++
        fail(`плейсхолдеры ${k}: нет ${JSON.stringify(missing)}${extra.length ? `, лишние ${JSON.stringify(extra)}` : ''}`)
      }
    }
    if (!drift) note('плейсхолдеры: расхождений нет')

    const enKeys = Object.keys(en)
    const missingKeys = enKeys.filter((k) => !(k in ru))
    const extraKeys = Object.keys(ru).filter((k) => !(k in en))
    const extraPrep = extraKeys.filter((k) => k.startsWith('keybinding.'))
    const extraOther = extraKeys.filter((k) => !k.startsWith('keybinding.'))
    const missingProtected = missingKeys.filter(isProtected)
    const missingOversize = missingKeys.filter((k) => typeof en[k] === 'string' && en[k].length > 8192)
    const missingReal = missingKeys.filter(
      (k) => !isProtected(k) && !(typeof en[k] === 'string' && en[k].length > 8192)
    )
    note(`en.json: ${enKeys.length} ключей; в нашем каталоге ${Object.keys(ru).length}`)
    note(`  не покрыто: ${missingKeys.length} = защищённых ${missingProtected.length} + oversize ${missingOversize.length} + реально переводимых ${missingReal.length}`)
    note(`  наши заготовки keybinding.*: ${extraPrep.length} (не в en.json, ждут фикса Orca — это норма)`)
    if (extraOther.length) note(`  прочие лишние ключи (проверить): ${extraOther.length} — ${extraOther.slice(0, 10).join(', ')}${extraOther.length > 10 ? ' …' : ''}`)
    if (missingReal.length) {
      note(`  реально надо перевести: ${missingReal.slice(0, 20).join(', ')}${missingReal.length > 20 ? ' …' : ''}`)
    }
  }
} else {
  note('en.json не передан (--with-en) — проверка плейсхолдеров и покрытия пропущена')
}

// ---- Итог ----
console.log('')
console.log(`Каталог: ${catalogPath}`)
for (const n of notes) console.log(`  · ${n}`)
if (problems.length) {
  console.log('')
  console.log(`ОШИБКИ (${problems.length}):`)
  for (const p of problems) console.log(`  ✗ ${p}`)
  console.log('')
  process.exit(1)
} else {
  console.log('')
  console.log('  ✓ ВСЁ ХОРОШО')
  process.exit(0)
}
