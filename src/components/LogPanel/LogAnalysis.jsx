import { useState, useEffect } from 'react'
import { Card, Tag, Button, Spin, Collapse, Typography, Divider, Space } from 'antd'
import {
  ThunderboltOutlined, ReloadOutlined, CheckCircleOutlined,
  WarningOutlined, CloseCircleOutlined, InfoCircleOutlined,
  ArrowUpOutlined, ArrowDownOutlined, MinusOutlined
} from '@ant-design/icons'
import { logsAPI } from '../../services/api'

const { Text } = Typography

const healthConfig = {
  normal: { color: '#52c41a', icon: <CheckCircleOutlined />, label: '健康', emoji: '🟢' },
  warning: { color: '#faad14', icon: <WarningOutlined />, label: '警告', emoji: '🟡' },
  error: { color: '#ff4d4f', icon: <CloseCircleOutlined />, label: '异常', emoji: '🔴' },
  critical: { color: '#a855f7', icon: <CloseCircleOutlined />, label: '紧急', emoji: '🟣' },
  unknown: { color: '#999', icon: <InfoCircleOutlined />, label: '未知', emoji: '⚪' },
}

const trendConfig = {
  worsening: { color: '#ff4d4f', icon: <ArrowUpOutlined />, label: '恶化' },
  stable: { color: '#52c41a', icon: <MinusOutlined />, label: '稳定' },
  improving: { color: '#52c41a', icon: <ArrowDownOutlined />, label: '好转' },
  unknown: { color: '#999', icon: <InfoCircleOutlined />, label: '未知' },
}

const issueLevelConfig = {
  critical: { color: 'red', tag: '🔴 紧急' },
  warning: { color: 'gold', tag: '🟡 警告' },
  info: { color: 'blue', tag: '🔵 提示' },
}

function LogAnalysis({ unit, since, lines }) {
  const [analysis, setAnalysis] = useState(null)
  const [loading, setLoading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)

  const fetchAnalysis = async () => {
    setAnalyzing(true)
    try {
      const res = await logsAPI.analyze({
        unit: unit || '',
        since: since || '1 hour ago',
        lines: lines || 200,
      })
      setAnalysis(res.data)
    } catch (err) {
      // silent
    } finally {
      setAnalyzing(false)
    }
  }

  // 当查询条件变化时自动重新分析（但不自动刷新，由用户手动触发）
  useEffect(() => {
    // 首次加载自动分析
    fetchAnalysis()
  }, [])

  if (loading || analyzing) {
    return (
      <Card
        style={{ marginBottom: 16 }}
        title={<><ThunderboltOutlined /> AI 日志诊断</>}
        size="small"
      >
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>
            <Text type="secondary">AI 正在分析日志...</Text>
          </div>
        </div>
      </Card>
    )
  }

  if (!analysis) {
    return (
      <Card
        style={{ marginBottom: 16 }}
        title={<><ThunderboltOutlined /> AI 日志诊断</>}
        size="small"
        extra={<Button size="small" icon={<ReloadOutlined />} onClick={fetchAnalysis}>分析</Button>}
      >
        <Text type="secondary">暂无分析结果，点击按钮开始诊断</Text>
      </Card>
    )
  }

  const health = healthConfig[analysis.health] || healthConfig.unknown
  const trend = trendConfig[analysis.trend?.direction] || trendConfig.unknown

  return (
    <Card
      style={{ marginBottom: 16 }}
      title={
        <Space>
          <ThunderboltOutlined />
          <span>AI 日志诊断报告</span>
          <Tag color={health.color}>{health.emoji} {health.label}</Tag>
        </Space>
      }
      size="small"
      extra={
        <Button
          size="small"
          icon={<ReloadOutlined />}
          loading={analyzing}
          onClick={fetchAnalysis}
        >
          重新分析
        </Button>
      }
    >
      {/* 总结 */}
      <div style={{ marginBottom: 16, padding: '8px 12px', background: '#fafafa', borderRadius: 6 }}>
        <Text strong>📋 总评：</Text>
        <Text>{analysis.summary}</Text>
        <Divider type="vertical" style={{ margin: '0 12px' }} />
        <Text type="secondary">
          <span style={{ marginRight: 8 }}>📈 趋势：{trend.label}</span>
          {analysis.trend?.description && <span>{analysis.trend.description}</span>}
        </Text>
      </div>

      {/* 问题清单 */}
      {analysis.issues && analysis.issues.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <Text strong style={{ marginBottom: 8, display: 'block' }}>
            ⚠️ 发现问题 ({analysis.issues.length})
          </Text>
          <Collapse
            size="small"
            defaultActiveKey={analysis.issues.slice(0, 3).map((_, i) => String(i))}
            items={analysis.issues.map((issue, idx) => {
              const lvlConfig = issueLevelConfig[issue.level] || issueLevelConfig.info
              return {
                key: String(idx),
                label: (
                  <Space>
                    <Tag color={lvlConfig.color}>{lvlConfig.tag}</Tag>
                    <Text strong>{issue.service}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {issue.pattern || ''}
                    </Text>
                  </Space>
                ),
                children: <Text>{issue.description}</Text>,
              }
            })}
          />
        </div>
      )}

      {/* 修复建议 */}
      {analysis.recommendations && analysis.recommendations.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <Text strong style={{ marginBottom: 8, display: 'block' }}>
            🔧 修复建议
          </Text>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {analysis.recommendations.map((rec, idx) => (
              <div
                key={idx}
                style={{
                  padding: '6px 12px',
                  background: '#f0f5ff',
                  borderRadius: 4,
                  borderLeft: '3px solid #1890ff',
                }}
              >
                <Text>{idx + 1}. {rec}</Text>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 正常服务 */}
      {analysis.normalServices && analysis.normalServices.length > 0 && (
        <div>
          <Text strong style={{ marginBottom: 4, display: 'block' }}>
            ✅ 正常运行的服务
          </Text>
          <Space wrap>
            {analysis.normalServices.map(svc => (
              <Tag key={svc} color="green" icon={<CheckCircleOutlined />}>{svc}</Tag>
            ))}
          </Space>
        </div>
      )}
    </Card>
  )
}

export default LogAnalysis
