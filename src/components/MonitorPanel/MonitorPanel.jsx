import { useState, useEffect, useCallback } from 'react'
import { Card, Row, Col, Table, Tag, Statistic, Typography, Spin, Space, Alert } from 'antd'
import { CloudServerOutlined, HddOutlined, ClockCircleOutlined, ReloadOutlined } from '@ant-design/icons'
import { monitorAPI } from '../../services/api'

const { Title, Text } = Typography

function MonitorPanel() {
  const [services, setServices] = useState([])
  const [resources, setResources] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [statusRes, resRes] = await Promise.all([
        monitorAPI.getStatus(),
        monitorAPI.getResources(),
      ])
      setServices(statusRes.data?.services || [])
      setResources(resRes.data)
    } catch (err) {
      setError('获取监控数据失败：' + (err.message || '未知错误'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const timer = setInterval(fetchData, 30000) // 30秒刷新
    return () => clearInterval(timer)
  }, [fetchData])

  const activeCount = services.filter(s => s.active).length
  const totalCount = services.length

  const serviceColumns = [
    {
      title: '服务名称',
      dataIndex: 'unit',
      key: 'unit',
      render: (text) => <Text strong>{text}</Text>,
    },
    {
      title: '状态',
      dataIndex: 'active',
      key: 'active',
      width: 100,
      render: (active) => active
        ? <Tag color="success">运行中</Tag>
        : <Tag color="error">已停止</Tag>,
    },
    {
      title: '进程 PID',
      dataIndex: 'pid',
      key: 'pid',
      width: 100,
      render: (pid) => pid > 0 ? pid : '-',
    },
    {
      title: '内存',
      dataIndex: 'memoryMB',
      key: 'memoryMB',
      width: 100,
      render: (mem) => mem ? `${mem} MB` : '-',
    },
    {
      title: 'CPU 时间',
      dataIndex: 'cpuSec',
      key: 'cpuSec',
      width: 100,
      render: (cpu) => cpu ? `${cpu} 秒` : '-',
    },
    {
      title: '最后启动',
      dataIndex: 'lastStart',
      key: 'lastStart',
      width: 200,
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>🚨 监控告警</Title>
          <Text type="secondary">服务状态、系统资源实时监控</Text>
        </div>
        <button onClick={fetchData} style={{ cursor: 'pointer', background: 'none', border: 'none', fontSize: 16 }}>
          <ReloadOutlined /> 刷新
        </button>
      </div>

      {error && <Alert message={error} type="error" showIcon style={{ marginTop: 16 }} />}

      {/* 概览卡片 */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="服务存活"
              value={activeCount}
              suffix={`/ ${totalCount}`}
              prefix={<CloudServerOutlined />}
              valueStyle={{ color: activeCount === totalCount ? '#3f8600' : '#cf1322' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="内存使用"
              value={resources?.memory?.used || 0}
              suffix="MB"
              prefix={<HddOutlined />}
              valueStyle={{ color: ((resources?.memory?.used || 0) / (resources?.memory?.total || 1) > 0.8 ? '#cf1322' : undefined) }}
            />
            {resources?.memory && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                总计 {resources.memory.total} MB
              </Text>
            )}
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="磁盘使用"
              value={parseInt(resources?.disk?.usePercent || '0%')}
              suffix="%"
              prefix={<HddOutlined />}
              valueStyle={{ color: (parseInt(resources?.disk?.usePercent || '0') > 80 ? '#cf1322' : undefined) }}
            />
            {resources?.disk && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                可用 {resources.disk.available} MB
              </Text>
            )}
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="系统运行时间"
              value={resources?.uptime || '-'}
              prefix={<ClockCircleOutlined />}
            />
            {resources?.loadavg && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                负载 {resources.loadavg['1min']}
              </Text>
            )}
          </Card>
        </Col>
      </Row>

      {/* 服务列表 */}
      <Card style={{ marginTop: 16 }} title="服务状态" size="small">
        <Spin spinning={loading}>
          <Table
            dataSource={services}
            columns={serviceColumns}
            rowKey="unit"
            pagination={false}
            size="small"
          />
        </Spin>
      </Card>
    </div>
  )
}

export default MonitorPanel
