import AISettings from './AISettings'
import { Typography } from 'antd'
const { Title, Text } = Typography

function SettingsPage() {
  return (
    <div>
      <Title level={4}>⚙️ 系统设置</Title>
      <Text type="secondary">配置 AI 模型、通知渠道等系统参数</Text>

      <div style={{ marginTop: 16 }}>
        <AISettings />
      </div>
    </div>
  )
}

export default SettingsPage
