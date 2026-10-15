// 站点信息与个人信息管理（PLAN-admin §11）。
// 读写边界：site.json 保存站点/联系方式，profile.md frontmatter 保存个人信息。
// 本服务只负责契约与文件写入；路由注册由独立板块处理，避免与其他 agent 冲突。
import { readFile, writeFile, rename, unlink } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { DATA_DIR } from '../storage/files.js'
import { fail } from './errors.js'
import { validateCurated } from './curated.js'

const SITE_FILE = path.join(DATA_DIR, 'site.json')
const PROFILE_FILE = path.join(DATA_DIR, 'profile.md')
const GITHUB_RE = /^[A-Za-z0-9-]{1,39}$/
const SOCIAL_LIMIT = 12

function emptyProfile() {
  return { nickname: '', avatar: '', bio: '', github: '' }
}

async function readText(file) {
  try { return await readFile(file, 'utf8') } catch (err) {
    if (err.code === 'ENOENT') return ''
    throw fail('SITE_PROFILE_READ_FAILED', '读取站点信息失败，请稍后再试', 503, err)
  }
}

function parseProfile(raw) {
  const profile = emptyProfile()
  if (!raw.startsWith('---')) return profile
  const close = raw.indexOf('\n---', 3)
  if (close < 0) return profile
  for (const line of raw.slice(3, close).split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const at = trimmed.indexOf(':')
    if (at < 0) continue
    const key = trimmed.slice(0, at).trim()
    if (!(key in profile)) continue
    profile[key] = trimmed.slice(at + 1).trim().replace(/^['"]|['"]$/g, '')
  }
  return profile
}

function validateString(value, field, max, required = false) {
  const result = String(value ?? '').trim()
  if (required && !result) throw fail('VALIDATION_FAILED', `${field}不能为空`)
  if ([...result].length > max) throw fail('VALIDATION_FAILED', `${field}最多${max}字`)
  return result
}

function validateUrl(value, field) {
  const url = validateString(value, field, 500)
  if (url && !/^(?:https?:\/\/|mailto:)/i.test(url)) {
    throw fail('VALIDATION_FAILED', `${field}只允许 http://、https:// 或 mailto:`)
  }
  return url
}

function validateAvatar(value) {
  const avatar = validateString(value, 'avatar', 500)
  if (avatar && !(/^(?:\/images\/|https?:\/\/)/i.test(avatar))) {
    throw fail('VALIDATION_FAILED', 'avatar只允许 /images/ 路径或 https URL')
  }
  return avatar
}

function validateSocial(social) {
  if (social === undefined) return undefined
  if (!Array.isArray(social) || social.length > SOCIAL_LIMIT) {
    throw fail('VALIDATION_FAILED', `social必须是最多${SOCIAL_LIMIT}条的数组`)
  }
  return social.map((item, index) => ({
    label: validateString(item?.label, `social[${index}].label`, 30, true),
    icon: validateString(item?.icon, `social[${index}].icon`, 8),
    url: validateUrl(item?.url, `social[${index}].url`),
  }))
}

function validateImageList(value, field) {
  if (!Array.isArray(value) || value.length > 30) throw fail('VALIDATION_FAILED', `${field}必须是最多30项的数组`)
  return value.map((item, index) => {
    const image = validateString(item, `${field}[${index}]`, 500)
    if (image && !/^(?:\/images\/|https?:\/\/)/i.test(image)) {
      throw fail('VALIDATION_FAILED', `${field}[${index}]只允许 /images/ 路径或 https URL`)
    }
    return image
  }).filter(Boolean)
}

function validateBackground(background) {
  if (background === undefined) return undefined
  if (!background || typeof background !== 'object' || Array.isArray(background)) {
    throw fail('VALIDATION_FAILED', 'site.background必须是对象')
  }
  const result = {}
  if (Object.prototype.hasOwnProperty.call(background, 'interval')) {
    if (!Number.isInteger(background.interval) || background.interval < 1000 || background.interval > 600000) {
      throw fail('VALIDATION_FAILED', 'site.background.interval必须是1000到600000之间的整数毫秒')
    }
    result.interval = background.interval
  }
  for (const key of ['enabled', 'autoplay']) {
    if (Object.prototype.hasOwnProperty.call(background, key)) {
      if (typeof background[key] !== 'boolean') throw fail('VALIDATION_FAILED', `site.background.${key}必须是布尔值`)
      result[key] = background[key]
    }
  }
  for (const theme of ['light', 'dark']) {
    if (background[theme] === undefined) continue
    if (!background[theme] || typeof background[theme] !== 'object' || Array.isArray(background[theme])) {
      throw fail('VALIDATION_FAILED', `site.background.${theme}必须是对象`)
    }
    result[theme] = { ...(background[theme].type ? { type: String(background[theme].type) } : {}), images: validateImageList(background[theme].images ?? [], `site.background.${theme}.images`) }
  }
  return result
}

function validateCards(value, field, kind) {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length > 50) throw fail('VALIDATION_FAILED', `${field}必须是最多50项的数组`)
  const ids = new Set()
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw fail('VALIDATION_FAILED', `${field}[${index}]必须是对象`)
    const title = validateString(item?.title ?? item?.name, `${field}[${index}].title`, 80, true)
    const subtitle = validateString(item?.subtitle ?? item?.desc, `${field}[${index}].subtitle`, 160)
    const tag = validateString(item?.tag, `${field}[${index}].tag`, 30)
    const image = validateString(item?.image, `${field}[${index}].image`, 500)
    if (image && !/^(?:\/images\/|https?:\/\/)/i.test(image)) throw fail('VALIDATION_FAILED', `${field}[${index}].image只允许 /images/ 路径或 https URL`)
    const url = validateString(item?.url, `${field}[${index}].url`, 500)
    if (url && !(/^(?:https?:\/\/|mailto:)/i.test(url) || /^\/(?!\/)[^\\\s]*$/.test(url))) {
      throw fail('VALIDATION_FAILED', `${field}[${index}].url只允许站内路径、http(s)或mailto链接`)
    }
    const id = validateString(item?.id || `${kind}-${index + 1}`, `${field}[${index}].id`, 100, true)
    if (ids.has(id)) throw fail('VALIDATION_FAILED', `${field}中存在重复的卡片id`)
    ids.add(id)
    const order = item?.order == null ? index + 1 : Number(item.order)
    if (!Number.isInteger(order) || order < 1) throw fail('VALIDATION_FAILED', `${field}[${index}].order必须是不小于1的整数`)
    if (item.visible !== undefined && typeof item.visible !== 'boolean') throw fail('VALIDATION_FAILED', `${field}[${index}].visible必须是布尔值`)
    return {
      id, title, subtitle, tag, image, url,
      visible: item?.visible !== false,
      order,
      ...(item?.icon ? { icon: validateString(item.icon, `${field}[${index}].icon`, 8) } : {}),
    }
  })
}

