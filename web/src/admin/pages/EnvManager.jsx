// env 只读总览：GET /api/admin/env 分作用域展示配置状态。
// 配置分层（PLAN-admin §3 D10）：.env 管基础设施秘密，网页只读不编辑；
// 业务配置（可改/热生效的）走"站点设置"页（data/site.json）。
import { useEffect, useState } from 'react'
import { Table, Tag, Space, Button, Typography, message, Alert } from 'antd'
import { ReloadOutlined, LockOutlined } from '@ant-design/icons'
import { request } from '../../api/client.js'

const SCOPE_LABEL = { server: 'server/.env', asr: 'asr/.env', root: '根 .env' }

export default function EnvManager() {
  const [scopes, setScopes] = useState({})
  const [loading, setLoading] = useState(true)
  const [msg, msgCtx] = message.useMessage()

  async function load() {
    setLoading(true)
    try {
      const data = await request('/api/admin/env')
      setScopes(data.scopes || {})
    } catch (e) {
      msg.error(e?.message || '环境变量加载失败')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const columns = [
    { title: '键', dataIndex: 'key', width: 280, render: (k, r) => <Space>{r.sensitive && <LockOutlined style={{ color: '#fa8c16' }} />}<code>{k}</code></Space> },
    {
      title: '值 / 状态', key: 'value',
      render: (_, r) => {
        if (!r.set) return <Tag>未配置</Tag>
        if (r.sensitive) return <Typography.Text code style={{ fontSize: 12 }}>{r.preview}</Typography.Text>
        return <Typography.Text style={{ fontSize: 12, wordBreak: 'break-all' }}>{r.value || <Tag>空</Tag>}</Typography.Text>
      },
    },
    { title: '类型', dataIndex: 'sensitive', width: 90, render: (s) => s ? <Tag color="orange">敏感</Tag> : <Tag color="green">普通</Tag> },
    { title: '状态', dataIndex: 'set', width: 90, render: (s) => s ? <Tag color="success">已配置</Tag> : <Tag>未配置</Tag> },
  ]

  return (
    <div>
      {msgCtx}
      <Alert
        type="info" showIcon style={{ marginBottom: 16 }}
        message="基础设施配置（只读）"
        description=".env 管部署期秘密（数据库、API 密钥、开关），网页只显示配置状态不回显/编辑——要改请到服务器改文件后 docker compose up -d 重建。想网页改且热生效的业务配置（LLM 模型、头像、背景、限额）请去「站点设置」。"
      />
      <Space style={{ marginBottom: 12 }}>
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>刷新</Button>
      </Space>

      {Object.entries(scopes).map(([scope, info]) => (
        <div key={scope} style={{ marginBottom: 24 }}>
          <h3>{SCOPE_LABEL[scope] || scope} {!info.exists && <Tag>文件不存在</Tag>}</h3>
          {info.exists && (
            <Table size="small" rowKey="key" loading={loading}
              dataSource={info.vars} columns={columns} pagination={false} />
          )}
        </div>
      ))}
    </div>
  )
}
