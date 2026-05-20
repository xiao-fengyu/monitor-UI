import { useState, useEffect } from 'react'
import { Card, Form, Input, Button, Switch, message, Tag, Space, Typography, Alert, Divider } from 'antd'
import { SettingOutlined, SaveOutlined, ExperimentOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { aiConfigAPI } from '../../services/api'

const { Text, Title } = Typography

function AISettings() {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [enabled, setEnabled] = useState(false)
  const [configLoaded, setConfigLoaded] = useState(false)

  // 加载配置
  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    try {
      const res = await aiConfigAPI.get()
      if (res.success && res.data) {
        const data = res.data
        form.setFieldsValue({
          provider: data.provider || '',
          baseUrl: data.baseUrl || '',
          model: data.model || '',
          apiKey: '', // 不回显真实 key
        })
        setEnabled(data.enabled || false)
        if (data.apiKeyMasked) {
          setTestResult({ success: true, message: `已配置 (${data.apiKeyMasked})` })
        }
      }
    } catch (err) {
      // ignore
    } finally {
      setConfigLoaded(true)
    }
  }

  // 测试连接
  const handleTest = async () => {
    const values = form.getFieldsValue()
    if (!values.baseUrl || !values.model) {
      message.warning('请先填写 Base URL 和 Model')
      return
    }

    // 如果 apiKey 为空但已有配置，使用后端保存的 key
    // 否则使用用户刚输入的 key
    const currentApiKey = values.apiKey || undefined

    setTesting(true)
    setTestResult(null)
    try {
      const res = await aiConfigAPI.test({
        baseUrl: values.baseUrl,
        model: values.model,
        apiKey: currentApiKey,
      })
      setTestResult(res)
      if (res.success) {
        message.success('连接成功！')
      } else {
        message.error(res.error || '连接失败')
      }
    } catch (err) {
      setTestResult({ success: false, error: '请求失败: ' + err.message })
    } finally {
      setTesting(false)
    }
  }

  // 保存配置
  const handleSave = async () => {
    const values = form.getFieldsValue()
    setSaving(true)
    try {
      const res = await aiConfigAPI.save({
        provider: values.provider || '',
        baseUrl: values.baseUrl || '',
        model: values.model || '',
        apiKey: values.apiKey || '',
        enabled: enabled,
      })
      if (res.success) {
        message.success('配置已保存')
        loadConfig()
      } else {
        message.error(res.error || '保存失败')
      }
    } catch (err) {
      message.error('保存失败: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  if (!configLoaded) return null

  return (
    <Card
      title={<><SettingOutlined /> AI 模型配置</>}
      extra={
        <Space>
          <Text type="secondary">启用 AI 诊断和翻译</Text>
          <Switch checked={enabled} onChange={setEnabled} />
        </Space>
      }
      style={{ marginBottom: 16 }}
    >
      <Alert
        message="配置说明"
        description="此配置用于日志智能诊断和 AI 翻译功能。支持任意 OpenAI 兼容 API 接口（如 OneAPI、NewAPI、直接 OpenAI 兼容端点等）。未启用时将回退到系统默认配置。"
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

      <Form form={form} layout="vertical">
        <Form.Item
          label="Provider 名称"
          name="provider"
          tooltip="仅用于标识，不影响功能"
        >
          <Input placeholder="例如：oneapi、openai、deepseek" />
        </Form.Item>

        <Form.Item
          label="Base URL"
          name="baseUrl"
          rules={[{ required: true, message: '请输入 API Base URL' }]}
          tooltip="OpenAI 兼容 API 的 Base URL，例如 https://api.openai.com/v1"
        >
          <Input placeholder="https://api.openai.com/v1" />
        </Form.Item>

        <Form.Item
          label="API Key"
          name="apiKey"
          tooltip="留空则保留上次配置的值"
        >
          <Input.Password placeholder="sk-..." />
        </Form.Item>

        <Form.Item
          label="Model"
          name="model"
          rules={[{ required: true, message: '请输入模型名称' }]}
          tooltip="要使用的模型名称，例如 gpt-4o-mini、deepseek-chat"
        >
          <Input placeholder="gpt-4o-mini" />
        </Form.Item>

        <Divider style={{ margin: '16px 0' }} />

        <Form.Item>
          <Space>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={handleSave}
              loading={saving}
            >
              保存配置
            </Button>
            <Button
              icon={<ExperimentOutlined />}
              onClick={handleTest}
              loading={testing}
            >
              测试连接
            </Button>
          </Space>
        </Form.Item>
      </Form>

      {testResult && (
        <Alert
          message={testResult.success ? '测试结果' : '测试失败'}
          description={testResult.success ? testResult.data?.message : testResult.error}
          type={testResult.success ? 'success' : 'error'}
          showIcon
          style={{ marginTop: 12 }}
        />
      )}

      {!enabled && (
        <Alert
          message="当前未启用自定义 AI 配置"
          description="翻译和诊断功能将使用系统默认配置（openclaw.json）。如需切换，请开启上方的启用开关。"
          type="warning"
          showIcon
          style={{ marginTop: 12 }}
        />
      )}
    </Card>
  )
}

export default AISettings
