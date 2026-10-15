// 站点与个人信息管理页面。
// 路由注册留给后续独立板块，避免与图片资产 agent 同时修改 AdminApp.jsx。
import { useEffect, useState } from 'react'
import { Alert, Button, Card, Form, Input, Space, message } from 'antd'
import { ReloadOutlined, SaveOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import { request } from '../../api/client.js'

const EMPTY_SOCIAL = { label: '', icon: '', url: '' }

export default function SiteProfileSettings() {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, msgCtx] = message.useMessage()

  async function load() {
    setLoading(true)
    try {
      const data = await request('/api/admin/site')
      form.setFieldsValue({
        site_title: data.site?.title || '',
        site_subtitle: data.site?.subtitle || '',
        social: data.site?.social?.length ? data.site.social : [{ ...EMPTY_SOCIAL }],
        nickname: data.profile?.nickname || '',
        avatar: data.profile?.avatar || '',
        bio: data.profile?.bio || '',
        github: data.profile?.github || '',
      })
    } catch (err) {
      msg.error(err?.message || '站点信息加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function save(values) {
    setSaving(true)
    try {
      await request('/api/admin/site', {
        method: 'PATCH',
        body: {
          site: {
            title: values.site_title,
            subtitle: values.site_subtitle,
            social: (values.social || []).filter((item) => item?.label || item?.url),
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
        description="站点信息写入 data/site.json，个人信息写入 data/profile.md。背景、热点、项目和图片上传不在本页面管理。"
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
            <Input placeholder="/images/profile-avatar.png" />
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
                      <Input placeholder="https://..." style={{ width: 260 }} />
                    </Form.Item>
                    <Button danger type="text" icon={<DeleteOutlined />} onClick={() => remove(field.name)} aria-label="删除联系方式" />
                  </Space>
                ))}
                <Button type="dashed" onClick={() => add({ ...EMPTY_SOCIAL })} icon={<PlusOutlined />}>添加联系方式</Button>
              </>
            )}
          </Form.List>
        </Card>

        <Space>
          <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>保存</Button>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>重置</Button>
        </Space>
      </Form>
    </div>
  )
}
