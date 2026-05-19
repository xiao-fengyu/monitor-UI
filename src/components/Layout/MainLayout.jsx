import { useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Layout, Menu, Typography } from 'antd'
import {
  FileTextOutlined,
  DashboardOutlined,
  CloudSyncOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import AlertBar from './AlertBar'

const { Sider, Content, Header } = Layout
const { Text } = Typography

const menuItems = [
  { key: '/logs', icon: <FileTextOutlined />, label: '日志聚合' },
  { key: '/monitor', icon: <DashboardOutlined />, label: '监控告警' },
  { key: '/backup', icon: <CloudSyncOutlined />, label: '备份管理' },
  { key: '/settings', icon: <SettingOutlined />, label: '系统设置' },
]

function MainLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed} theme="dark">
        <div style={{
          height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: collapsed ? 18 : 16, fontWeight: 600
        }}>
          {collapsed ? '🖥️' : '🖥️ 监控面板'}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>

      <Layout>
        <Header style={{
          background: '#fff', padding: '0 24px', display: 'flex',
          alignItems: 'center', justifyContent: 'space-between',
          borderBottom: '1px solid #f0f0f0'
        }}>
          <Text strong style={{ fontSize: 16 }}>OpenClaw 监控面板</Text>
          <AlertBar />
        </Header>
        <Content style={{ margin: 16, padding: 24, background: '#fff', borderRadius: 8 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}

export default MainLayout
