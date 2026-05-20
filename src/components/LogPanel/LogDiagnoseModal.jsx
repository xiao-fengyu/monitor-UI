import { useState, useEffect, useRef } from 'react'
import { Modal, Spin, Tag, Divider, Space, Typography, Button, Collapse, Alert } from 'antd'
import {
  SearchOutlined, ReloadOutlined, ThunderboltOutlined,
  CheckCircleOutlined, WarningOutlined, CloseCircleOutlined,
  InfoCircleOutlined, ArrowRightOutlined, LinkOutlined,
  FileTextOutlined, ClockCircleOutlined,
} from '@ant-design/icons'
import { logsAPI } from '../../services/api'

const { Text, Title, Paragraph } = Typography

const severityConfig = {
  critical: { color: '#a855f7', label: '🟣 严重', bg: '#f5e8ff', border: '#c084fc' },
  high:     { color: '#ff4d4f', label: '🔴 高危', bg: '#fff1f0', border: '#ff7875' },
  medium:   { color: '#faad14', label: '🟡 中等', bg: '#fffbe6', border: '#ffd666' },
  low:      { color: '#52c41a', label: '🟢 低危', bg: '#f6ffed', border: '#95de64' },
  unknown:  { color: '#999',    label: '⚪ 未知', bg: '#fafafa', border: '#d9d9d9' },
}

const levelColors = {
  emerg: 'magenta', alert: 'red', crit: 'orange', err: 'volcano',
  warning: 'gold', notice: 'geekblue', info: 'blue', debug: 'cyan',
}

function formatTime(ts) {
  if (!ts) return '-'
  try {
    const d = new Date(ts)
    return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  } catch { return ts }
}

function LogLine({ log, isTarget = false }) {
  const lvl = (log.level || 'info').toLowerCase()
  return (
    <div
      style={{
        padding: '6px 10px',
        borderRadius: 4,
        fontSize: 12,
        fontFamily: 'monospace',
        lineHeight: 1.5,
        background: isTarget ? '#fffbe6' : 'transparent',
        borderLeft: isTarget ? '3px solid #faad14' : '3px solid transparent',
        marginBottom: 2,
        transition: 'background 0.2s',
      }}
    >
      <Space size={6}>
        <Text type="secondary" style={{ fontSize: 11, minWidth: 140 }}>{formatTime(log.timestamp)}</Text>
        <Tag color={levelColors[lvl]} style={{ margin: 0, fontSize: 10, padding: '0 4px', lineHeight: '16px' }}>
          {lvl.toUpperCase()}
        </Tag>
        <Tag color="purple" style={{ margin: 0, fontSize: 10, padding: '0 4px', lineHeight: '16px' }}>
          {log.unit || 'unknown'}
        </Tag>
        {isTarget && <Text strong style={{ color: '#d48806', fontSize: 10 }}>◀ 目标</Text>}
      </Space>
      <div style={{ marginTop: 3, wordBreak: 'break-all', color: isTarget ? '#d48806' : undefined, fontWeight: isTarget ? 600 : undefined }}>
        {log.message || '(空)'}
      </div>
    </div>
  )
}

function EvidenceItem({ evidence }) {
  const typeLabels = {
    upstream: { label: '上游触发', color: 'red', icon: '⬆️' },
    downstream: { label: '下游影响', color: 'blue', icon: '⬇️' },
    correlation: { label: '关联信号', color: 'orange', icon: '🔗' },
    symptom: { label: '伴随症状', color: 'gold', icon: '🩺' },
  }
  const t = typeLabels[evidence.type] || { label: evidence.type, color: 'default', icon: '📌' }

  return (
    <div style={{
      padding: '8px 12px',
      background: '#fafafa',
      borderRadius: 6,
      border: '1px solid #f0f0f0',
      marginBottom: 8,
    }}>
      <Space size={6} style={{ marginBottom: 4 }}>
        <span>{t.icon}</span>
        <Tag color={t.color} style={{ margin: 0 }}>{t.label}</Tag>
        <Text type="secondary" style={{ fontSize: 11 }}>{formatTime(evidence.timestamp)}</Text>
      </Space>
      {evidence.message && (
        <div style={{
          padding: '4px 8px',
          background: '#f5f5f5',
          borderRadius: 3,
          fontSize: 11,
          fontFamily: 'monospace',
          color: '#666',
          marginBottom: 4,
          wordBreak: 'break-all',
        }}>
          {evidence.message}
        </div>
      )}
      <Text style={{ fontSize: 13 }}>{evidence.description}</Text>
    </div>
  )
}

