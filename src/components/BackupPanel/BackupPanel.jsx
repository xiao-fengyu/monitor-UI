import { Card, Typography } from 'antd'

const { Title, Text } = Typography

function BackupPanel() {
  return (
    <div>
      <Title level={4}>💾 备份管理</Title>
      <Text type="secondary">Git 备份历史、手动触发、定时配置</Text>
      <Card style={{ marginTop: 16 }}>
        <Text>备份面板开发中...</Text>
      </Card>
    </div>
  )
}

export default BackupPanel
