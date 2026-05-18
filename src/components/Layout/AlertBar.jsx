import { Badge } from 'antd'
import { BellOutlined } from '@ant-design/icons'

function AlertBar() {
  // TODO: 从 API 获取告警数量
  const alertCount = 0

  return (
    <Badge count={alertCount} size="small">
      <BellOutlined style={{ fontSize: 18, color: '#666' }} />
    </Badge>
  )
}

export default AlertBar
