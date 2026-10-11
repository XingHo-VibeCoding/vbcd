// 板块②仪表盘：GET /api/admin/overview 渲染四服务健康 + 计数 + 最近任务。
import { useEffect, useState } from 'react'
import { Card, Col, Row, Tag, Table, Statistic, Alert, Spin } from 'antd'
import { request } from '../../api/client.js'

const STATUS_COLOR = { ok: 'green', doing: 'blue', todo: 'default', failed: 'red', succeeded: 'green' }

function ServiceLight({ svc }) {
  // configured:false = 未配置（灰），ok=true = 绿，其余 = 红
  const color = svc.configured === false ? 'default' : svc.ok ? 'success' : 'error'
  const label = svc.configured === false ? '未配置' : svc.ok ? `正常 ${svc.latencyMs}ms` : '异常'
  return (
    <Card size="small">
      <Statistic
        title={svc.name}
        value={label}
        valueStyle={{ fontSize: 18, color: svc.configured === false ? '#999' : svc.ok ? '#3f8600' : '#cf1322' }}
      />
      <Tag color={color} style={{ marginTop: 8 }}>
        {svc.error ? svc.error : svc.status ? `HTTP ${svc.status}` : svc.configured === false ? '跳过' : '在线'}
      </Tag>
    </Card>
  )
}

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    request('/api/admin/overview')
      .then(setData)
      .catch((e) => setErr(e?.message || '加载失败'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Spin style={{ margin: 40 }} />
  if (err) return <Alert type="error" message="仪表盘加载失败" description={err} />
  if (!data) return null

  const svc = data.services || []
  const byStatus = data.counts?.tasks?.byStatus || {}

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>运维仪表盘</h2>
      <Row gutter={[12, 12]}>
        {svc.map((s) => (
          <Col key={s.name} xs={12} sm={12} md={6}>
            <ServiceLight svc={s} />
          </Col>
        ))}
      </Row>

      <Row gutter={[12, 12]} style={{ marginTop: 16 }}>
        <Col xs={12} md={6}>
          <Card size="small"><Statistic title="资料总数" value={data.counts?.notes?.total ?? '—'} /></Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small"><Statistic title="任务总数" value={data.counts?.tasks?.total ?? '—'} /></Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small"><Statistic title="进行中" value={byStatus.doing ?? 0} /></Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small"><Statistic title="失败" value={byStatus.failed ?? 0} valueStyle={{ color: byStatus.failed ? '#cf1322' : undefined }} /></Card>
        </Col>
      </Row>

      <Card size="small" title="最近任务" style={{ marginTop: 16 }}>
        <Table
          size="small"
          rowKey="id"
          pagination={false}
          dataSource={data.recentTasks || []}
          columns={[
            { title: '类型', dataIndex: 'type', width: 120 },
            { title: '标题', dataIndex: 'title', ellipsis: true, render: (v, r) => v || r.source_url || r.id },
            { title: '状态', dataIndex: 'status', width: 110, render: (s) => <Tag color={STATUS_COLOR[s]}>{s}</Tag> },
            { title: '创建时间', dataIndex: 'created_at', width: 180 },
          ]}
        />
      </Card>
    </div>
  )
}
