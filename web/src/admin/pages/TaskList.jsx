// 板块③任务列表：GET /api/tasks 渲染表 + 状态筛选 + 失败/需处理任务"重试"按钮。
// 重试 = PATCH /api/tasks/:id {status:'todo'}（仅 failed/attention 可退，后端强制校验）。
import { useEffect, useMemo, useState } from 'react'
import { Table, Tag, Select, Button, Space, message, Tooltip } from 'antd'
import { ReloadOutlined, RedoOutlined } from '@ant-design/icons'
import { request } from '../../api/client.js'

const STATUS_COLOR = { todo: 'default', doing: 'processing', done: 'success', failed: 'error', attention: 'warning' }
const STATUS_LABEL = { todo: '待办', doing: '进行中', done: '完成', failed: '失败', attention: '需处理' }
const RETRYABLE = new Set(['failed', 'attention'])

export default function TaskList() {
  const [status, setStatus] = useState()
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [retrying, setRetrying] = useState(null)
  const [msg, msgCtx] = message.useMessage()

  async function load() {
    setLoading(true)
    try {
      const qs = status ? `?status=${status}` : ''
      const data = await request(`/api/tasks${qs}`)
      setRows(data.items || [])
      setTotal(data.total ?? 0)
    } catch (e) {
      msg.error(e?.message || '任务列表加载失败')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [status])

  async function retry(task) {
    setRetrying(task.id)
    try {
      await request(`/api/tasks/${task.id}`, { method: 'PATCH', body: { status: 'todo' } })
      msg.success(`已退回待办：${task.title || task.id}`)
      await load()
    } catch (e) {
      msg.error(e?.message || '重试失败')
    } finally {
      setRetrying(null)
    }
  }

  const columns = useMemo(() => [
    { title: '类型', dataIndex: 'type', width: 130, render: (v) => <Tag>{v}</Tag> },
    {
      title: '标题 / 来源', key: 'title', ellipsis: true,
      render: (_, r) => r.payload?.title || r.source_url || r.title || r.id,
    },
    {
      title: '状态', dataIndex: 'status', width: 100,
      render: (s) => <Tag color={STATUS_COLOR[s]}>{STATUS_LABEL[s] || s}</Tag>,
    },
    { title: '来源', dataIndex: 'origin', width: 90, render: (v) => v || '—' },
    { title: '结果', dataIndex: 'result', ellipsis: true, render: (v) => v || '—' },
    { title: '更新', dataIndex: 'updated_at', width: 170 },
    {
      title: '操作', key: 'op', width: 100, fixed: 'right',
      render: (_, r) => (
        <Tooltip title={RETRYABLE.has(r.status) ? '退回待办，轮询器将重新执行' : '仅失败/需处理可重试'}>
          <Button
            size="small"
            icon={<RedoOutlined />}
            disabled={!RETRYABLE.has(r.status)}
            loading={retrying === r.id}
            onClick={() => retry(r)}
          >
            重试
          </Button>
        </Tooltip>
      ),
    },
  ], [retrying])

  return (
    <div>
      {msgCtx}
      <Space style={{ marginBottom: 12 }} wrap>
        <Select
          allowClear placeholder="按状态筛选" style={{ width: 160 }}
          value={status} onChange={setStatus}
          options={Object.keys(STATUS_LABEL).map((k) => ({ value: k, label: STATUS_LABEL[k] }))}
        />
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>刷新</Button>
        <span style={{ color: '#999' }}>共 {total} 条（最多显示 200）</span>
      </Space>
      <Table
        size="small" rowKey="id" loading={loading}
        dataSource={rows} columns={columns}
        pagination={{ pageSize: 20, showTotal: (t) => `${t} 条` }}
        scroll={{ x: 900 }}
      />
    </div>
  )
}
