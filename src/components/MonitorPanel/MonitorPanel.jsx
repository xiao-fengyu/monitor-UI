import { Card, Typography } from 'antd'

const { Title, Text } = Typography

function MonitorPanel() {
  return (
    <div>
      <Title level={4}>🚨 监控告警</Title>
      <Text type="secondary">服务状态、资源使用、异常告警</Text>
      <Card style={{ marginTop: 16 }}>
        <Text>监控面板开发中...</Text>
      </Card>
    </div>
  )
}

export default MonitorPanel
