// 图片资产只读清单：GET /api/admin/images。
// 本阶段只展示 data/images/ 的真实文件和引用关系，不提供上传、删除或配置修改。
import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Card, Col, Descriptions, Drawer, Empty, Image, Row, Select, Space, Spin, Tag, Typography, message } from 'antd'
import { PictureOutlined, ReloadOutlined, LinkOutlined } from '@ant-design/icons'
import { request } from '../../api/client.js'

const USAGE_LABEL = {
  avatar: '头像',
  background: '背景',
  hotspot: '热点',
  project: '项目',
  markdown: '资料插图',
  site: '站点配置',
}

function formatBytes(size) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function usageText(value) {
  return USAGE_LABEL[value] || value
}

export default function ImageAssets() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [usage, setUsage] = useState()
  const [used, setUsed] = useState()
  const [detail, setDetail] = useState(null)
  const [msg, msgContext] = message.useMessage()

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await request('/api/admin/images')
      setItems(data.items || [])
    } catch (err) {
      setError(err?.message || '图片资产加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const usageOptions = useMemo(() => {
    const values = [...new Set(items.flatMap((item) => item.usage || []))]
    return values.sort().map((value) => ({ value, label: usageText(value) }))
  }, [items])

  const filtered = items.filter((item) => {
    if (usage && !item.usage?.includes(usage)) return false
    if (used === 'used' && !item.used) return false
    if (used === 'unused' && item.used) return false
    return true
  })

  return (
    <div>
      {msgContext}
      <Space wrap style={{ marginBottom: 16 }}>
        <Select
          allowClear
          placeholder="按用途筛选"
          style={{ width: 160 }}
          value={usage}
          onChange={setUsage}
          options={usageOptions}
        />
        <Select
          allowClear
          placeholder="按引用状态筛选"
          style={{ width: 160 }}
          value={used}
          onChange={setUsed}
          options={[{ value: 'used', label: '已引用' }, { value: 'unused', label: '未引用' }]}
        />
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>刷新</Button>
        <Typography.Text type="secondary">共 {filtered.length} / {items.length} 张</Typography.Text>
      </Space>

      {error ? <Alert type="error" showIcon message="图片资产加载失败" description={error} action={<Button onClick={load}>重试</Button>} /> : null}
      {loading ? <Spin style={{ margin: 40 }} /> : null}
      {!loading && !error && !filtered.length ? <Empty description="没有符合条件的图片" /> : null}

      <Row gutter={[16, 16]}>
        {filtered.map((item) => (
          <Col key={item.id} xs={24} sm={12} md={8} lg={6}>
            <Card
              hoverable
              size="small"
              cover={
                <div style={{ height: 150, background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  <Image preview={{ mask: '查看大图' }} src={item.url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              }
              onClick={() => setDetail(item)}
            >
              <Card.Meta
                avatar={<PictureOutlined />}
                title={<Typography.Text ellipsis={{ tooltip: item.name }}>{item.name}</Typography.Text>}
                description={
                  <Space direction="vertical" size={2} style={{ width: '100%' }}>
                    <Typography.Text type="secondary">{item.mime} · {formatBytes(item.size)}</Typography.Text>
                    <Space wrap size={[4, 4]}>
                      {(item.usage || []).map((value) => <Tag key={value} color="blue">{usageText(value)}</Tag>)}
                      {!item.used ? <Tag>未引用</Tag> : null}
                    </Space>
                  </Space>
                }
              />
            </Card>
          </Col>
        ))}
      </Row>

      <Drawer title={detail?.name || '图片详情'} width={520} open={Boolean(detail)} onClose={() => setDetail(null)}>
        {detail ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Image src={detail.url} alt={detail.name} style={{ width: '100%', maxHeight: 280, objectFit: 'contain', background: '#f5f5f5' }} />
            <Typography.Paragraph copyable={{ text: `${window.location.origin}${detail.url}` }}>
              <LinkOutlined /> <a href={detail.url} target="_blank" rel="noreferrer">{detail.url}</a>
            </Typography.Paragraph>
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="格式">{detail.mime}</Descriptions.Item>
              <Descriptions.Item label="大小">{formatBytes(detail.size)}</Descriptions.Item>
              <Descriptions.Item label="修改时间">{new Date(detail.updated_at).toLocaleString('zh-CN')}</Descriptions.Item>
              <Descriptions.Item label="用途">{detail.usage?.length ? detail.usage.map((value) => usageText(value)).join('、') : '未识别'}</Descriptions.Item>
            </Descriptions>
            <div>
              <Typography.Text strong>真实引用位置</Typography.Text>
              {detail.references?.length ? detail.references.map((ref) => (
                <Typography.Paragraph key={`${ref.source}:${ref.path}`} code style={{ margin: '8px 0 0' }}>
                  {ref.source} → {ref.path}
                </Typography.Paragraph>
              )) : <Typography.Paragraph type="secondary">当前没有发现引用，可以作为未引用资源候选。</Typography.Paragraph>}
            </div>
            <Alert type="info" showIcon message="当前为只读资产清单" description="本阶段不提供上传、删除或修改站点配置。" />
          </Space>
        ) : null}
      </Drawer>
    </div>
  )
}
