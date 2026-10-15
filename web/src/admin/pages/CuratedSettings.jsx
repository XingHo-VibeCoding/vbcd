// 来源信息只用于展示，保存时仅返回来源引用和展示控制。
import { Alert, Button, Card, Image, Select, Space, Switch, Tag, Typography } from 'antd'

const empty = () => ({ hotspots: { enabled: false, items: [] }, projects: { enabled: false, items: [] } })
const keyOf = item => `${item.source}:${item.id}`

export default function CuratedSettings({ value, onChange, notes, github, notesState, onRetry, images }) {
  const config = value || empty()
  const options = [
    ...notes.map(note => ({ source: 'note', id: String(note.id), title: note.title, subtitle: note.excerpt || '', topics: [] })),
    ...(github?.items || []).map(repo => ({ source: 'github', id: String(repo.id), title: repo.fullName, subtitle: repo.description || '', topics: repo.topics || [] })),
  ]
  const byKey = new Map(options.map(row => [keyOf(row), row]))
  const update = (kind, patch) => onChange({ ...config, [kind]: { ...config[kind], ...patch } })
  const updateItems = (kind, items) => update(kind, { items: items.map((item, index) => ({ ...item, order: index + 1 })) })
  return <Space direction="vertical" size={16} style={{ width: '100%' }}>
    <Alert type="info" showIcon message="从内容来源选择展示项" description="标题、简介和链接跟随档案或GitHub。热点控制首页，项目控制关于页；同一来源只能归属一个列表。旧手填配置保留用于关闭精选后的回退。" />
    {notesState !== 'ready' ? <Alert type={notesState === 'loading' ? 'info' : 'warning'} showIcon message={notesState === 'loading' ? '档案来源加载中' : '档案来源暂不可用，未删除已有选择'} /> : null}
    {github && ['stale', 'unavailable', 'unconfigured'].includes(github.state) ? <Alert type="warning" showIcon message={github.state === 'stale' ? 'GitHub刷新失败，正在使用缓存，来源状态待核实' : github.state === 'unconfigured' ? 'GitHub来源尚未配置' : 'GitHub暂不可用，已有引用保留'} /> : null}
    <Button onClick={onRetry}>刷新内容来源</Button>
    {['hotspots', 'projects'].map(kind => {
      const group = config[kind]
      const title = kind === 'hotspots' ? '首页热点精选（最多4项）' : '关于页项目精选'
      const allSelected = new Set([...config.hotspots.items, ...config.projects.items].map(keyOf))
      const candidates = options.filter(row => !allSelected.has(keyOf(row)) && (kind === 'hotspots' || row.source === 'github'))
      return <Card key={kind} title={title} size="small">
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Space><Switch checked={group.enabled} disabled={!group.items.length && !group.enabled} onChange={enabled => update(kind, { enabled })} /><Typography.Text>{group.enabled ? '已启用：只展示当前选择，不自动补位（保存后生效）' : '未启用：沿用旧展示方式；保存选择不会自动启用'}</Typography.Text></Space>
          {!group.items.length ? <Typography.Text type="secondary">先选择至少一项，再启用精选。启用后若要清空列表，请先关闭精选。</Typography.Text> : null}
          <Select showSearch value={undefined} placeholder="搜索档案标题或GitHub仓库（focus可筛选）" style={{ width: '100%' }} optionFilterProp="searchText"
            loading={notesState === 'loading' || !github}
            disabled={kind === 'hotspots' && group.items.length >= 4}
            options={candidates.map(row => ({ value: keyOf(row), label: `${row.source === 'note' ? '档案' : 'GitHub'} · ${row.title}${row.topics.includes('focus') ? ' · focus' : ''}`, searchText: `${row.title} ${row.topics.join(' ')}` }))}
            onChange={key => { const row = byKey.get(key); updateItems(kind, [...group.items, { source: row.source, id: row.id, image: '', visible: true }]) }} />
          {group.items.map((item, index) => {
            const row = byKey.get(keyOf(item))
            const verified = item.source === 'note' ? notesState === 'ready' : ['fresh', 'cached'].includes(github?.state)
            const patchItem = patch => updateItems(kind, group.items.map((old, at) => at === index ? { ...old, ...patch } : old))
            const move = offset => { const items = [...group.items]; [items[index], items[index + offset]] = [items[index + offset], items[index]]; updateItems(kind, items) }
            return <Card key={keyOf(item)} size="small">
              <Space direction="vertical" style={{ width: '100%' }}>
                <Space wrap><Tag>{item.source === 'note' ? '档案' : 'GitHub'}</Tag><Typography.Text strong>{row?.title || item.id}</Typography.Text>{row?.topics.includes('focus') ? <Tag color="blue">focus</Tag> : null}{!verified || !row ? <Tag color="orange">{verified ? '来源不可用' : '来源待核实'}</Tag> : null}</Space>
                {row?.subtitle ? <Typography.Paragraph ellipsis={{ rows: 2 }} style={{ margin: 0 }}>{row.subtitle}</Typography.Paragraph> : null}
                <Select allowClear showSearch optionFilterProp="label" value={item.image || undefined} placeholder="选择封面（可选）" style={{ width: '100%' }}
                  options={images.map(image => ({ value: image.url, label: image.name }))} onChange={image => patchItem({ image: image || '' })} />
                {item.image ? <Image src={item.image} width={100} height={64} style={{ objectFit: 'cover' }} /> : null}
                <Space wrap><Switch checked={item.visible !== false} checkedChildren="显示" unCheckedChildren="隐藏" onChange={visible => patchItem({ visible })} />
                  <Button disabled={index === 0} onClick={() => move(-1)}>上移</Button><Button disabled={index === group.items.length - 1} onClick={() => move(1)}>下移</Button>
                  <Button danger disabled={group.enabled && group.items.length === 1} onClick={() => updateItems(kind, group.items.filter((_, at) => at !== index))}>移除</Button>
                </Space>
              </Space>
            </Card>
          })}
        </Space>
      </Card>
    })}
  </Space>
}
