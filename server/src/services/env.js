// 环境变量只读总览（PLAN-admin §3 D10 / §5 / §7 配置分层边界）
//
// 定位修正（2026-10-11 使用者拍板分层配置）：.env 只管"基础设施秘密"，
// 网页**不提供** PATCH/编辑——只读总览每个键的配置状态。
//   · 敏感键（KEY/TOKEN/SECRET/PASSWORD/HASH/APIKEY/CLIENTID）永不回显明文，
//     只回 { set:true, preview:'前4…后2' }。
//   · 非敏感键也只读（value 供参考），要改仍需运维动服务器——本来就该少改。
//   · 业务配置（想网页改/热生效的）不在这里——走 data/site.json（services/settings.js）。
// 砍掉网页改 .env 的原因：容器内够不到宿主机文件、密钥过 HTTP 是红线、改 env 需重建。

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fail } from './errors.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

// 管理的三个 env 作用域：键 → 文件绝对路径（不写进返回值，防路径泄露也无妨但不必）
const SCOPES = {
  server: path.join(ROOT, 'server/.env'),
  asr: path.join(ROOT, 'asr/.env'),
  root: path.join(ROOT, '.env'),
}

const SENSITIVE_RE = /(KEY|TOKEN|SECRET|PASSWORD|PASSWD|HASH|APIKEY|API_KEY|CLIENTID|CLIENT_ID|PRIVATE)/i

function isSensitive(key) {
  return SENSITIVE_RE.test(key)
}

// 解析 .env 文本 → [{key, value, raw, isComment}]
function parseEnv(text) {
  return text.split('\n').map((line) => {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!m) return { raw: line, isComment: true }
    let rest = m[2]
    // 剥行内 # 注释：找第一个不在引号内的 #
    let inQ = null, cut = rest.length
    for (let i = 0; i < rest.length; i += 1) {
      const ch = rest[i]
      if (inQ) { if (ch === inQ) inQ = null; continue }
      if (ch === '"' || ch === "'") { inQ = ch; continue }
      if (ch === '#') { cut = i; break }
    }
    let value = rest.slice(0, cut).trimEnd()
    const comment = rest.slice(cut) // 含 # 起，写回时保留
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    return { key: m[1], value, comment, raw: line, isComment: false }
  })
}

function previewValue(v) {
  if (!v) return ''
  if (v.length <= 6) return '••••'
  return `${v.slice(0, 4)}…${v.slice(-2)}`
}

/**
 * GET /api/admin/env：返回各作用域的键与状态。
 * 形状：{ scopes: { server: { path, vars:[{key, sensitive, set, value?|preview?}] }, ... } }
 */
export async function listEnv() {
  const scopes = {}
  for (const [name, file] of Object.entries(SCOPES)) {
    let text = ''
    try {
      text = await readFile(file, 'utf8')
    } catch (err) {
      if (err.code === 'ENOENT') {
        scopes[name] = { exists: false, vars: [] }
        continue
      }
      throw fail('ENV_READ_FAILED', '读取服务配置失败，请稍后再试', 503, err)
    }
    const vars = parseEnv(text)
      .filter((e) => !e.isComment)
      .map((e) => {
        const sensitive = isSensitive(e.key)
        const set = Boolean(e.value)
        const item = { key: e.key, sensitive, set }
        if (sensitive) {
          item.preview = set ? previewValue(e.value) : ''
        } else {
          item.value = e.value
        }
        return item
      })
    scopes[name] = { exists: true, vars }
  }
  return { scopes }
}
