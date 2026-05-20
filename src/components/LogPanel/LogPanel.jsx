import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Card, Table, Tag, Select, Input, Button, Space, Typography, Spin, message,
  Form, Row, Col, DatePicker, Radio
} from 'antd'
import {
  SearchOutlined, ReloadOutlined, ClockCircleOutlined,
  FilterOutlined, TranslationOutlined
} from '@ant-design/icons'
import { logsAPI } from '../../services/api'
import dayjs from 'dayjs'
import LogAnalysis from './LogAnalysis'
import LogDiagnoseModal from './LogDiagnoseModal'

const { Title, Text } = Typography
const { RangePicker } = DatePicker

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

const LEVEL_OPTIONS = [
  { label: '🔴 ERROR', value: 'err' },
  { label: '🟠 CRIT', value: 'crit' },
  { label: '🟡 WARNING', value: 'warning' },
  { label: '🔵 INFO', value: 'info' },
  { label: '🟢 DEBUG', value: 'debug' },
]

const TIME_PRESETS = [
  { label: '最近10分钟', value: '10 min ago' },
  { label: '最近1小时', value: '1 hour ago' },
  { label: '最近6小时', value: '6 hours ago' },
  { label: '最近24小时', value: '24 hours ago' },
]

const SERVICE_OPTIONS = [
  { label: '全部', value: '' },
  { label: 'openclaw-gateway', value: 'openclaw-gateway' },
  { label: 'searxng', value: 'searxng' },
  { label: 'nginx', value: 'nginx' },
  { label: 'docker', value: 'docker' },
  { label: 'sshd', value: 'sshd' },
  { label: 'cron', value: 'cron' },
]

const AUTO_REFRESH_OPTIONS = [
  { label: '关', value: 0 },
  { label: '30s', value: 30000 },
  { label: '60s', value: 60000 },
  { label: '5min', value: 300000 },
]

/** 从日志消息中提取中文解释 */
function getExplanation(msg) {
  if (!msg) return null
  if (msg.includes('Failed password')) {
    const match = msg.match(/Failed password for (\S+) from (\S+)/)
    return match ? `🔴 SSH 登录失败：用户「${match[1]}」从 IP ${match[2]} 尝试登录` : '🔴 SSH 登录失败'
  }
  if (msg.includes('Accepted password')) {
    const match = msg.match(/Accepted password for (\S+) from (\S+)/)
    return match ? `🟢 SSH 登录成功：用户「${match[1]}」从 IP ${match[2]} 成功登录` : '🟢 SSH 登录成功'
  }
  if (msg.includes('session opened')) return '🟢 会话已打开（用户登录或 cron 任务开始）'
  if (msg.includes('session closed')) return '🔵 会话已关闭（用户退出或 cron 任务结束）'
  if (msg.includes('Started') && msg.includes('Service')) {
    const match = msg.match(/Started (.+?)\./)
    return match ? `🟢 服务已启动：${match[1]}` : '🟢 服务已启动'
  }
  if (msg.includes('Stopping')) return '🟡 服务正在停止'
  if (msg.includes('Stopped')) return '🔴 服务已停止'
  if (msg.includes('Failed') || msg.includes('failed')) return '🔴 任务执行失败，请检查详情'
  if (msg.includes('listening') || msg.includes('Listening')) return '🟢 服务已就绪，正在监听端口'
  return null
}

/** 关键词高亮组件 */
function HighlightText({ text, keyword }) {
  if (!text || !keyword) return <Text ellipsis style={{ maxWidth: 600 }}>{text}</Text>
  const parts = text.split(new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))
  return (
    <Text ellipsis style={{ maxWidth: 600 }}>
      {parts.map((part, i) =>
        part.toLowerCase() === keyword.toLowerCase()
          ? <mark key={i} style={{ backgroundColor: '#fff566', padding: '0 2px', borderRadius: 2 }}>{part}</mark>
          : <span key={i}>{part}</span>
      )}
    </Text>
  )
}

