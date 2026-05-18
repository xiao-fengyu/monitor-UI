import { Card, Typography } from 'antd'

const { Title, Text } = Typography

function LogPanel() {
  return (
    <div>
      <Title level={4}>📝 日志聚合</Title>
      <Text type="secondary">采集并展示系统日志，附带中文含义解释</Text>
      <Card style={{ marginTop: 16 }}>
        <Text>日志面板开发中...</Text>
      </Card>
    </div>
  )
}

export default LogPanel
