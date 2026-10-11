// AdminApp：Refine 后台实例。挂在 /admin/* 下，独立于主站布局。
// 板块①骨架：Refine + AntD 主题 + 侧边栏 + 占位仪表盘；资源页后续板块再加。
import { Refine } from '@refinedev/core'
import { ThemedLayout, ThemedTitle, useNotificationProvider } from '@refinedev/antd'
import routerProvider from '@refinedev/react-router'
import { ConfigProvider, App as AntdApp } from 'antd'
import zhCN from 'antd/locale/zh_CN.js'
import { DashboardOutlined } from '@ant-design/icons'
import { Route, Routes } from 'react-router-dom'
import { dataProvider } from './dataProvider.js'
import { authProvider } from './authProvider.js'

// 占位仪表盘：板块②再接 /api/admin/overview 真数据
function Dashboard() {
  return (
    <div>
      <h2>运维仪表盘</h2>
      <p>后台骨架已就位。服务健康、任务统计将在板块②接入。</p>
    </div>
  )
}

export default function AdminApp() {
  return (
    <ConfigProvider locale={zhCN}>
      <AntdApp>
        <Refine
          dataProvider={dataProvider}
          authProvider={authProvider}
          routerProvider={routerProvider}
          notificationProvider={useNotificationProvider}
          resources={[
            {
              name: 'dashboard',
              list: '/admin',
              meta: { label: '仪表盘', icon: <DashboardOutlined /> },
            },
          ]}
          options={{ syncWithLocation: true }}
        >
          <Routes>
            <Route
              index
              element={
                <ThemedLayout Title={({ collapsed }) => <ThemedTitle collapsed={collapsed} text="buddy 后台" />}>
                  <Dashboard />
                </ThemedLayout>
              }
            />
          </Routes>
        </Refine>
      </AntdApp>
    </ConfigProvider>
  )
}
