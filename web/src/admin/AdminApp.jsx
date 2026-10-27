// AdminApp：Refine 后台实例。挂在 /admin/* 下，独立于主站布局。
// 板块①只搭骨架：Refine + AntD 主题 + 侧边栏 + 占位仪表盘；资源页后续板块再加。
import { Authenticated, Refine } from '@refinedev/core'
import { ThemedLayout, ThemedTitle, useNotificationProvider } from '@refinedev/antd'
import routerProvider, { CatchAllNavigate } from '@refinedev/react-router'
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
import EnvManager from './pages/EnvManager.jsx'
import SiteSettings from './pages/SiteSettings.jsx'
import ImageAssets from './pages/ImageAssets.jsx'
import SiteProfileSettings from './pages/SiteProfileSettings.jsx'
import { UnorderedListOutlined, RobotOutlined, ToolOutlined, FileTextOutlined, SettingOutlined, ControlOutlined, PictureOutlined, UserOutlined } from '@ant-design/icons'

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
            {
              name: 'settings',
              list: '/admin/settings',
              meta: { label: '站点设置', icon: <ControlOutlined /> },
            },
            {
              name: 'site-profile',
              list: '/admin/site',
              meta: { label: '站点与个人', icon: <UserOutlined /> },
            },
            {
              name: 'env',
              list: '/admin/env',
              meta: { label: '环境变量', icon: <SettingOutlined /> },
            },
            {
              name: 'images',
              list: '/admin/assets/images',
              meta: { label: '图片资产', icon: <PictureOutlined /> },
            },
          ]}
          options={{ syncWithLocation: true }}
        >
          <Authenticated
            key="admin-authenticated"
            fallback={<CatchAllNavigate to="/login" />}
            loading={<div style={{ padding: 24 }}>检查登录状态…</div>}
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
            <Route
              path="settings"
              element={
                <ThemedLayout Title={({ collapsed }) => <ThemedTitle collapsed={collapsed} text="buddy 后台" />}>
                  <SiteSettings />
                </ThemedLayout>
              }
            />
            <Route
              path="site"
              element={
                <ThemedLayout Title={({ collapsed }) => <ThemedTitle collapsed={collapsed} text="buddy 后台" />}>
                  <SiteProfileSettings />
                </ThemedLayout>
              }
            />
            <Route
              path="env"
              element={
                <ThemedLayout Title={({ collapsed }) => <ThemedTitle collapsed={collapsed} text="buddy 后台" />}>
                  <EnvManager />
                </ThemedLayout>
              }
            />
            <Route
              path="assets/images"
              element={
                <ThemedLayout Title={({ collapsed }) => <ThemedTitle collapsed={collapsed} text="buddy 后台" />}>
                  <ImageAssets />
                </ThemedLayout>
              }
            />
          </Routes>
          </Authenticated>
        </Refine>
      </AntdApp>
    </ConfigProvider>
  )
}
