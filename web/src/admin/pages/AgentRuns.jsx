// 板块④ agent 运行审计：GET /api/agent/runs 只读表。
// 行字段：ts/session_id/step/type(llm_call|tool_call|tool_result)/tool?/args?/ok/duration_ms/error?
import { useEffect, useState } from 'react'
import { Table, Tag, Select, Space, Button, Typography, message } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { request } from '../../api/client.js'

const TYPE_COLOR = { llm_call: 'purple', tool_call: 'geekblue', tool_result: 'cyan' }
const TYPE_LABEL = { llm_call: 'LLM 调用', tool_call: '工具调用', tool_result: '工具结果' }

export default function AgentRuns() {
  const [type, setType] = useState()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [msg, msgCtx] = message.useMessage()

  async function load() {
    setLoading(true)
    try {
      const data = await request('/api/agent/runs?limit=200')
      setRows(data.items || [])
    } catch (e) {
      msg.error(e?.message || '审计记录加载失败')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const filtered = type ? rows.filter((r) => r.type === type) : rows

  return (
    <div>
      {msgCtx}
      <Space style={{ marginBottom: 12 }} wrap>
        <Select allowClear placeholder="按类型筛选" style={{ width: 170 }}
          value={type} onChange={setType}
          options={Object.keys(TYPE_LABEL).map((k) => ({ value: k, label: TYPE_LABEL[k] }))} />
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>刷新</Button>
        <span style={{ color: '#999' }}>共 {filtered.length} 条</span>
      </Space>
      <Table
        size="small" loading={loading}
        rowKey={(r) => `${r.ts}-${r.step}-${r.type}-${r.tool || ''}-${Math.random()}`}
        dataSource={filtered}
        pagination={{ pageSize: 30 }}
        scroll={{ x: 900 }}
        columns={[
          { title: '时间', dataIndex: 'ts', width: 170, render: (v) => new Date(v).toLocaleString('zh-CN') },
          { title: '会话', dataIndex: 'session_id', width: 130, render: (v) => <Typography.Text code copyable style={{ fontSize: 12 }}>{v?.slice(0, 8)}</Typography.Text> },
          { title: '步', dataIndex: 'step', width: 50 },
          { title: '类型', dataIndex: 'type', width: 110, render: (t) => <Tag color={TYPE_COLOR[t]}>{TYPE_LABEL[t] || t}</Tag> },
          { title: '工具', dataIndex: 'tool', width: 140, render: (v) => v || '—' },
          { title: '参数/结果', key: 'args', ellipsis: true, render: (_, r) => r.args ? JSON.stringify(r.args).slice(0, 120) : (r.error || '—') },
          { title: '结果', dataIndex: 'ok', width: 70, render: (ok) => ok === false ? <Tag color="error">失败</Tag> : <Tag color="success">ok</Tag> },
          { title: '耗时', dataIndex: 'duration_ms', width: 90, render: (v) => v != null ? `${v}ms` : '—' },
        ]}
      />
    </div>
  )
}
