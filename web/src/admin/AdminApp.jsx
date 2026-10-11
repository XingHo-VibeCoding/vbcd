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
import Dashboard from './pages/Dashboard.jsx'
import TaskList from './pages/TaskList.jsx'
import AgentRuns from './pages/AgentRuns.jsx'
import AgentTools from './pages/AgentTools.jsx'
import NoteBrowse from './pages/NoteBrowse.jsx'
import { UnorderedListOutlined, RobotOutlined, ToolOutlined, FileTextOutlined } from '@ant-design/icons'

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
            {
              name: 'tasks',
              list: '/admin/tasks',
              meta: { label: '任务队列', icon: <UnorderedListOutlined /> },
            },
            {
              name: 'agent-runs',
              list: '/admin/agent/runs',
              meta: { label: 'agent 审计', icon: <RobotOutlined /> },
            },
            {
              name: 'agent-tools',
              list: '/admin/agent/tools',
              meta: { label: 'agent 工具', icon: <ToolOutlined /> },
            },
            {
              name: 'notes',
              list: '/admin/notes',
              meta: { label: '资料浏览', icon: <FileTextOutlined /> },
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
            <Route
              path="tasks"
              element={
                <ThemedLayout Title={({ collapsed }) => <ThemedTitle collapsed={collapsed} text="buddy 后台" />}>
                  <TaskList />
                </ThemedLayout>
              }
            />
            <Route
              path="agent/runs"
              element={
                <ThemedLayout Title={({ collapsed }) => <ThemedTitle collapsed={collapsed} text="buddy 后台" />}>
                  <AgentRuns />
                </ThemedLayout>
              }
            />
            <Route
              path="agent/tools"
              element={
                <ThemedLayout Title={({ collapsed }) => <ThemedTitle collapsed={collapsed} text="buddy 后台" />}>
                  <AgentTools />
                </ThemedLayout>
              }
            />
            <Route
              path="notes"
              element={
                <ThemedLayout Title={({ collapsed }) => <ThemedTitle collapsed={collapsed} text="buddy 后台" />}>
                  <NoteBrowse />
                </ThemedLayout>
              }
            />
          </Routes>
        </Refine>
      </AntdApp>
    </ConfigProvider>
  )
}
