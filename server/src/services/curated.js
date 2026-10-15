// 站点精选只保存来源引用；解析过程不写档案、GitHub 或配置文件。
import { fail } from './errors.js'

export const sourceKey = item => `${item.source}:${item.id}`
export const orderedSelections = group => (group?.items || []).map((item, index) => ({ ...item, _index: index }))
  .sort((a, b) => a.order - b.order || a._index - b._index)

export function validateCurated(value) {
  const object = v => v && typeof v === 'object' && !Array.isArray(v)
  if (!object(value) || Object.keys(value).some(key => !['hotspots', 'projects'].includes(key))) {
    throw fail('VALIDATION_FAILED', '精选配置只允许 hotspots 和 projects')
  }
  const seen = new Set()
  const result = {}
  for (const kind of ['hotspots', 'projects']) {
    const group = value[kind]
    if (!object(group) || typeof group.enabled !== 'boolean' || !Array.isArray(group.items) ||
        Object.keys(group).some(key => !['enabled', 'items'].includes(key))) {
      throw fail('VALIDATION_FAILED', `${kind}需要 enabled 布尔值和 items 数组`)
    }
    if (kind === 'hotspots' && group.items.length > 4) throw fail('VALIDATION_FAILED', '首页热点最多选择4项（含隐藏项）')
    if (group.enabled && !group.items.length) throw fail('VALIDATION_FAILED', '至少选择一项后才能启用精选')
    result[kind] = {
      enabled: group.enabled,
      items: group.items.map(item => {
        if (!object(item) || Object.keys(item).some(key => !['source', 'id', 'image', 'visible', 'order'].includes(key))) {
          throw fail('VALIDATION_FAILED', '精选项只能保存来源、ID、图片、显示状态和顺序')
        }
        if (!['note', 'github'].includes(item.source) || (kind === 'projects' && item.source !== 'github')) {
          throw fail('VALIDATION_FAILED', '热点只允许档案或GitHub，项目只允许GitHub')
        }
        if (typeof item.id !== 'string' || !item.id.trim() || item.id.length > 500 ||
            (item.source === 'github' && !/^\d+$/.test(item.id))) throw fail('VALIDATION_FAILED', '来源ID不合法')
        const id = item.id.trim()
        const key = sourceKey({ ...item, id })
        if (seen.has(key)) throw fail('VALIDATION_FAILED', '同一来源不能重复或同时出现在热点和项目中')
        seen.add(key)
        const image = item.image ?? ''
        if (typeof image !== 'string' || image.length > 500 || (image && !/^\/images\/[^/?#\\\s]+$/.test(image))) {
          throw fail('VALIDATION_FAILED', '精选封面只允许 /images/ 下的图片')
        }
        if (typeof item.visible !== 'boolean' || !Number.isInteger(item.order) || item.order < 1) {
          throw fail('VALIDATION_FAILED', '显示状态必须是布尔值，顺序必须是正整数')
        }
        return { source: item.source, id, image, visible: item.visible, order: item.order }
      }).sort((a, b) => a.order - b.order).map((item, index) => ({ ...item, order: index + 1 })),
    }
    // 按传入顺序号排序后连续编号，保证读取和再次保存的顺序一致。
  }
  return result
}

export function resolveSelections(group, notes, repositories) {
  const noteMap = new Map((notes || []).map(note => [String(note.id), note]))
  const repoMap = new Map((repositories || []).map(repo => [String(repo.id), repo]))
  return orderedSelections(group).filter(item => item.visible !== false).flatMap(item => {
    const row = (item.source === 'note' ? noteMap : repoMap).get(item.id)
    if (!row) return []
    const title = item.source === 'note' ? row.title : row.fullName
    const subtitle = item.source === 'note' ? row.excerpt || '' : row.description || ''
    return [{ key: sourceKey(item), id: sourceKey(item), title, subtitle, summary: subtitle,
      tag: item.source === 'note' ? row.category : 'GitHub', image: item.image || '',
      url: item.source === 'note' ? `/notes/${encodeURIComponent(row.id)}` : row.htmlUrl,
      source_type: item.source, source_label: item.source === 'note' ? '档案' : 'GitHub 项目',
      visible: true, order: item.order, updated_at: row.updated_at || row.updatedAt || null }]
  })
}
