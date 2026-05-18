import { useState, useEffect, useCallback } from 'react'
import { Card, Table, Tag, Button, Typography, Spin, Space, message, Statistic, Row, Col, Descriptions, Popconfirm } from 'antd'
import { CloudSyncOutlined, ClockCircleOutlined, ReloadOutlined, CloudUploadOutlined } from '@ant-design/icons'
import { backupAPI } from '../../services/api'
import dayjs from 'dayjs'

const { Title, Text } = Typography

function BackupPanel() {
  const [status, setStatus] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(false)
  const [backupRunning, setBackupRunning] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [statusRes, historyRes] = await Promise.all([
        backupAPI.getStatus(),
        backupAPI.getHistory(),
      ])
      setStatus(statusRes.data)
      setHistory(historyRes.data || [])
    } catch (err) {
      message.error('获取备份数据失败：' + (err.message || '未知错误'))
    } finally {
      setLoading(false)
    }
  }, [])

  const handleBackup = async () => {
    setBackupRunning(true)
    try {
      const result = await backupAPI.runBackup()
      if (result.success) {
        message.success('备份成功完成')
        fetchData() // Refresh data
      } else {
        message.error('备份失败：' + (result.error || '未知错误'))
      }
    } catch (err) {
      message.error('备份请求失败：' + (err.message || '未知错误'))
    } finally {
      setBackupRunning(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const columns = [
    {
      title: '提交哈希',
      dataIndex: 'hash',
      key: 'hash',
      width: 120,
    },
    {
      title: '备份时间',
      dataIndex: 'date',
      key: 'date',
      width: 200,
      render: (date) => dayjs(date).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '备注',
      dataIndex: 'message',
      key: 'message',
      render: (msg) => {
        if (msg?.includes('automated backup')) return <Tag color="blue">自动备份</Tag>
        return <Tag color="green">{msg || '手动备份'}</Tag>
      },
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>💾 备份管理</Title>
          <Text type="secondary">Git 备份历史、手动触发、状态监控</Text>
        </div>
        <Space>
          <Popconfirm
            title="确认执行备份"
            description="将当前项目代码、依赖和构建产物提交到 backup 分支"
            onConfirm={handleBackup}
            okText="确认"
            cancelText="取消"
          >
            <Button
              type="primary"
              icon={<CloudUploadOutlined />}
              loading={backupRunning}
            >
              立即备份
            </Button>
          </Popconfirm>
          <button onClick={fetchData} style={{ cursor: 'pointer', background: 'none', border: 'none', fontSize: 16 }}>
            <ReloadOutlined /> 刷新
          </button>
        </Space>
      </div>

      {/* 状态概览 */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={8}>
          <Card>
            <Statistic
              title="当前分支"
              value={status?.repo?.currentBranch || '-'}
              prefix={<CloudSyncOutlined />}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="备份分支"
              value={status?.repo?.backupBranchExists ? '已创建' : '未创建'}
              valueStyle={{ color: status?.repo?.backupBranchExists ? '#3f8600' : '#faad14' }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="备份大小"
              value={status?.size?.mb || '0'}
              suffix="MB"
            />
          </Card>
        </Col>
      </Row>

      <Descriptions
        bordered
        size="small"
        style={{ marginTop: 16 }}
        column={1}
        title="备份信息"
      >
        <Descriptions.Item label="最后备份时间">
          {status?.lastBackupCommit !== '从未备份' ? dayjs(status?.lastBackupCommit).format('YYYY-MM-DD HH:mm:ss') : '尚未执行过备份'}
        </Descriptions.Item>
        <Descriptions.Item label="备份策略">
          使用独立的 backup 分支，包含 node_modules 和 dist，支持零配置部署
        </Descriptions.Item>
      </Descriptions>

      {/* 备份历史 */}
      <Card style={{ marginTop: 16 }} title="备份历史" size="small">
        <Spin spinning={loading}>
          <Table
            dataSource={history}
            columns={columns}
            rowKey="hash"
            pagination={{ pageSize: 10 }}
            size="small"
            locale={{ emptyText: '暂无备份历史' }}
          />
        </Spin>
      </Card>
    </div>
  )
}

export default BackupPanel
