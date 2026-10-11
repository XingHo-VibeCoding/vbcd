// AdminLayout：后台的页面壳。Refine 的 <ThemedLayout> 提供侧边栏 + 标题区。
import { ThemedLayout, ThemedTitle } from '@refinedev/antd'
import { DashboardOutlined } from '@ant-design/icons'

export default function AdminLayout({ children }) {
  return (
    <ThemedLayout
      Title={({ collapsed }) => (
        <ThemedTitle collapsed={collapsed} text="buddy 后台" icon={<DashboardOutlined />} />
      )}
    >
      {children}
    </ThemedLayout>
  )
}