function validatePatch(input = {}) {
  const siteInput = input.site ?? {}
  const profileInput = input.profile ?? {}
  const site = {}
  const profile = {}

  if (Object.prototype.hasOwnProperty.call(siteInput, 'curated')) site.curated = validateCurated(siteInput.curated)
  if (Object.prototype.hasOwnProperty.call(siteInput, 'title')) site.title = validateString(siteInput.title, 'site.title', 80, true)
  if (Object.prototype.hasOwnProperty.call(siteInput, 'subtitle')) site.subtitle = validateString(siteInput.subtitle, 'site.subtitle', 160)
  if (Object.prototype.hasOwnProperty.call(siteInput, 'social')) site.social = validateSocial(siteInput.social)
  if (Object.prototype.hasOwnProperty.call(siteInput, 'background')) site.background = validateBackground(siteInput.background)
  if (Object.prototype.hasOwnProperty.call(siteInput, 'hotspots')) site.hotspots = validateCards(siteInput.hotspots, 'site.hotspots', 'hotspot')
  if (Object.prototype.hasOwnProperty.call(siteInput, 'projects')) site.projects = validateCards(siteInput.projects, 'site.projects', 'project')

  if (Object.prototype.hasOwnProperty.call(profileInput, 'nickname')) profile.nickname = validateString(profileInput.nickname, 'profile.nickname', 80)
  if (Object.prototype.hasOwnProperty.call(profileInput, 'avatar')) profile.avatar = validateAvatar(profileInput.avatar)
  if (Object.prototype.hasOwnProperty.call(profileInput, 'bio')) profile.bio = validateString(profileInput.bio, 'profile.bio', 500)
  if (Object.prototype.hasOwnProperty.call(profileInput, 'github')) {
    profile.github = validateString(profileInput.github, 'profile.github', 39)
    if (profile.github && !GITHUB_RE.test(profile.github)) throw fail('VALIDATION_FAILED', 'profile.github不是合法的 GitHub 用户名')
  }

  const allowedTop = new Set(['site', 'profile'])
  for (const key of Object.keys(input)) if (!allowedTop.has(key)) throw fail('VALIDATION_FAILED', `不认识的配置段「${key}」`)
  for (const key of Object.keys(siteInput)) if (!['title', 'subtitle', 'social', 'background', 'hotspots', 'projects', 'curated'].includes(key)) throw fail('VALIDATION_FAILED', `不认识的站点字段「${key}」`)
  for (const key of Object.keys(profileInput)) if (!['nickname', 'avatar', 'bio', 'github'].includes(key)) throw fail('VALIDATION_FAILED', `不认识的个人字段「${key}」`)

  return { site, profile }
}

