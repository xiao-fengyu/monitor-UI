import { useState, useEffect, useCallback } from 'react'
import {
  Card, Table, Tag, Select, Input, Button, Space, Typography, Spin, message
} from 'antd'
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons'
import ReactECharts from 'echarts-for-react'
import { logsAPI } from '../../services/api'
import dayjs from 'dayjs'

const { Title, Text } = Typography

const levelColors = {
  emerg: 'magenta',
  alert: 'red',
  crit: 'orange',
  err: 'volcano',
  warning: 'gold',
  notice: 'geekblue',
  info: 'blue',
  debug: 'cyan',
}

const timeRanges = [
  { label: '最近10分钟', value: '10 min ago' },
  { label: '最近1小时', value: '1 hour ago' },
  { label: '最近6小时', value: '6 hours ago' },
  { label: '最近24小时', value: '24 hours ago' },
]

const serviceOptions = [
  { label: '全部', value: '' },
  { label: 'openclaw-gateway', value: 'openclaw-gateway' },
  { label: 'searxng', value: 'searxng' },
  { label: 'nginx', value: 'nginx' },
  { label: 'docker', value: 'docker' },
  { label: 'sshd', value: 'sshd' },
  { label: 'cron', value: 'cron' },
]

const columns = [
  {
    title: '时间',
    dataIndex: 'timestamp',
    key: 'time',
    width: 180,
    render: (ts) => {
      if (!ts) return '-'
      return dayjs(ts).format('MM-DD HH:mm:ss')
    },
  },
  {
    title: '级别',
    dataIndex: 'level',
    key: 'level',
    width: 80,
    render: (level) => {
      const lvl = (level || 'info').toLowerCase()
      return <Tag color={levelColors[lvl]} style={{ margin: 0 }}>{lvl.toUpperCase()}</Tag>
    },
  },
  {
    title: '服务',
    dataIndex: 'unit',
    key: 'service',
    width: 200,
    render: (unit) => <Tag color="purple">{unit || '-'}</Tag>,
  },
  {
    title: '消息',
    dataIndex: 'message',
    key: 'message',
    ellipsis: true,
  },
  {
    title: '中文解释',
    key: 'explanation',
    render: (_, record) => {
      const msg = record.message || ''
      // Simple pattern matching for common log types
      let explanation = null

      if (msg.includes('Failed password')) {
        const match = msg.match(/Failed password for (\S+) from (\S+)/)
        explanation = match ? `🔴 SSH 登录失败：用户「${match[1]}」从 IP ${match[2]} 尝试登录失败` : '🔴 SSH 登录失败'
      } else if (msg.includes('Accepted password')) {
        const match = msg.match(/Accepted password for (\S+) from (\S+)/)
        explanation = match ? `🟢 SSH 登录成功：用户「${match[1]}」从 IP ${match[2]} 成功登录` : '🟢 SSH 登录成功'
      } else if (msg.includes('session opened')) {
        explanation = '🟢 会话已打开（用户登录或 cron 任务开始）'
      } else if (msg.includes('session closed')) {
        explanation = '🔵 会话已关闭（用户退出或 cron 任务结束）'
      } else if (msg.includes('Started') && msg.includes('Service')) {
        const match = msg.match(/Started (.+?)\./)
        explanation = match ? `🟢 服务已启动：${match[1]}` : '🟢 服务已启动'
      } else if (msg.includes('Stopping')) {
        explanation = '🟡 服务正在停止'
      } else if (msg.includes('Stopped')) {
        explanation = '🔴 服务已停止'
      } else if (msg.includes('Failed') || msg.includes('failed')) {
        explanation = '🔴 任务执行失败，请检查详情'
      } else if (msg.includes('listening') || msg.includes('Listening')) {
        explanation = '🟢 服务已就绪，正在监听端口'
      }

      return explanation ? (
        <Text type="secondary" style={{ fontSize: 12 }}>{explanation}</Text>
      ) : (
        <Text type="secondary" style={{ fontSize: 12, color: '#bbb' }}>（暂无解释）</Text>
      )
    },
  },
]

