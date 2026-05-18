import { useState, useEffect, useCallback } from 'react'
import { Card, Row, Col, Table, Tag, Statistic, Typography, Spin, Space, Alert, List, Badge } from 'antd'
import { CloudServerOutlined, HddOutlined, ClockCircleOutlined, ReloadOutlined, WarningOutlined } from '@ant-design/icons'
import ReactECharts from 'echarts-for-react'
import { monitorAPI } from '../../services/api'
import dayjs from 'dayjs'

const { Title, Text } = Typography

// 告警规则
const ALERT_RULES = [
  { key: 'gateway', check: (svc) => svc.unit === 'openclaw-gateway' && !svc.active, level: 'critical', msg: 'OpenClaw 网关已停止' },
  { key: 'searxng', check: (svc) => svc.unit === 'searxng' && !svc.active, level: 'critical', msg: 'SearXNG 搜索服务已停止' },
  { key: 'memory', check: (res) => res?.memory && (res.memory.used / res.memory.total > 0.8), level: 'warning', msg: '内存使用率超过 80%' },
  { key: 'disk', check: (res) => parseInt(res?.disk?.usePercent || '0') > 80, level: 'warning', msg: '磁盘使用率超过 80%' },
  { key: 'load', check: (res) => parseFloat(res?.loadavg?.['1min'] || '0') > 5, level: 'warning', msg: '系统负载过高（1分钟负载 > 5）' },
]

function MonitorPanel() {
  const [services, setServices] = useState([])
  const [resources, setResources] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [alerts, setAlerts] = useState([])
  const [resourceHistory, setResourceHistory] = useState([])

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

      // 收集资源历史（用于趋势图）
      setResourceHistory(prev => {
        const now = dayjs().format('HH:mm')
        const newItem = {
          time: now,
          memoryPercent: resRes.data?.memory ? Math.round((resRes.data.memory.used / resRes.data.memory.total) * 100) : 0,
          diskPercent: parseInt(resRes.data?.disk?.usePercent || '0'),
          loadavg: parseFloat(resRes.data?.loadavg?.['1min'] || '0'),
        }
        const updated = [...prev, newItem].slice(-20) // 保留最近20条
        return updated
      })

      // 检查告警
      const newAlerts = []
      const res = resRes.data
      const svcs = statusRes.data?.services || []
      ALERT_RULES.forEach(rule => {
        const triggered = rule.check(rule.key.includes('memory') || rule.key.includes('disk') || rule.key.includes('load') ? res : svcs)
        if (triggered) {
          newAlerts.push({
            key: rule.key,
            level: rule.level,
            message: rule.msg,
            time: dayjs().format('HH:mm:ss'),
          })
        }
      })
      setAlerts(newAlerts)
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
        <Space>
          <Badge count={alerts.length} size="small">
            <button onClick={fetchData} style={{ cursor: 'pointer', background: 'none', border: 'none', fontSize: 16 }}>
              <ReloadOutlined /> 刷新
            </button>
          </Badge>
        </Space>
      </div>

      {error && <Alert message={error} type="error" showIcon style={{ marginTop: 16 }} />}

      {/* 实时告警 */}
      {alerts.length > 0 && (
        <Alert
          message="⚠️ 检测到告警"
          description={
            <List
              size="small"
              dataSource={alerts}
              renderItem={item => (
                <List.Item>
                  <Tag color={item.level === 'critical' ? 'red' : 'orange'}>{item.level === 'critical' ? '严重' : '警告'}</Tag>
                  {item.message}
                  <Text type="secondary" style={{ marginLeft: 12 }}>{item.time}</Text>
                </List.Item>
              )}
            />
          }
          type={alerts.some(a => a.level === 'critical') ? 'error' : 'warning'}
          showIcon
          style={{ marginTop: 16 }}
        />
      )}

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

      {/* 资源趋势图 */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={12}>
          <Card title="📊 内存趋势" size="small">
            <ReactECharts
              option={{
                grid: { top: 10, bottom: 25, left: 40, right: 10 },
                xAxis: { type: 'category', data: resourceHistory.map(d => d.time) },
                yAxis: { type: 'value', max: 100, name: '%' },
                series: [{
                  type: 'line',
                  smooth: true,
                  data: resourceHistory.map(d => d.memoryPercent),
                  itemStyle: { color: '#1890ff' },
                  areaStyle: { color: 'rgba(24,144,255,0.2)' },
                }],
              }}
              style={{ height: 200 }}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card title="📊 磁盘使用趋势" size="small">
            <ReactECharts
              option={{
                grid: { top: 10, bottom: 25, left: 40, right: 10 },
                xAxis: { type: 'category', data: resourceHistory.map(d => d.time) },
                yAxis: { type: 'value', max: 100, name: '%' },
                series: [{
                  type: 'line',
                  smooth: true,
                  data: resourceHistory.map(d => d.diskPercent),
                  itemStyle: { color: '#faad14' },
                  areaStyle: { color: 'rgba(250,173,20,0.2)' },
                }],
              }}
              style={{ height: 200 }}
            />
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
