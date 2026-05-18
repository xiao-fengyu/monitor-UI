import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
})

// 日志 API
export const logsAPI = {
  getLogs: (params = {}) =>
    api.get('/logs', { params }).then(r => r.data),
  getOverview: () =>
    api.get('/logs', { params: { overview: true } }).then(r => r.data),
  getKeyServices: () =>
    api.get('/logs', { params: { all: true, lines: 50 } }).then(r => r.data),
  getTrend: (params = {}) =>
    api.get('/logs/trend', { params }).then(r => r.data),
}

// 监控 API
export const monitorAPI = {
  getStatus: () => api.get('/monitor/status').then(r => r.data),
  getResources: () => api.get('/monitor/resources').then(r => r.data),
  getService: (unit) => api.get(`/monitor/status/${unit}`).then(r => r.data),
  getServices: () => api.get('/monitor/services').then(r => r.data),
}

// 备份 API
export const backupAPI = {
  getStatus: () => api.get('/backup/status').then(r => r.data),
  runBackup: () => api.post('/backup/run').then(r => r.data),
  getHistory: (limit = 20) =>
    api.get('/backup/history', { params: { limit } }).then(r => r.data),
  getConfig: () => api.get('/backup/config').then(r => r.data),
}

export default api
