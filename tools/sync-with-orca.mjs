#!/usr/bin/env node
// Диффер каталога перевода против en.json Orca: что добавить, что удалить,
// что реально надо перевести (в отличие от защищённого/oversize).
//
// Использование:
//   node tools/sync-with-orca.mjs /path/to/en.json                 # показать diff
//   node tools/sync-with-orca.mjs /path/to/en.json --export out.json  # выгрузить недостающее
//   node tools/sync-with-orca.mjs /path/to/en.json --export-batches DIR --batch-size 120
//
// en.json берётся из тега Orca, соответствующего установленной версии:
//   gh api "repos/stablyai/orca/contents/src/renderer/src/i18n/locales/en.json?ref=vX.Y.Z" \
//     --jq '.content' | base64 -d > /tmp/en-orca.json

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

const args = process.argv.slice(2)
const enPath = args.find((a) => !a.startsWith('--'))
let exportPath = null
let exportBatchesDir = null
let batchSize = 120
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--export') exportPath = args[++i]
  else if (args[i] === '--export-batches') exportBatchesDir = args[++i]
  else if (args[i] === '--batch-size') batchSize = parseInt(args[++i], 10)
}

if (!enPath || !fs.existsSync(enPath)) {
  console.error('Укажи путь к en.json Orca (см. заголовок файла).')
  process.exit(2)
}

function walk(o, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(o || {})) {
    const p = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, p, out)
    else out[p] = v
  }
  return out
}
function setPath(o, p, v) {
  const parts = p.split('.')
  let cur = o
  for (const key of parts.slice(0, -1)) cur = cur[key] ??= {}
  cur[parts.at(-1)] = v
}

const en = walk(JSON.parse(fs.readFileSync(enPath, 'utf8')))
const ruPath = path.join(repoRoot, 'locales', 'ru.json')
const ru = walk(JSON.parse(fs.readFileSync(ruPath, 'utf8')))

function isProtected(p) {
  return (
    p.startsWith('auto.components.settings.') &&
    /^plugin/i.test(p.slice('auto.components.settings.'.length))
  )
}

const added = Object.keys(en).filter((k) => !(k in ru))
const removed = Object.keys(ru).filter((k) => !(k in en))
// Наши заготовки под будущий фикс (Orca их ещё не читает) — это не мусор, не предлагать удалять.
const isPrepKey = (k) => k.startsWith('keybinding.')
const removedStale = removed.filter((k) => !isPrepKey(k))
const removedPrep = removed.filter(isPrepKey)

const addedProtected = added.filter(isProtected)
const addedOversize = added.filter((k) => typeof en[k] === 'string' && en[k].length > 8192)
const addedReal = added.filter((k) => !isProtected(k) && !(typeof en[k] === 'string' && en[k].length > 8192))

console.log(`\nen.json: ${Object.keys(en).length} ключей | наш каталог: ${Object.keys(ru).length}\n`)
console.log(`НОВЫЕ (нет у нас):        ${added.length}`)
console.log(`  защищённые (не берём):   ${addedProtected.length}`)
console.log(`  oversize (не берём):     ${addedOversize.length}`)
console.log(`  ПЕРЕВЕСТИ:               ${addedReal.length}`)
console.log(`УСТАРЕВШИЕ (удалить):      ${removedStale.length}`)
console.log(`НАШИ ЗАГОТОВКИ (оставить): ${removedPrep.length}${removedPrep.length ? ' — ключи keybinding.*, ждут фикса Orca' : ''}`)
console.log('')

if (addedReal.length) {
  console.log('Что переводить:')
  for (const k of addedReal.slice(0, 30)) {
    console.log(`  ${k} = ${JSON.stringify(en[k]).slice(0, 90)}`)
  }
  if (addedReal.length > 30) console.log(`  … ещё ${addedReal.length - 30}`)
}
if (removedStale.length) {
  console.log('\nУдалить из каталога:')
  for (const k of removedStale.slice(0, 30)) console.log(`  ${k}`)
  if (removedStale.length > 30) console.log(`  … ещё ${removedStale.length - 30}`)
}

// --export: вложенный JSON недостающего (в том же виде, что для перевода)
if (exportPath) {
  const out = {}
  for (const k of addedReal) setPath(out, k, en[k])
  fs.writeFileSync(exportPath, JSON.stringify(out, null, 1) + '\n', 'utf8')
  console.log(`\nВыгружено ${addedReal.length} строк → ${exportPath}`)
}

// --export-batches: разбить на батчи для перевода
if (exportBatchesDir) {
  fs.mkdirSync(exportBatchesDir, { recursive: true })
  const items = addedReal.map((k) => [k, en[k]])
  const n = Math.max(1, Math.ceil(items.length / batchSize))
  for (let i = 0; i < n; i++) {
    const chunk = Object.fromEntries(items.slice(i * batchSize, (i + 1) * batchSize))
    const f = path.join(exportBatchesDir, `batch${i + 1}.json`)
    fs.writeFileSync(f, JSON.stringify(chunk, null, 1) + '\n', 'utf8')
  }
  console.log(`\nРазбито на ${n} батчей по ~${batchSize} → ${exportBatchesDir}/batch*.json`)
}
