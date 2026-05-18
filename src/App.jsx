import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'

function App() {
  return (
    <ConfigProvider locale={zhCN}>
      <div style={{ padding: 24, textAlign: 'center' }}>
        <h1>🖥️ OpenClaw 监控面板</h1>
        <p>项目初始化完成，各模块开发中...</p>
      </div>
    </ConfigProvider>
  )
}

export default App
