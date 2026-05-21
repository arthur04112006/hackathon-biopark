import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api

// Auth
export const login = (email, password) =>
  api.post('/auth/login', { email, password }).then((r) => r.data)

// Protocols
export const getProtocols = (params) => api.get('/protocols/', { params }).then((r) => r.data)
export const getProtocol = (id) => api.get(`/protocols/${id}`).then((r) => r.data)
export const createProtocol = (data) => api.post('/protocols/', data).then((r) => r.data)
export const updateProtocol = (id, data) => api.patch(`/protocols/${id}`, data).then((r) => r.data)
export const deleteProtocol = (id, force = false) => api.delete(`/protocols/${id}?force=${force}`)
export const bulkDeleteProtocols = (ids, force = false) => api.post('/protocols/bulk-delete', { ids, force }).then((r) => r.data)

// Import
export const importSpreadsheet = (file) => {
  const fd = new FormData()
  fd.append('file', file)
  return api.post('/import/spreadsheet', fd).then((r) => r.data)
}

export const previewSpreadsheet = (file) => {
  const fd = new FormData()
  fd.append('file', file)
  return api.post('/import/preview', fd).then((r) => r.data)
}

export const confirmImport = (rows) =>
  api.post('/import/confirm', { rows }).then((r) => r.data)

// Scraping
export const runAllQueries = () => api.post('/scraping/run-all').then((r) => r.data)
export const runSingleQuery = (id) => api.post(`/scraping/run/${id}`).then((r) => r.data)

// Ask AI
export const askQuestion = (question) =>
  api.post('/ask/', { question }).then((r) => r.data)

// Reports
export const getDashboardData = (params) => api.get('/reports/dashboard-data', { params }).then((r) => r.data)
export const downloadPdf = () =>
  api.get('/reports/pdf', { responseType: 'blob' }).then((r) => {
    const url = URL.createObjectURL(r.data)
    const a = document.createElement('a')
    a.href = url
    a.download = 'relatorio_protocolos.pdf'
    a.click()
  })