function replaceFrontmatter(raw, patch) {
  const source = raw.startsWith('---') && raw.indexOf('\n---', 3) >= 0
    ? raw.slice(3, raw.indexOf('\n---', 3)).split('\n')
    : []
  const values = { ...emptyProfile(), ...parseProfile(raw), ...patch }
  const lines = ['---', `nickname: ${JSON.stringify(values.nickname)}`, `avatar: ${JSON.stringify(values.avatar)}`, `bio: ${JSON.stringify(values.bio)}`, `github: ${JSON.stringify(values.github)}`, '---']
  const bodyStart = raw.startsWith('---') ? raw.indexOf('\n---', 3) : -1
  const body = bodyStart >= 0 ? raw.slice(bodyStart + '\n---'.length).replace(/^\n?/, '\n') : '\n'
  return `${lines.join('\n')}${body}`
}

async function atomicWrite(file, content) {
  const tmp = `${file}.${randomBytes(4).toString('hex')}.tmp`
  try {
    await writeFile(tmp, content, 'utf8')
    await rename(tmp, file)
  } catch (err) {
    await unlink(tmp).catch(() => {})
    throw fail('SITE_PROFILE_WRITE_FAILED', '保存站点信息失败，请稍后再试', 503, err)
  }
}

export async function getSiteProfile() {
  const [siteRaw, profileRaw] = await Promise.all([readText(SITE_FILE), readText(PROFILE_FILE)])
  let site = {}
  try { site = siteRaw.trim() ? JSON.parse(siteRaw) : {} } catch (err) { throw fail('SITE_PROFILE_CORRUPT', 'data/site.json 不是合法 JSON', 500, err) }
  return {
    site: {
      curated: site.site?.curated ?? null,
      title: site.site?.title || '', subtitle: site.site?.subtitle || '',
      social: Array.isArray(site.social) ? site.social : [], background: site.background || {},
      hotspots: Array.isArray(site.hotspots) ? site.hotspots : [], projects: Array.isArray(site.projects) ? site.projects : [],
    },
    profile: parseProfile(profileRaw),
    sources: { site: 'data/site.json', profile: 'data/profile.md' },
  }
}

export async function patchSiteProfile(input) {
  const patch = validatePatch(input)
  const current = await getSiteProfile()
  const siteRaw = await readText(SITE_FILE)
  const profileRaw = await readText(PROFILE_FILE)
  let fullSite = {}
  try { fullSite = siteRaw.trim() ? JSON.parse(siteRaw) : {} } catch (err) { throw fail('SITE_PROFILE_CORRUPT', 'data/site.json 不是合法 JSON', 500, err) }
  const nextSite = { ...fullSite, site: { ...(fullSite.site || {}), ...patch.site } }
  if (patch.site.social !== undefined) nextSite.social = patch.site.social
  if (patch.site.background !== undefined) nextSite.background = { ...(fullSite.background || {}), ...patch.site.background }
  if (patch.site.hotspots !== undefined) nextSite.hotspots = patch.site.hotspots
  if (patch.site.projects !== undefined) nextSite.projects = patch.site.projects
  const nextProfile = replaceFrontmatter(profileRaw, patch.profile)
  await atomicWrite(SITE_FILE, `${JSON.stringify(nextSite, null, 2)}\n`)
  try { await atomicWrite(PROFILE_FILE, nextProfile) } catch (err) {
    // site.json 已替换但 profile 写失败；不删除原文件，错误交给调用方，便于人工重试。
    throw err
  }
  return getSiteProfile()
}
