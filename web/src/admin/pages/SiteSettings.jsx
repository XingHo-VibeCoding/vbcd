// 站点设置：GET/PATCH /api/admin/settings —— 读/写 data/site.json（热生效）。
// 业务配置（LLM 模型/URL、头像、背景、站点标题、限额）网页可改。
import { useEffect, useState } from 'react'
import { Form, Input, InputNumber, Button, Card, message, Alert, Divider } from 'antd'
import { SaveOutlined, ReloadOutlined } from '@ant-design/icons'
import { request } from '../../api/client.js'

export default function SiteSettings() {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, msgCtx] = message.useMessage()

  async function load() {
    setLoading(true)
    try {
      const data = await request('/api/admin/settings')
      const s = data.settings || {}
      form.setFieldsValue({
        llm_model: s.llm?.model,
        llm_base_url: s.llm?.base_url,
        site_avatar: s.site?.avatar,
        site_background: s.site?.background,
        site_title: s.site?.title,
        site_subtitle: s.site?.subtitle,
        limits_kb_top_k: s.limits?.kb_top_k,
        limits_task_page_size: s.limits?.task_page_size,
      })
    } catch (e) {
      msg.error(e?.message || '配置加载失败')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  async function save() {
    const v = await form.validateFields()
    setSaving(true)
    try {
      await request('/api/admin/settings', {
        method: 'PATCH',
        body: {
          llm: { model: v.llm_model || '', base_url: v.llm_base_url || '' },
          site: {
            avatar: v.site_avatar || '', background: v.site_background || '',
            title: v.site_title || '', subtitle: v.site_subtitle || '',
          },
          limits: {
            ...(v.limits_kb_top_k != null ? { kb_top_k: v.limits_kb_top_k } : {}),
            ...(v.limits_task_page_size != null ? { task_page_size: v.limits_task_page_size } : {}),
          },
        },
      })
      msg.success('已保存（写入 data/site.json，热生效无需重启）')
      await load()
    } catch (e) {
      msg.error(e?.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      {msgCtx}
      <Alert
        type="success" showIcon style={{ marginBottom: 16 }}
        message="业务配置 · 热生效"
        description="此处修改写入 data/site.json，进程内立即生效（无需重启）。读取优先级：site.json > 环境变量 > 默认值。密钥与基础设施仍在「环境变量」页只读查看，不在此改。"
      />
      <Form form={form} layout="vertical" disabled={loading} style={{ maxWidth: 640 }}>
        <Card size="small" title="LLM" style={{ marginBottom: 16 }}>
          <Form.Item name="llm_model" label="模型名（覆盖 LLM_MODEL）">
            <Input placeholder="qwen3-4b-local" />
          </Form.Item>
          <Form.Item name="llm_base_url" label="Base URL（覆盖 OPENAI_BASE_URL，非密钥）">
            <Input placeholder="http://127.0.0.1:8000/v1" />
          </Form.Item>
        </Card>

        <Card size="small" title="站点外观" style={{ marginBottom: 16 }}>
          <Form.Item name="site_title" label="站点标题">
            <Input placeholder="buddy" />
          </Form.Item>
          <Form.Item name="site_subtitle" label="副标题">
            <Input placeholder="会成长的个人助手" />
          </Form.Item>
          <Form.Item name="site_avatar" label="头像（data/images/ 内路径或 URL）">
            <Input placeholder="images/avatar.png 或 https://…" />
          </Form.Item>
          <Form.Item name="site_background" label="主站背景">
            <Input placeholder="images/bg.png 或 https://…" />
          </Form.Item>
        </Card>

        <Card size="small" title="限额" style={{ marginBottom: 16 }}>
          <Form.Item name="limits_kb_top_k" label="知识库召回条数 kb_top_k">
            <InputNumber min={1} max={50} style={{ width: 200 }} />
          </Form.Item>
          <Form.Item name="limits_task_page_size" label="任务每页条数 task_page_size">
            <InputNumber min={5} max={200} style={{ width: 200 }} />
          </Form.Item>
        </Card>

        <Button type="primary" icon={<SaveOutlined />} onClick={save} loading={saving} size="large">
          保存
        </Button>
        <Button icon={<ReloadOutlined />} onClick={load} style={{ marginLeft: 8 }}>重置</Button>
      </Form>
    </div>
  )
}
