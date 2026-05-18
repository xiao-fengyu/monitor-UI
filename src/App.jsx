import { Routes, Route, Navigate } from 'react-router-dom'
import MainLayout from './components/Layout/MainLayout'
import LogPanel from './components/LogPanel/LogPanel'
import MonitorPanel from './components/MonitorPanel/MonitorPanel'
import BackupPanel from './components/BackupPanel/BackupPanel'

function App() {
  return (
    <Routes>
      <Route path="/" element={<MainLayout />}>
        <Route index element={<Navigate to="/logs" replace />} />
        <Route path="logs" element={<LogPanel />} />
        <Route path="monitor" element={<MonitorPanel />} />
        <Route path="backup" element={<BackupPanel />} />
      </Route>
    </Routes>
  )
}

export default App
