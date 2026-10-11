// 板块④ agent 工具清单：GET /api/agent/tools 只读卡片。
// 工具条目：{name, description, risk:'readonly'|'needs-confirm'}
import { useEffect, useState } from 'react'
import { Card, Col, Row, Tag, Alert, Spin, Button, Space } from 'antd'
import { ReloadOutlined, SafetyOutlined, WarningOutlined } from '@ant-design/icons'
import { request } from '../../api/client.js'

export default function AgentTools() {
  const [tools, setTools] = useState([])
  const [err, setErr] = useState(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true); setErr(null)
    try {
      const data = await request('/api/agent/tools')
      setTools(data.tools || [])
    } catch (e) {
      setErr(e?.message || '工具清单加载失败')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  if (loading) return <Spin style={{ margin: 40 }} />
  if (err) return <Alert type="error" message="工具清单加载失败" description={err} action={<Button onClick={load}>重试</Button>} />

  return (
    <div>
      <Space style={{ marginBottom: 12 }}>
        <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
        <span style={{ color: '#999' }}>共 {tools.length} 个工具 · needs-confirm 类走确认闸门不直接执行</span>
      </Space>
      <Row gutter={[12, 12]}>
        {tools.map((t) => (
          <Col key={t.name} xs={24} sm={12} md={8}>
            <Card size="small" title={<Space>{t.risk === 'needs-confirm' ? <WarningOutlined style={{ color: '#fa8c16' }} /> : <SafetyOutlined style={{ color: '#52c41a' }} />}{t.name}</Space>}>
              <Tag color={t.risk === 'needs-confirm' ? 'orange' : 'green'}>
                {t.risk === 'needs-confirm' ? '需确认' : '只读'}
              </Tag>
              <p style={{ marginTop: 8, color: '#555', minHeight: 40 }}>{t.description || '—'}</p>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  )
}
