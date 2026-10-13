// 板块⑤资料浏览：GET /api/notes 只读列表（搜索/分类/分页）+ 行点击开详情抽屉。
// 第一期只读——编辑/删除留板块⑥；这里给"打开主站"与复制 id 两个便捷动作。
import { useEffect, useState } from 'react'
import { Table, Tag, Input, Select, Space, Button, Drawer, Descriptions, Typography, message, Modal, Form, Popconfirm } from 'antd'
import { ReloadOutlined, SearchOutlined, LinkOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { request } from '../../api/client.js'

const CATEGORY_COLOR = { learning: 'blue', life: 'green', work: 'orange', essay: 'purple' }
const CATEGORIES = ['learning', 'life', 'work', 'essay']
const CATEGORY_LABEL = { learning: '学习', life: '生活', work: '工作', essay: '随笔' }

export default function NoteBrowse() {
  const [q, setQ] = useState('')
  const [category, setCategory] = useState()
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState(null)   // 抽屉里的完整 note
  const [detailLoading, setDetailLoading] = useState(false)
  const [msg, msgCtx] = message.useMessage()

  async function load() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (q.trim()) params.set('q', q.trim())
      if (category) params.set('category', category)
      params.set('limit', String(pageSize))
      params.set('offset', String((page - 1) * pageSize))
      const data = await request(`/api/notes?${params}`)
      setRows(data.items || [])
      setTotal(data.total ?? 0)
    } catch (e) {
      msg.error(e?.message || '资料列表加载失败')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [category, page, pageSize])

  async function openDetail(id) {
    setDetailLoading(true)
    try {
      const note = await request(`/api/notes/${id}`)
      setDetail(note)
    } catch (e) {
      msg.error(e?.message || '详情加载失败')
    } finally {
      setDetailLoading(false)
    }
  }

  // ── 板块⑥ 编辑 / 删除 ──────────────────────────────────────
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()

  function openEdit() {
    form.setFieldsValue({
      title: detail?.meta?.title,
      category: detail?.meta?.category,
      tags: (detail?.meta?.tags || []).join(', '),
      content: detail?.content,
    })
    setEditing(true)
  }

  async function saveEdit() {
    const v = await form.validateFields()
    setSaving(true)
    try {
      const tags = String(v.tags || '').split(',').map((t) => t.trim()).filter(Boolean)
      await request(`/api/notes/${detail.meta.id}`, {
        method: 'PATCH',
        body: { title: v.title, category: v.category, tags, content: v.content },
      })
      msg.success('已保存')
      setEditing(false)
      setDetail(null)
      await load()
    } catch (e) {
      msg.error(e?.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  async function doDelete() {
    try {
      await request(`/api/notes/${detail.meta.id}`, { method: 'DELETE' })
      msg.success('已删除')
      setDetail(null)
      await load()
    } catch (e) {
      msg.error(e?.message || '删除失败')
    }
  }

  return (
    <div>
      {msgCtx}
      <Space style={{ marginBottom: 12 }} wrap>
        <Input.Search
          allowClear placeholder="搜标题 / 正文 / 标签" style={{ width: 260 }}
          prefix={<SearchOutlined />} enterButton
          onSearch={(v) => { setQ(v); setPage(1) }}
        />
        <Select allowClear placeholder="分类" style={{ width: 140 }}
          value={category} onChange={(v) => { setCategory(v); setPage(1) }}
          options={CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))} />
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>刷新</Button>
        <span style={{ color: '#999' }}>共 {total} 条 · 只读浏览</span>
      </Space>

      <Table
        size="small" rowKey="id" loading={loading}
        dataSource={rows}
        onRow={(r) => ({ onClick: () => openDetail(r.id), style: { cursor: 'pointer' } })}
        pagination={{
          current: page, pageSize, total,
          onChange: (p, ps) => { setPage(p); setPageSize(ps) },
          showTotal: (t) => `${t} 条`,
        }}
        columns={[
          { title: '标题', dataIndex: 'title', ellipsis: true },
          { title: '分类', dataIndex: 'category', width: 90, render: (c) => <Tag color={CATEGORY_COLOR[c]}>{CATEGORY_LABEL[c] || c}</Tag> },
          { title: '日期', dataIndex: 'date', width: 110 },
          {
            title: '标签', dataIndex: 'tags', width: 220,
            render: (tags) => (tags || []).slice(0, 4).map((t) => <Tag key={t} style={{ marginBottom: 2 }}>{t}</Tag>),
          },
          { title: '摘要', dataIndex: 'excerpt', ellipsis: true, render: (v) => v || '—' },
        ]}
      />

      <Drawer
        title={detail?.meta?.title || '资料详情'}
        width={720}
        open={Boolean(detail) || detailLoading}
        loading={detailLoading}
        onClose={() => setDetail(null)}
        extra={
          detail && (
            <Space>
              <Button size="small" icon={<EditOutlined />} onClick={openEdit}>编辑</Button>
              <Popconfirm
                title="删除这条资料？"
                description="物理删除 Markdown 文件，Obsidian 同步后不可恢复。"
                okText="删除" okButtonProps={{ danger: true }} cancelText="取消"
                onConfirm={doDelete}
              >
                <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
              </Popconfirm>
              <Button type="link" icon={<LinkOutlined />} href={`/notes/${detail.meta?.id}`} target="_blank">主站打开</Button>
            </Space>
          )
        }
      >
        {detail && (
          <>
            <Descriptions size="small" column={2} bordered style={{ marginBottom: 16 }}>
              <Descriptions.Item label="分类"><Tag color={CATEGORY_COLOR[detail.meta?.category]}>{CATEGORY_LABEL[detail.meta?.category] || detail.meta?.category}</Tag></Descriptions.Item>
              <Descriptions.Item label="日期">{detail.meta?.date}</Descriptions.Item>
              <Descriptions.Item label="标签" span={2}>{(detail.meta?.tags || []).map((t) => <Tag key={t}>{t}</Tag>)}</Descriptions.Item>
              <Descriptions.Item label="路径" span={2}><Typography.Text code style={{ fontSize: 12 }}>{detail.meta?.path}</Typography.Text></Descriptions.Item>
            </Descriptions>
            <div className="markdown-body" style={{ lineHeight: 1.7 }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{detail.content || ''}</ReactMarkdown>
            </div>
          </>
        )}
      </Drawer>

      <Modal
        title="编辑资料（覆盖文件，Obsidian 同步刷新生效）"
        open={editing}
        onOk={saveEdit}
        confirmLoading={saving}
        onCancel={() => setEditing(false)}
        width={720}
        okText="保存" cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="标题" rules={[{ required: true, message: '标题不能为空' }]}>
            <Input maxLength={80} showCount />
          </Form.Item>
          <Form.Item name="category" label="分类" rules={[{ required: true, message: '选分类' }]}>
            <Select options={CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))} />
          </Form.Item>
          <Form.Item name="tags" label="标签（逗号分隔）">
            <Input placeholder="tag1, tag2" />
          </Form.Item>
          <Form.Item name="content" label="正文（Markdown）" rules={[{ required: true, message: '正文不能为空' }]}>
            <Input.TextArea rows={12} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