/** 展开行：中文解释 + 翻译 + 原始消息 */
function ExpandedRow({ record }) {
  const explanation = getExplanation(record.message)
  const [translation, setTranslation] = useState(null)
  const [translating, setTranslating] = useState(false)

  const handleTranslate = async () => {
    if (translation || !record.message) return
    setTranslating(true)
    try {
      const res = await logsAPI.translate(record.message)
      setTranslation(res.data?.translation || res.data)
    } catch (err) {
      message.error('翻译失败：' + (err.message || '未知错误'))
    } finally {
      setTranslating(false)
    }
  }

  return (
    <div style={{ padding: '8px 16px', background: '#fafafa', borderRadius: 4 }}>
      <div style={{ marginBottom: 8 }}>
        <Text strong>中文解释：</Text>
        {explanation
          ? <Text>{explanation}</Text>
          : <Text type="secondary">（暂无规则匹配）</Text>}
      </div>

      {!explanation && record.message && (
        <div style={{ marginBottom: 8 }}>
          <Text strong>AI 翻译：</Text>{' '}
          {translating ? (
            <Spin size="small" />
          ) : translation ? (
            <Text style={{ color: '#1890ff' }}>{translation}</Text>
          ) : (
            <Button
              type="link" size="small" icon={<TranslationOutlined />}
              onClick={handleTranslate} style={{ padding: 0 }}
            >
              点此翻译
            </Button>
          )}
        </div>
      )}

      {record.message && (
        <div>
          <Text strong>原始消息：</Text>
          <pre style={{
            margin: '4px 0 0',
            padding: 8,
            background: '#f5f5f5',
            borderRadius: 4,
            fontSize: 12,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}>{record.message}</pre>
        </div>
      )}
    </div>
  )
}

function LogPanel() {
  const [form] = Form.useForm()
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(false)
  const [overview, setOverview] = useState(null)
  const [autoRefreshMs, setAutoRefreshMs] = useState(0)
  const [timeMode, setTimeMode] = useState('preset') // 'preset' | 'custom'
  const [diagnoseTarget, setDiagnoseTarget] = useState(null)
  const timerRef = useRef(null)

  // 从表单读取查询参数
  const getQueryParams = useCallback(() => {
    const values = form.getFieldsValue()
    const { service, priority, timePreset, timeRange, keyword } = values

    // 处理时间参数
    let since = timePreset || '1 hour ago'
    if (timeMode === 'custom' && timeRange && timeRange[0] && timeRange[1]) {
      since = timeRange[0].format('YYYY-MM-DD HH:mm:ss')
    }

    return {
      unit: service || '',
      priority: (priority && priority.length > 0) ? priority.join(',') : '',
      since,
      grep: keyword || '',
      lines: 200,
    }
  }, [form, timeMode])

  // 查询日志
  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const params = getQueryParams()
      const res = await logsAPI.getLogs(params)
      setLogs(res.data?.logs || [])

      // 概览数据
      try {
        const ovRes = await logsAPI.getOverview()
        setOverview(ovRes.data)
      } catch { /* ignore */ }
    } catch (err) {
      message.error('获取日志失败：' + (err.message || '未知错误'))
    } finally {
      setLoading(false)
    }
  }, [getQueryParams])

  // 首次加载
  useEffect(() => {
    fetchLogs()
  }, [])

  // 自动刷新
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (autoRefreshMs > 0) {
      timerRef.current = setInterval(() => {
        fetchLogs()
      }, autoRefreshMs)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [autoRefreshMs, fetchLogs])

  // 构建表格列
  const buildColumns = () => {
    const { keyword } = form.getFieldsValue()
    return [
      {
        title: '时间',
        dataIndex: 'timestamp',
        key: 'time',
        width: 180,
        render: (ts) => ts ? dayjs(ts).format('MM-DD HH:mm:ss') : '-',
        sorter: (a, b) => new Date(a.timestamp) - new Date(b.timestamp),
        defaultSortOrder: 'descend',
      },
      {
        title: '级别',
        dataIndex: 'level',
        key: 'level',
        width: 90,
        filters: LEVEL_OPTIONS.map(o => ({ text: o.label, value: o.value })),
        onFilter: (value, record) => (record.level || 'info').toLowerCase() === value,
        render: (level) => {
          const lvl = (level || 'info').toLowerCase()
          return <Tag color={levelColors[lvl]} style={{ margin: 0 }}>{lvl.toUpperCase()}</Tag>
        },
      },
      {
        title: '服务',
        dataIndex: 'unit',
        key: 'service',
        width: 180,
        render: (unit) => <Tag color="purple" style={{ margin: 0 }}>{unit || '-'}</Tag>,
      },
      {
        title: '消息',
        dataIndex: 'message',
        key: 'message',
        ellipsis: true,
        render: (text) => <HighlightText text={text} keyword={keyword} />,
      },
      {
        title: '操作',
        key: 'action',
        width: 80,
        fixed: 'right',
        render: (_, record) => (
          <Button
            type="link" size="small"
            onClick={() => setDiagnoseTarget(record)}
            style={{ padding: 0 }}
          >
            🔍 诊断
          </Button>
        ),
      },
    ]
  }

  return (
    <div>
      <Title level={4}>📝 日志聚合</Title>
      <Text type="secondary">采集系统日志，附带中文含义解释和 AI 翻译</Text>

      {/* ========== AI 诊断面板 ========== */}
      <LogAnalysis
        unit={form.getFieldValue('service')}
        since={timeMode === 'preset' ? form.getFieldValue('timePreset') : undefined}
        lines={200}
      />

      {/* ========== 搜索区域 ========== */}
      <Card style={{ marginTop: 16 }} title={<><FilterOutlined /> 查询条件</>} size="small">
        <Form form={form} layout="vertical" onFinish={fetchLogs}>
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item name="service" label="服务" initialValue="">
                <Select options={SERVICE_OPTIONS} placeholder="全部服务" allowClear />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="priority" label="级别" initialValue={[]}>
                <Select
                  mode="multiple"
                  options={LEVEL_OPTIONS}
                  placeholder="全部级别"
                  maxTagCount="responsive"
                  allowClear
                />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="时间范围">
                <Radio.Group
                  value={timeMode}
                  onChange={e => {
                    setTimeMode(e.target.value)
                    if (e.target.value === 'preset') {
                      form.setFieldValue('timeRange', null)
                    }
                  }}
                  style={{ marginBottom: 8 }}
                >
                  <Radio.Button value="preset">预设</Radio.Button>
                  <Radio.Button value="custom">自定义</Radio.Button>
                </Radio.Group>
                {timeMode === 'preset' ? (
                  <Form.Item name="timePreset" noStyle initialValue="1 hour ago">
                    <Select options={TIME_PRESETS} style={{ width: '100%' }} />
                  </Form.Item>
                ) : (
                  <Form.Item name="timeRange" noStyle>
                    <RangePicker showTime format="YYYY-MM-DD HH:mm" style={{ width: '100%' }} />
                  </Form.Item>
                )}
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="keyword" label="关键词">
                <Input
                  placeholder="搜索关键词（支持正则）"
                  allowClear
                  onPressEnter={() => form.submit()}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16} justify="end" align="middle" style={{ marginTop: 8 }}>
            <Col>
              <Space>
                <Button type="primary" htmlType="submit" icon={<SearchOutlined />} loading={loading}>
                  查询
                </Button>
                <Button
                  icon={<ReloadOutlined />}
                  onClick={() => { form.resetFields(); setTimeMode('preset'); fetchLogs() }}
                >
                  重置
                </Button>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  <ClockCircleOutlined /> 自动刷新：
                </Text>
                <Select
                  value={autoRefreshMs}
                  onChange={setAutoRefreshMs}
                  options={AUTO_REFRESH_OPTIONS}
                  style={{ width: 80 }}
                  size="small"
                />
              </Space>
            </Col>
          </Row>
        </Form>
      </Card>

      {/* ========== 概览统计 ========== */}
      {overview && (
        <Card style={{ marginTop: 16 }} size="small">
          <Space size="large" wrap>
            <Text>总日志量：<Text strong>{overview.total || '-'}</Text></Text>
            {Object.entries(overview.byLevel || {}).map(([level, count]) => (
              <Tag key={level} color={levelColors[level.toLowerCase()]}>{level}: {count}</Tag>
            ))}
          </Space>
        </Card>
      )}

      {/* ========== 日志列表 ========== */}
      <Card style={{ marginTop: 16 }} title="📋 日志列表" size="small">
        <Spin spinning={loading}>
          <Table
            dataSource={logs}
            columns={buildColumns()}
            rowKey={(_, i) => i}
            expandable={{
              expandedRowRender: (record) => <ExpandedRow record={record} />,
              rowExpandable: () => true,
            }}
            pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
            size="small"
            scroll={{ x: 1200 }}
          />
        </Spin>
      </Card>

      {/* ========== AI 日志诊断模态框 ========== */}
      <LogDiagnoseModal
        visible={!!diagnoseTarget}
        targetLog={diagnoseTarget}
        onClose={() => setDiagnoseTarget(null)}
      />
    </div>
  )
}

export default LogPanel
