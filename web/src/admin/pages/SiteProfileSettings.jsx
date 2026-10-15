// 站点与个人信息管理页面。
// 路由注册留给后续独立板块，避免与图片资产 agent 同时修改 AdminApp.jsx。
import { useEffect, useState } from 'react'
import { Alert, AutoComplete, Button, Card, Form, Input, InputNumber, Select, Space, Switch, message } from 'antd'
import { ReloadOutlined, SaveOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import { request } from '../../api/client.js'
import CuratedSettings from './CuratedSettings.jsx'

const EMPTY_SOCIAL = { label: '', icon: '', url: '' }

// 联系方式 URL 归一：用户在「邮箱」栏自然填的是裸邮箱（z.x.peng@outlook.com），
// 而白名单校验只放行 http(s)/mailto 前缀（防 javascript: 注入，不能放宽）。
// 这里在提交前把「无协议前缀且形如邮箱」的值补成 mailto:，校验规则与服务端均不动。
function normalizeSocialUrl(url) {
  const value = (url || '').trim()
  if (!value || /^[a-z][a-z0-9+.-]*:/i.test(value)) return value
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? `mailto:${value}` : value
}

export default function SiteProfileSettings() {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [images, setImages] = useState([])
  const [notes, setNotes] = useState([])
  const [notesState, setNotesState] = useState('loading')
  const [github, setGithub] = useState(null)
  async function loadSources() {
    setNotesState('loading')
    await Promise.all([
      (async () => {
        const rows = []
        for (let offset = 0; ; offset += 500) {
          const page = await request(`/api/db/notes?limit=500&offset=${offset}`)
          rows.push(...page.items)
          if (rows.length >= page.total || !page.items.length) break
        }
        setNotes(rows)
        setNotesState('ready')
      })().catch(() => setNotesState('unavailable')),
      request('/api/github/projects').then(setGithub).catch(() => setGithub(old => ({ ...old, state: old?.items?.length ? 'stale' : 'unavailable' }))),
    ])
  }
  const [msg, msgCtx] = message.useMessage()

  async function load() {
    setLoading(true)
    try {
      const data = await request('/api/admin/site')
      const assets = await request('/api/admin/images')
      setImages(assets.items || [])
      const background = data.site?.background || {}
      form.setFieldsValue({
        site_title: data.site?.title || '',
        site_subtitle: data.site?.subtitle || '',
        social: data.site?.social?.length ? data.site.social : [{ ...EMPTY_SOCIAL }],
        nickname: data.profile?.nickname || '',
        avatar: data.profile?.avatar || '',
        bio: data.profile?.bio || '',
        github: data.profile?.github || '',
        background_interval: background.interval ?? 6000,
        background_enabled: background.enabled !== false,
        background_autoplay: background.autoplay !== false,
        background_light_images: background.light?.images || [],
        background_dark_images: background.dark?.images || [],
        curated: data.site?.curated || { hotspots: { enabled: false, items: [] }, projects: { enabled: false, items: [] } },
      })
    } catch (err) {
      msg.error(err?.message || '站点信息加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(); loadSources() }, [])

  async function save(values) {
    setSaving(true)
    try {
      await request('/api/admin/site', {
        method: 'PATCH',
        body: {
          site: {
            title: values.site_title,
            subtitle: values.site_subtitle,
            background: {
              interval: values.background_interval,
              enabled: values.background_enabled,
              autoplay: values.background_autoplay,
              light: { type: 'image', images: values.background_light_images || [] },
              dark: { type: 'image', images: values.background_dark_images || [] },
            },
            social: (values.social || [])
              .filter((item) => item?.label || item?.url)
              .map((item) => ({ ...item, url: normalizeSocialUrl(item.url) })),
            curated: values.curated,
          },
          profile: {
            nickname: values.nickname,
            avatar: values.avatar,
            bio: values.bio,
            github: values.github,
          },
        },
      })
      msg.success('站点与个人信息已保存')
      await load()
    } catch (err) {
      msg.error(err?.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ maxWidth: 760 }}>
      {msgCtx}
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="站点与个人信息"
        description="站点信息、背景和来源精选写入 data/site.json；个人信息写入 data/profile.md。这里只引用现有图片，不提供上传或删除。"
      />
      <Form form={form} layout="vertical" disabled={loading} onFinish={save}>
        <Card size="small" title="站点信息" style={{ marginBottom: 16 }}>
          <Form.Item name="site_title" label="站点名称" rules={[{ required: true, message: '请输入站点名称' }, { max: 80, message: '最多 80 字' }]}>
            <Input showCount maxLength={80} placeholder="buddy" />
          </Form.Item>
          <Form.Item name="site_subtitle" label="站点副标题" rules={[{ max: 160, message: '最多 160 字' }]}>
            <Input showCount maxLength={160} placeholder="会成长的个人助手" />
          </Form.Item>
        </Card>

        <Card size="small" title="个人信息" style={{ marginBottom: 16 }}>
          <Form.Item name="nickname" label="昵称" rules={[{ max: 80, message: '最多 80 字' }]}>
            <Input showCount maxLength={80} />
          </Form.Item>
          <Form.Item name="avatar" label="头像路径" rules={[{ max: 500, message: '最多 500 字' }, { pattern: /^(?:$|\/images\/|https?:\/\/)/i, message: '只允许 /images/ 路径或 http(s) URL' }]}>
            <AutoComplete
              allowClear
              options={images.map((item) => ({ value: item.url, label: item.name }))}
              placeholder="选择图片或输入 /images/ 路径"
              filterOption={(input, option) => String(option?.label || option?.value).toLowerCase().includes(input.toLowerCase())}
            />
          </Form.Item>
          <Form.Item name="bio" label="个人简介" rules={[{ max: 500, message: '最多 500 字' }]}>
            <Input.TextArea rows={4} showCount maxLength={500} />
          </Form.Item>
          <Form.Item name="github" label="GitHub 用户名" rules={[{ pattern: /^(?:$|[A-Za-z0-9-]{1,39})$/, message: '请输入合法 GitHub 用户名' }]}>
            <Input placeholder="bird-z" />
          </Form.Item>
        </Card>

        <Card size="small" title="联系方式" style={{ marginBottom: 16 }}>
          <Form.List name="social">
            {(fields, { add, remove }) => (
              <>
                {fields.map((field) => (
                  <Space key={field.key} align="start" style={{ display: 'flex', marginBottom: 8 }}>
                    <Form.Item {...field} name={[field.name, 'label']} rules={[{ required: true, message: '请输入名称' }, { max: 30, message: '最多 30 字' }]}>
                      <Input placeholder="GitHub" />
                    </Form.Item>
                    <Form.Item {...field} name={[field.name, 'icon']} rules={[{ max: 8, message: '最多 8 字' }]}>
                      <Input placeholder="图标" style={{ width: 90 }} />
                    </Form.Item>
                    <Form.Item {...field} name={[field.name, 'url']} rules={[{ pattern: /^(?:$|https?:\/\/|mailto:)/i, message: '只允许 http(s) 或 mailto' }]}>
                      <Input placeholder="https://… 或邮箱地址" style={{ width: 260 }} />
                    </Form.Item>
                    <Button danger type="text" icon={<DeleteOutlined />} onClick={() => remove(field.name)} aria-label="删除联系方式" />
                  </Space>
                ))}
                <Button type="dashed" onClick={() => add({ ...EMPTY_SOCIAL })} icon={<PlusOutlined />}>添加联系方式</Button>
              </>
            )}
          </Form.List>
        </Card>

        <Card size="small" title="背景图片轮播" style={{ marginBottom: 16 }}>
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Space>
              <Form.Item name="background_enabled" label="启用背景图片" valuePropName="checked" noStyle>
                <Switch checkedChildren="开" unCheckedChildren="关" />
              </Form.Item>
              <Form.Item name="background_autoplay" label="自动轮播" valuePropName="checked" noStyle>
                <Switch checkedChildren="开" unCheckedChildren="关" />
              </Form.Item>
            </Space>
            <Form.Item name="background_interval" label="轮播间隔（毫秒）" rules={[{ type: 'number', min: 1000, max: 600000, message: '请输入1000到600000之间的毫秒数' }]}>
              <InputNumber min={1000} max={600000} step={1000} style={{ width: 220 }} />
            </Form.Item>
            <Form.Item name="background_light_images" label="浅色背景（按播放顺序）">
              <Select mode="multiple" options={images.map((item) => ({ value: item.url, label: item.name }))} placeholder="选择图片" optionFilterProp="label" />
            </Form.Item>
            <Form.Item name="background_dark_images" label="深色背景（按播放顺序）">
              <Select mode="multiple" options={images.map((item) => ({ value: item.url, label: item.name }))} placeholder="选择图片" optionFilterProp="label" />
            </Form.Item>
            <Alert type="info" showIcon message="只修改站点图片引用" description="不会上传、重命名或删除图片；资料 Markdown 正文中的图片不在本页面管理范围内。" />
          </Space>
        </Card>

        <Form.Item name="curated"><CuratedSettings images={images} notes={notes} notesState={notesState} github={github} onRetry={loadSources} /></Form.Item>

        <Space>
          <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>保存</Button>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>重置</Button>
        </Space>
      </Form>
    </div>
  )
}