function LogDiagnoseModal({ visible, targetLog, onClose }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const handleDiagnose = async (log) => {
    const target = log || targetLog
    if (!target) return
    setLoading(true)
    setError(null)
    try {
      const res = await logsAPI.diagnose({
        targetLog: target,
        contextLines: 30,
        contextWindowSeconds: 60,
        sameService: true,
      })
      setResult(res.data)
    } catch (err) {
      setError(err.message || '诊断失败')
    } finally {
      setLoading(false)
    }
  }

  // 首次打开自动触发诊断
  const firstOpenRef = useRef(true)
  useEffect(() => {
    if (visible && targetLog && !result && !loading && firstOpenRef.current) {
      firstOpenRef.current = false
      handleDiagnose(targetLog)
    }
    if (!visible) {
      firstOpenRef.current = true
    }
  }, [visible, targetLog])

  const handleClose = () => {
    setResult(null)
    setError(null)
    setLoading(false)
    onClose()
  }

  const handleRetry = () => {
    setResult(null)
    setError(null)
    handleDiagnose(targetLog)
  }

  const sev = result?.diagnosis ? (severityConfig[result.diagnosis.severity] || severityConfig.unknown) : null

  return (
    <Modal
      title={
        <Space>
          <ThunderboltOutlined style={{ color: '#1890ff' }} />
          <span>AI 日志诊断</span>
        </Space>
      }
      open={visible}
      onCancel={handleClose}
      footer={null}
      width={800}
      styles={{ body: { padding: 0 } }}
    >
      {/* 目标日志头部 */}
      {targetLog && (
        <div style={{
          padding: '16px 24px',
          background: 'linear-gradient(135deg, #f0f5ff 0%, #e6f7ff 100%)',
          borderBottom: '1px solid #e8e8e8',
        }}>
          <div style={{ marginBottom: 8 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>🎯 目标日志</Text>
          </div>
          <div style={{
            padding: '10px 14px',
            background: '#fff',
            borderRadius: 6,
            border: '1px solid #d9d9d9',
          }}>
            <Space size={8} style={{ marginBottom: 4 }}>
              <Tag color={levelColors[(targetLog.level || 'info').toLowerCase()]} style={{ margin: 0 }}>
                {(targetLog.level || 'info').toUpperCase()}
              </Tag>
              <Tag color="purple" style={{ margin: 0 }}>{targetLog.unit || '-'}</Tag>
              <Text type="secondary" style={{ fontSize: 12 }}>
                <ClockCircleOutlined /> {formatTime(targetLog.timestamp)}
              </Text>
            </Space>
            <div style={{ wordBreak: 'break-all', fontSize: 13, fontFamily: 'monospace', color: '#333' }}>
              {targetLog.message}
            </div>
          </div>
        </div>
      )}

      {/* 内容区域 */}
      <div style={{ padding: '20px 24px', maxHeight: '60vh', overflowY: 'auto' }}>

        {/* 加载中 */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <Spin size="large" />
            <div style={{ marginTop: 16 }}>
              <Text type="secondary">AI 正在分析日志上下文...</Text>
            </div>
            <div style={{ marginTop: 8 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>正在抓取上下文日志并生成诊断报告</Text>
            </div>
          </div>
        )}

        {/* 错误 */}
        {error && !loading && (
          <Alert
            type="error"
            message="诊断失败"
            description={error}
            showIcon
            action={
              <Button size="small" onClick={handleRetry} icon={<ReloadOutlined />}>
                重试
              </Button>
            }
          />
        )}

        {/* 诊断结果 */}
        {result && result.diagnosis && !loading && (
          <div>

            {/* 严重度 + 根因判断 */}
            <div style={{
              padding: '12px 16px',
              background: sev?.bg || '#fafafa',
              border: `1px solid ${sev?.border || '#d9d9d9'}`,
              borderRadius: 8,
              marginBottom: 16,
            }}>
              <Space size={12} wrap>
                <Tag color={sev?.color || 'default'} style={{ margin: 0, fontSize: 13, padding: '2px 8px' }}>
                  {sev?.label || '未知'}
                </Tag>
                {result.diagnosis.isRootCause === true && (
                  <Tag color="red" style={{ margin: 0 }}>
                    <CloseCircleOutlined /> 根因
                  </Tag>
                )}
                {result.diagnosis.isRootCause === false && (
                  <Tag color="orange" style={{ margin: 0 }}>
                    <WarningOutlined /> 结果（非根因）
                  </Tag>
                )}
                {result.diagnosis.errorType && (
                  <Tag style={{ margin: 0, fontFamily: 'monospace' }}>
                    {result.diagnosis.errorType}
                  </Tag>
                )}
              </Space>
            </div>

            {/* 中文解释 */}
            {result.diagnosis.explanation && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ marginBottom: 6 }}>
                  <Space>
                    <FileTextOutlined style={{ color: '#1890ff' }} />
                    <Text strong>日志解释</Text>
                  </Space>
                </div>
                <div style={{
                  padding: '10px 14px',
                  background: '#fafafa',
                  borderRadius: 6,
                  borderLeft: '3px solid #1890ff',
                }}>
                  <Text style={{ fontSize: 14 }}>{result.diagnosis.explanation}</Text>
                </div>
              </div>
            )}

            {/* 根因分析 */}
            {result.diagnosis.rootCauseAnalysis && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ marginBottom: 6 }}>
                  <Space>
                    <SearchOutlined style={{ color: '#722ed1' }} />
                    <Text strong>根因分析</Text>
                  </Space>
                </div>
                <div style={{
                  padding: '10px 14px',
                  background: result.diagnosis.isRootCause ? '#fff1f0' : '#f6ffed',
                  borderRadius: 6,
                  borderLeft: `3px solid ${result.diagnosis.isRootCause ? '#ff4d4f' : '#52c41a'}`,
                }}>
                  <Text style={{ fontSize: 14 }}>{result.diagnosis.rootCauseAnalysis}</Text>
                </div>
              </div>
            )}

            {/* 证据链 */}
            {result.diagnosis.evidenceChain && result.diagnosis.evidenceChain.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ marginBottom: 8 }}>
                  <Space>
                    <LinkOutlined style={{ color: '#fa8c16' }} />
                    <Text strong>证据链 ({result.diagnosis.evidenceChain.length})</Text>
                  </Space>
                </div>
                {result.diagnosis.evidenceChain.map((ev, idx) => (
                  <EvidenceItem key={idx} evidence={ev} />
                ))}
              </div>
            )}

            {/* 修复建议 */}
            {result.diagnosis.recommendations && result.diagnosis.recommendations.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ marginBottom: 8 }}>
                  <Space>
                    <CheckCircleOutlined style={{ color: '#52c41a' }} />
                    <Text strong>修复建议</Text>
                  </Space>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {result.diagnosis.recommendations.map((rec, idx) => (
                    <div key={idx} style={{
                      padding: '8px 14px',
                      background: '#f0f5ff',
                      borderRadius: 6,
                      borderLeft: '3px solid #1890ff',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 8,
                    }}>
                      <ArrowRightOutlined style={{ color: '#1890ff', marginTop: 2, fontSize: 12 }} />
                      <Text style={{ fontSize: 13 }}>{rec}</Text>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 上下文日志（折叠面板） */}
            {result.context && (result.context.before?.length > 0 || result.context.after?.length > 0) && (
              <Collapse
                size="small"
                style={{ marginTop: 8 }}
                items={[{
                  key: 'context',
                  label: (
                    <Space>
                      <FileTextOutlined />
                      <Text strong>上下文日志</Text>
                      <Tag color="blue" style={{ margin: 0 }}>{result.context.totalContextLines} 条</Tag>
                    </Space>
                  ),
                  children: (
                    <div style={{ maxHeight: 400, overflowY: 'auto', background: '#fafafa', borderRadius: 4 }}>
                      {/* 前置上下文 */}
                      {result.context.before && result.context.before.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <Text type="secondary" style={{ fontSize: 11, padding: '4px 10px', display: 'block' }}>
                            ⬆️ 前置上下文 ({result.context.before.length})
                          </Text>
                          {result.context.before.slice(-15).map((log, idx) => (
                            <LogLine key={`before-${idx}`} log={log} />
                          ))}
                        </div>
                      )}

                      {/* 分隔线 */}
                      <Divider style={{ margin: '8px 0' }} />

                      {/* 后置上下文 */}
                      {result.context.after && result.context.after.length > 0 && (
                        <div>
                          <Text type="secondary" style={{ fontSize: 11, padding: '4px 10px', display: 'block' }}>
                            ⬇️ 后置上下文 ({result.context.after.length})
                          </Text>
                          {result.context.after.slice(0, 15).map((log, idx) => (
                            <LogLine key={`after-${idx}`} log={log} />
                          ))}
                        </div>
                      )}
                    </div>
                  ),
                }]}
              />
            )}

            {/* 重新诊断按钮 */}
            <div style={{ textAlign: 'right', marginTop: 12, paddingTop: 12, borderTop: '1px solid #f0f0f0' }}>
              <Button size="small" icon={<ReloadOutlined />} onClick={handleRetry} loading={loading}>
                重新诊断
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

export default LogDiagnoseModal