function LogPanel() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(false)
  const [overview, setOverview] = useState(null)
  const [service, setService] = useState('')
  const [since, setSince] = useState('1 hour ago')
  const [grep, setGrep] = useState('')

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const params = { unit: service, since, grep, lines: 200 }
      const res = await logsAPI.getLogs(params)
      setLogs(res.data?.logs || [])
      // 概览数据
      try {
        const ovRes = await logsAPI.getOverview()
        setOverview(ovRes.data)
      } catch {}
    } catch (err) {
      message.error('获取日志失败：' + (err.message || '未知错误'))
    } finally {
      setLoading(false)
    }
  }, [service, since, grep])

  useEffect(() => {
    fetchOverview()
    fetchLogs()
  }, [])

  // 趋势数据（独立请求）
  const [trendData, setTrendData] = useState([])

  useEffect(() => {
    const fetchTrend = async () => {
      try {
        const res = await logsAPI.getTrend({ since })
        setTrendData(res.data || [])
      } catch {
        // ignore
      }
    }
    fetchTrend()
  }, [since, fetchLogs])

  return (
    <div>
      <Title level={4}>📝 日志聚合</Title>
      <Text type="secondary">采集系统日志，附带中文含义解释</Text>

      {overview && (
        <Card style={{ marginTop: 16 }} size="small">
          <Space size="large">
            <Text>总日志量：<Text strong>{overview.total || '-'}</Text></Text>
            {Object.entries(overview.byLevel || {}).map(([level, count]) => (
              <Tag key={level} color={levelColors[level.toLowerCase()]}>{level}: {count}</Tag>
            ))}
          </Space>
        </Card>
      )}

      {/* 日志趋势图 */}
      <Card style={{ marginTop: 16 }} title="📊 日志趋势" size="small">
        {trendData.length > 0 ? (
          <ReactECharts
            option={{
              tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
              legend: {
                data: ['ERROR', 'CRIT', 'WARNING', 'INFO', 'DEBUG'],
                top: 5,
              },
              grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
              xAxis: {
                type: 'category',
                data: trendData.map(d => dayjs(d.time).format('HH:mm')),
              },
              yAxis: { type: 'value', name: '数量' },
              series: [
                {
                  name: 'ERROR',
                  type: 'bar',
                  stack: 'total',
                  itemStyle: { color: '#ff4d4f' },
                  data: trendData.map(d => d.err + d.alert + d.emerg + d.crit),
                },
                {
                  name: 'WARNING',
                  type: 'bar',
                  stack: 'total',
                  itemStyle: { color: '#faad14' },
                  data: trendData.map(d => d.warning),
                },
                {
                  name: 'INFO',
                  type: 'bar',
                  stack: 'total',
                  itemStyle: { color: '#1890ff' },
                  data: trendData.map(d => d.info + d.notice),
                },
                {
                  name: 'DEBUG',
                  type: 'bar',
                  stack: 'total',
                  itemStyle: { color: '#13c2c2' },
                  data: trendData.map(d => d.debug),
                },
              ],
            }}
            style={{ height: 280 }}
          />
        ) : (
          <Text type="secondary">暂无趋势数据</Text>
        )}
      </Card>

      <Card style={{ marginTop: 16 }} title="查询条件" size="small">
        <Space wrap>
          <Select
            value={service} onChange={setService} style={{ width: 180 }}
            options={serviceOptions} placeholder="选择服务"
          />
          <Select
            value={since} onChange={setSince} style={{ width: 150 }}
            options={timeRanges} placeholder="时间范围"
          />
          <Input
            value={grep} onChange={e => setGrep(e.target.value)}
            placeholder="关键词搜索" style={{ width: 200 }}
            onPressEnter={fetchLogs}
          />
          <Button type="primary" icon={<SearchOutlined />} onClick={fetchLogs}>查询</Button>
          <Button icon={<ReloadOutlined />} onClick={() => { setGrep(''); fetchLogs() }}>重置</Button>
        </Space>
      </Card>

      <Card style={{ marginTop: 16 }} title="日志列表" size="small">
        <Spin spinning={loading}>
          <Table
            dataSource={logs}
            columns={columns}
            rowKey={(_, i) => i}
            pagination={{ pageSize: 20, showSizeChanger: true, showTotal: t => `共 ${t} 条` }}
            size="small"
            scroll={{ x: 1200 }}
          />
        </Spin>
      </Card>
    </div>
  )
}

export default LogPanel
