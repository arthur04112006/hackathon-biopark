import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getDashboardData, downloadPdf, runAllQueries,
  getProtocols, createProtocol, updateProtocol, deleteProtocol,
  bulkDeleteProtocols, runSingleQuery, previewSpreadsheet, confirmImport,
  askQuestion,
} from '../services/api'
import { useNavigate } from 'react-router-dom'
import {
  FileText, RefreshCw, LogOut, AlertTriangle, BarChart3,
  Plus, Upload, Search, X, Pencil, Trash2, Bell, Command,
  ChevronDown, MoreHorizontal, Sparkles, SendHorizonal,
} from 'lucide-react'

const STATUS_CONFIG = [
  { key: 'EM ANDAMENTO', label: 'Em andamento', chipBg: 'bg-brand-100', chipFg: 'text-brand-700', dot: 'bg-accent-blue',  barPct: 'bg-accent-blue'  },
  { key: 'PENDENTE',     label: 'Pendente',     chipBg: 'bg-amber-50',  chipFg: 'text-amber-800', dot: 'bg-accent-amber', barPct: 'bg-accent-amber' },
  { key: 'APROVADO',     label: 'Aprovado',     chipBg: 'bg-emerald-50', chipFg: 'text-emerald-700', dot: 'bg-accent-green', barPct: 'bg-accent-green' },
  { key: 'CANCELADO',    label: 'Cancelado',    chipBg: 'bg-red-50',    chipFg: 'text-red-700',   dot: 'bg-accent-red',   barPct: 'bg-accent-red'   },
  { key: 'REPROVADO',    label: 'Reprovado',    chipBg: 'bg-red-50',    chipFg: 'text-red-700',   dot: 'bg-red-400',      barPct: 'bg-red-400'      },
]

const EMPTY_FORM = {
  status: 'PENDENTE', projeto: '', protocolo: '', atividade: '',
  orgao_site_consultado: '', atribuido_a: '', data_abertura: '',
  data_finalizacao: '', situacao: '', ativo: true, url_consulta: '',
}

const CAMPOS = [
  ['status', 'Status'], ['projeto', 'Projeto'], ['protocolo', 'Protocolo'],
  ['atividade', 'Atividade'], ['orgao_site_consultado', 'Órgão / Site'],
  ['atribuido_a', 'Atribuído a'], ['data_abertura', 'Data Abertura'],
  ['data_finalizacao', 'Data Finalização'], ['situacao', 'Situação'],
  ['url_consulta', 'URL Consulta'],
]

export default function Dashboard() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  /* ─── filtros ─── */
  const [searchQuery,   setSearchQuery]   = useState('')
  const [filterOrgao,   setFilterOrgao]   = useState('')
  const [filterStatus,  setFilterStatus]  = useState('')
  const [filterProject, setFilterProject] = useState('')

  /* ─── CRUD ─── */
  const [showForm,        setShowForm]        = useState(false)
  const [editItem,        setEditItem]        = useState(null)
  const [form,            setForm]            = useState(EMPTY_FORM)
  const [formError,       setFormError]       = useState(null)
  const [pageError,       setPageError]       = useState(null)
  const [importing,       setImporting]       = useState(false)
  const [confirming,      setConfirming]      = useState(false)
  const [importPreview,   setImportPreview]   = useState(null)
  const [importResult,    setImportResult]    = useState(null)
  const [selected,        setSelected]        = useState(new Set())
  const [showBulkConfirm, setShowBulkConfirm] = useState(false)
  const [queryResult,     setQueryResult]     = useState(null)

  /* ─── AI ask ─── */
  const [aiQuestion, setAiQuestion] = useState('')
  const [aiAnswer,   setAiAnswer]   = useState(null)
  const [aiLoading,  setAiLoading]  = useState(false)
  const [aiError,    setAiError]    = useState(null)

  /* ─── queries ─── */
  const { data: dashData, refetch: refetchDash } = useQuery({
    queryKey: ['dashboard'], queryFn: getDashboardData,
  })
  const { data: protocols = [], isLoading } = useQuery({
    queryKey: ['protocols'], queryFn: () => getProtocols({ limit: 10000 }),
  })

  const mudancaMap = useMemo(() => {
    const map = {}
    Object.values(dashData?.por_projeto ?? {}).flat().forEach(p => { map[p.id] = p.houve_mudanca })
    return map
  }, [dashData])

  const uniqueOrgaos   = useMemo(() => [...new Set(protocols.map(p => p.orgao_site_consultado).filter(Boolean))].sort(), [protocols])
  const uniqueProjects = useMemo(() => [...new Set(protocols.map(p => p.projeto).filter(Boolean))].sort(), [protocols])

  const statusCounts = useMemo(() => {
    const c = {}; protocols.forEach(p => { c[p.status] = (c[p.status] ?? 0) + 1 }); return c
  }, [protocols])

  const filteredData = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    return protocols.filter(p => {
      const matchSearch  = !q || [p.projeto, p.protocolo, p.atividade, p.orgao_site_consultado, p.situacao, p.atribuido_a].some(f => f?.toLowerCase().includes(q))
      const matchOrgao   = !filterOrgao   || p.orgao_site_consultado === filterOrgao
      const matchStatus  = !filterStatus  || p.status === filterStatus
      const matchProject = !filterProject || p.projeto === filterProject
      return matchSearch && matchOrgao && matchStatus && matchProject
    })
  }, [protocols, searchQuery, filterOrgao, filterStatus, filterProject])

  const hasFilters = searchQuery || filterOrgao || filterStatus || filterProject
  const totalActive = (dashData?.ativos ?? 0)
  const totalAll = (dashData?.total ?? protocols.length)
  const mudancasHoje = (dashData?.com_mudanca_recente ?? 0)

  /* ─── mutations ─── */
  const saveMut = useMutation({
    mutationFn: (d) => editItem ? updateProtocol(editItem.id, d) : createProtocol(d),
    onSuccess: () => {
      qc.invalidateQueries(['protocols']); qc.invalidateQueries(['dashboard'])
      setShowForm(false); setEditItem(null); setForm(EMPTY_FORM); setFormError(null)
    },
    onError: (err) => {
      const msg = err.response?.data?.detail || err.message || 'Erro ao salvar'
      setFormError(typeof msg === 'object' ? JSON.stringify(msg) : msg)
    },
  })

  const delMut = useMutation({
    mutationFn: (id) => deleteProtocol(id),
    onSuccess: () => { qc.invalidateQueries(['protocols']); qc.invalidateQueries(['dashboard']); setPageError(null) },
    onError: (err) => {
      const msg = err.response?.data?.detail || err.message || 'Erro ao excluir'
      setPageError(typeof msg === 'object' ? JSON.stringify(msg) : msg)
    },
  })

  const queryMut = useMutation({
    mutationFn: (id) => runSingleQuery(id),
    onSuccess: (res) => { qc.invalidateQueries(['protocols']); qc.invalidateQueries(['dashboard']); setQueryResult(res) },
  })

  const bulkDelMut = useMutation({
    mutationFn: (force) => bulkDeleteProtocols([...selected], force),
    onSuccess: () => {
      qc.invalidateQueries(['protocols']); qc.invalidateQueries(['dashboard'])
      setSelected(new Set()); setShowBulkConfirm(false)
    },
    onError: (err) => {
      const msg = err.response?.data?.detail || err.message || 'Erro ao excluir'
      setPageError(typeof msg === 'object' ? JSON.stringify(msg) : msg)
      setShowBulkConfirm(false)
    },
  })

  /* ─── handlers ─── */
  function handleLogout() { localStorage.removeItem('token'); navigate('/login') }
  async function handleRunAll() {
    await runAllQueries()
    setTimeout(() => { refetchDash(); qc.invalidateQueries(['protocols']) }, 3000)
  }

  function handleSave() {
    if (!form.projeto?.trim())               return setFormError('Projeto é obrigatório')
    if (!form.protocolo?.trim())             return setFormError('Protocolo é obrigatório')
    if (!form.atividade?.trim())             return setFormError('Atividade é obrigatória')
    if (!form.orgao_site_consultado?.trim()) return setFormError('Órgão / Site é obrigatório')
    if (!form.data_abertura)                 return setFormError('Data de Abertura é obrigatória')
    setFormError(null)
    const payload = {
      status:                form.status,
      projeto:               form.projeto,
      protocolo:             form.protocolo,
      atividade:             form.atividade,
      orgao_site_consultado: form.orgao_site_consultado,
      atribuido_a:           form.atribuido_a   || null,
      data_abertura:         form.data_abertura,
      data_finalizacao:      form.data_finalizacao || null,
      situacao:              form.situacao      || null,
      ativo:                 form.ativo,
      url_consulta:          form.url_consulta  || null,
    }
    saveMut.mutate(payload)
  }

  function openEdit(item) {
    setEditItem(item)
    setForm({ ...item, data_abertura: item.data_abertura?.slice(0, 10) ?? '', data_finalizacao: item.data_finalizacao?.slice(0, 10) ?? '' })
    setShowForm(true)
  }

  async function handleImport(e) {
    const file = e.target.files[0]; if (!file) return
    e.target.value = ''; setImporting(true); setImportResult(null); setImportPreview(null)
    try { setImportPreview(await previewSpreadsheet(file)) }
    catch (err) { setPageError(err.response?.data?.detail || 'Erro ao processar planilha') }
    finally { setImporting(false) }
  }

  async function handleConfirmImport() {
    if (!importPreview) return
    setConfirming(true)
    try {
      const result = await confirmImport(importPreview.rows)
      setImportResult(result); setImportPreview(null)
      qc.invalidateQueries(['protocols']); qc.invalidateQueries(['dashboard'])
    } catch (err) { setPageError(err.response?.data?.detail || 'Erro ao importar dados') }
    finally { setConfirming(false) }
  }

  function toggleSelect(id) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleSelectAll() {
    if (selected.size === filteredData.length) setSelected(new Set())
    else setSelected(new Set(filteredData.map(p => p.id)))
  }
  function clearFilters() { setSearchQuery(''); setFilterOrgao(''); setFilterStatus(''); setFilterProject('') }

  async function handleAskQuestion(e) {
    e?.preventDefault()
    if (!aiQuestion.trim() || aiLoading) return
    setAiLoading(true); setAiError(null); setAiAnswer(null)
    try {
      const res = await askQuestion(aiQuestion.trim())
      setAiAnswer(res.answer)
    } catch (err) {
      setAiError(err.response?.data?.detail || 'Erro ao consultar IA')
    } finally {
      setAiLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-paper text-ink">

      {/* ═══ NAVBAR ═══ */}
      <header className="sticky top-0 z-30 h-14 flex items-center justify-between px-6 bg-surface border-b border-line">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5">
            <div className="logo-mark w-6 h-6" />
            <span className="font-semibold text-sm tracking-tight">Biopark</span>
            <span className="hidden sm:inline text-[10px] font-mono px-1.5 py-0.5 rounded bg-paper text-muted uppercase tracking-wider">Pro</span>
          </div>
          <nav className="hidden sm:flex items-center gap-1 text-sm">
            <button className="px-3 py-1.5 rounded-lg font-medium bg-paper text-ink">Protocolos</button>
            <button onClick={() => navigate('/reports')} className="px-3 py-1.5 rounded-lg text-muted hover:text-ink hover:bg-paper transition">Relatórios</button>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs w-64 bg-paper text-muted">
            <Search size={12} />
            <span className="flex-1 truncate">Buscar protocolo, projeto, órgão…</span>
            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-line-2 text-muted">⌘K</span>
          </div>
          <button className="relative w-9 h-9 rounded-lg flex items-center justify-center bg-paper hover:bg-line transition">
            <Bell size={14} className="text-ink" />
            {mudancasHoje > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold flex items-center justify-center text-white bg-accent-red">
                {mudancasHoje}
              </span>
            )}
          </button>
          <button onClick={handleLogout} title="Sair" className="w-9 h-9 rounded-lg flex items-center justify-center bg-paper hover:bg-line transition text-ink">
            <LogOut size={14} />
          </button>
          <div className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-semibold bg-ink text-lime">AR</div>
        </div>
      </header>

      <div className="px-6 py-6 max-w-[1400px] mx-auto">

        {/* ═══ Title row ═══ */}
        <div className="flex items-end justify-between mb-6 gap-4 flex-wrap">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-wider text-muted mb-1">
              {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })}
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">Protocolos</h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={downloadPdf}
              className="px-3.5 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 bg-surface border border-line-2 hover:border-ink/30 transition">
              <FileText size={14} /> PDF
            </button>
            <label className="px-3.5 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 bg-surface border border-line-2 hover:border-ink/30 transition cursor-pointer">
              <Upload size={14} /> Importar
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
            </label>
            <button onClick={handleRunAll}
              className="px-3.5 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 bg-surface border border-line-2 hover:border-ink/30 transition">
              <RefreshCw size={14} /> Consultar todos
            </button>
            <button onClick={() => { setShowForm(true); setEditItem(null); setForm(EMPTY_FORM) }}
              className="px-3.5 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 bg-ink text-lime hover:bg-ink-2 transition">
              <Plus size={14} /> Novo protocolo
            </button>
          </div>
        </div>

        {/* ═══ Page error ═══ */}
        {pageError && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center justify-between">
            <span>{pageError}</span>
            <button onClick={() => setPageError(null)} className="ml-4 text-red-400 hover:text-red-600 transition"><X size={14} /></button>
          </div>
        )}

        {/* ═══ Top KPIs ═══ */}
        <div className="grid grid-cols-12 gap-4 mb-4">
          {/* Hero card */}
          <div className="col-span-12 lg:col-span-5 rounded-2xl p-6 relative overflow-hidden bg-ink text-white">
            <div className="absolute -bottom-12 -right-12 w-60 h-60 rounded-full opacity-25 blur-3xl bg-lime" />
            <div className="relative">
              <div className="flex items-center justify-between mb-2">
                <div className="font-mono text-[11px] uppercase tracking-wider opacity-70">Total monitorado</div>
                <div className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded bg-lime/20 text-lime">
                  ativo agora
                </div>
              </div>
              <div className="flex items-end gap-3">
                <div className="text-6xl font-medium num tracking-tight">{totalAll}</div>
                <div className="text-sm opacity-60 pb-2">protocolos</div>
              </div>
              <div className="flex items-center gap-4 mt-4 text-xs text-white/70">
                <span><span className="num font-semibold text-white">{totalActive}</span> ativos</span>
                <span className="w-px h-3 bg-white/20" />
                <span><span className="num font-semibold text-white">{Math.max(0, totalAll - totalActive)}</span> finalizados</span>
              </div>
            </div>
          </div>

          {/* small KPIs */}
          <div className="col-span-12 lg:col-span-7 grid grid-cols-3 gap-4">
            <MiniKpi label="Ativos"        value={totalActive}    sub="em monitoramento" tone="green" />
            <MiniKpi label="Mudanças hoje" value={mudancasHoje}   sub="novas atualizações" tone="lime" />
            <MiniKpi label="Pendências"    value={statusCounts['PENDENTE'] ?? 0} sub="aguardando ação" tone="amber" />
          </div>
        </div>

        {/* ═══ AI Ask ═══ */}
        <div className="rounded-2xl p-5 mb-4 bg-surface border border-line">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={14} className="text-ink" />
            <span className="font-mono text-[11px] uppercase tracking-wider text-muted">Perguntas inteligentes</span>
          </div>
          <form onSubmit={handleAskQuestion} className="flex gap-2">
            <input
              value={aiQuestion}
              onChange={e => setAiQuestion(e.target.value)}
              placeholder="Ex: Quantos protocolos estão pendentes? Quais projetos têm mais aprovações?"
              className="flex-1 bg-paper border border-line-2 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ink/10 focus:border-ink/30 transition"
              disabled={aiLoading}
            />
            <button
              type="submit"
              disabled={!aiQuestion.trim() || aiLoading}
              className="px-4 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-1.5 bg-ink text-lime hover:bg-ink-2 disabled:opacity-40 transition shrink-0"
            >
              {aiLoading
                ? <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
                : <SendHorizonal size={14} />}
              {aiLoading ? 'Consultando…' : 'Perguntar'}
            </button>
          </form>

          {aiError && (
            <div className="mt-3 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center justify-between">
              <span>{aiError}</span>
              <button onClick={() => setAiError(null)} className="ml-3 text-red-400 hover:text-red-600"><X size={13} /></button>
            </div>
          )}

          {aiAnswer && (
            <div className="mt-3 bg-paper border border-line rounded-xl px-4 py-3 text-sm text-ink whitespace-pre-wrap leading-relaxed">
              {aiAnswer}
            </div>
          )}
        </div>

        {/* ═══ Status segmented row ═══ */}
        {!isLoading && protocols.length > 0 && (
          <div className="rounded-2xl p-5 mb-6 bg-surface border border-line">
            <div className="flex items-center justify-between mb-4">
              <div className="font-mono text-[11px] uppercase tracking-wider text-muted">
                Distribuição por status <span className="text-muted-faint">— clique para filtrar</span>
              </div>
              <span className="text-xs text-muted">{protocols.length} protocolos</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {STATUS_CONFIG.filter(s => statusCounts[s.key] > 0).map(s => {
                const isActive = filterStatus === s.key
                const count = statusCounts[s.key] ?? 0
                const pct = Math.round((count / protocols.length) * 100)
                return (
                  <button
                    key={s.key}
                    onClick={() => setFilterStatus(prev => prev === s.key ? '' : s.key)}
                    className={`text-left rounded-xl p-4 transition border ${isActive ? 'bg-paper border-line-2' : 'border-transparent hover:bg-paper'}`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-1.5">
                        <span className={`dot ${s.dot}`} />
                        <span className="text-[11px] font-medium text-muted">{s.label}</span>
                      </div>
                      <span className="text-[10px] font-mono text-muted-faint">{pct}%</span>
                    </div>
                    <div className="text-3xl font-medium num tracking-tight">{count}</div>
                    <div className="mt-2 h-1 rounded-full overflow-hidden bg-line">
                      <div className={`h-full rounded-full ${s.barPct}`} style={{ width: `${pct}%` }} />
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ═══ Filters ═══ */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[260px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            <input
              placeholder="Buscar projeto, protocolo, atividade…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-9 py-2.5 rounded-lg text-sm bg-surface border border-line-2 outline-none focus:ring-2 focus:ring-ink/10 focus:border-ink/30 transition"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink transition">
                <X size={13} />
              </button>
            )}
          </div>

          <FilterSelect value={filterProject} onChange={setFilterProject} placeholder="Projeto">
            {uniqueProjects.map(p => <option key={p} value={p}>{p}</option>)}
          </FilterSelect>
          <FilterSelect value={filterOrgao} onChange={setFilterOrgao} placeholder="Órgão">
            {uniqueOrgaos.map(o => <option key={o} value={o}>{o}</option>)}
          </FilterSelect>

          {hasFilters && (
            <button onClick={clearFilters} className="px-3 py-2.5 rounded-lg text-sm text-muted hover:text-ink bg-surface border border-line-2 transition flex items-center gap-1.5">
              <X size={12} /> Limpar
            </button>
          )}

          <div className="px-3 py-2.5 rounded-lg text-xs bg-paper text-muted ml-auto">
            <span className="font-mono text-ink num">{filteredData.length}</span>
            <span className="mx-1 text-muted-faint">de</span>
            <span className="font-mono num">{protocols.length}</span>
          </div>
        </div>

        {/* ═══ Bulk action bar ═══ */}
        {selected.size > 0 && (
          <div className="flex items-center justify-between bg-ink text-white rounded-xl px-4 py-2.5 mb-4">
            <span className="text-sm">
              <span className="font-semibold num">{selected.size}</span> protocolo(s) selecionado(s)
            </span>
            <div className="flex gap-2">
              <button onClick={() => setSelected(new Set())} className="text-xs text-white/70 hover:text-white transition px-2">
                Limpar
              </button>
              <button onClick={() => setShowBulkConfirm(true)} className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg transition">
                <Trash2 size={12} /> Excluir
              </button>
            </div>
          </div>
        )}

        {/* ═══ TABLE ═══ */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20"><Spinner /></div>
        ) : filteredData.length === 0 ? (
          <div className="bg-surface rounded-2xl border border-line py-16 flex flex-col items-center gap-3 text-center">
            <div className="w-12 h-12 bg-paper rounded-full flex items-center justify-center">
              <Search size={20} className="text-muted" />
            </div>
            <p className="font-medium text-ink">Nenhum protocolo encontrado</p>
            <p className="text-sm text-muted">Tente ajustar os filtros</p>
          </div>
        ) : (
          <div className="bg-surface rounded-2xl border border-line overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-paper border-b border-line">
                    <th className="px-4 py-3 w-8">
                      <input type="checkbox" checked={filteredData.length > 0 && selected.size === filteredData.length} onChange={toggleSelectAll} className="rounded accent-ink" />
                    </th>
                    {['Projeto','Protocolo','Atividade','Órgão','Status','Situação','Atualizado','Dur.',''].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredData.map((p, i) => (
                    <tr key={p.id} className={`border-b border-line last:border-0 hover:bg-paper/50 transition-colors ${selected.has(p.id) ? 'bg-brand-50/30' : ''}`}>
                      <td className="px-4 py-3.5">
                        <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} className="rounded accent-ink" />
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <span className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-semibold bg-paper text-ink shrink-0">
                            {(p.projeto || '?').split(' ').filter(Boolean).map(w=>w[0]).join('').slice(0,2).toUpperCase()}
                          </span>
                          <span className="font-medium max-w-[160px] truncate">{p.projeto}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs text-muted whitespace-nowrap">{p.protocolo}</td>
                      <td className="px-4 py-3.5 text-ink-2 max-w-[180px] truncate">{p.atividade}</td>
                      <td className="px-4 py-3.5 text-muted max-w-[140px] truncate">{p.orgao_site_consultado}</td>
                      <td className="px-4 py-3.5"><StatusChip status={p.status} /></td>
                      <td className="px-4 py-3.5 text-xs text-muted max-w-[140px] truncate">{p.situacao ?? <span className="text-muted-faint">—</span>}</td>
                      <td className="px-4 py-3.5">
                        {(mudancaMap[p.id] || p.houve_mudanca) ? (
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-lime-deep">
                            <span className="live-dot" />
                            agora há pouco
                          </span>
                        ) : (
                          <span className="text-xs text-muted-faint">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 font-mono num text-xs text-muted whitespace-nowrap">{p.duracao_dias != null ? `${p.duracao_dias}d` : '—'}</td>
                      <td className="px-4 py-3.5">
                        <div className="flex justify-end gap-0.5">
                          <button onClick={() => queryMut.mutate(p.id)} title="Consultar" className="w-7 h-7 rounded-md flex items-center justify-center text-muted hover:text-ink hover:bg-paper transition">
                            <RefreshCw size={13} />
                          </button>
                          <button onClick={() => openEdit(p)} title="Editar" className="w-7 h-7 rounded-md flex items-center justify-center text-muted hover:text-ink hover:bg-paper transition">
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => { if (confirm('Remover/inativar?')) delMut.mutate(p.id) }} title="Remover" className="w-7 h-7 rounded-md flex items-center justify-center text-muted hover:text-accent-red hover:bg-red-50 transition">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ═══ MODAL — Form ═══ */}
      {showForm && (
        <Modal onClose={() => { setShowForm(false); setEditItem(null); setFormError(null) }} title={editItem ? 'Editar protocolo' : 'Novo protocolo'} width="max-w-2xl">
          <div className="grid grid-cols-2 gap-4">
            {CAMPOS.map(([key, label]) => (
              <div key={key}>
                <label className="block text-[11px] font-medium text-muted mb-1.5 uppercase tracking-wider">{label}</label>
                <input
                  type={key.startsWith('data') ? 'date' : 'text'}
                  value={form[key] ?? ''}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  className="w-full bg-paper border border-line-2 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ink/10 focus:border-ink/30 transition"
                />
              </div>
            ))}
            <label className="col-span-2 flex items-center gap-2.5 bg-paper rounded-lg px-3 py-2.5 border border-line-2 cursor-pointer">
              <input type="checkbox" checked={form.ativo} onChange={e => setForm(f => ({ ...f, ativo: e.target.checked }))} className="w-4 h-4 rounded accent-ink" />
              <span className="text-sm font-medium">Protocolo ativo</span>
            </label>
          </div>
          {formError && <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{formError}</div>}
          <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-line">
            <button onClick={() => { setShowForm(false); setEditItem(null); setFormError(null) }} className="px-4 py-2 text-sm bg-paper hover:bg-line border border-line-2 rounded-lg transition">Cancelar</button>
            <button onClick={handleSave} disabled={saveMut.isPending} className="px-4 py-2 text-sm bg-ink text-lime hover:bg-ink-2 rounded-lg disabled:opacity-50 transition font-semibold">
              {saveMut.isPending ? 'Salvando...' : 'Salvar protocolo'}
            </button>
          </div>
        </Modal>
      )}

      {/* ═══ Loading import ═══ */}
      {importing && (
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-surface rounded-2xl shadow-pop px-10 py-10 flex flex-col items-center gap-4">
            <svg className="animate-spin h-7 w-7 text-ink" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            <div className="text-center">
              <p className="font-semibold">Processando planilha</p>
              <p className="text-muted text-sm mt-1">Isso pode levar alguns instantes…</p>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Import preview ═══ */}
      {importPreview && (
        <Modal onClose={() => setImportPreview(null)} title="Preview da importação" width="max-w-4xl">
          <div className="flex gap-3 mb-4 flex-wrap">
            <Pill tone="green">{importPreview.rows.length} para importar</Pill>
            <Pill tone="amber">{importPreview.ignorados.length} ignorada(s)</Pill>
            <Pill tone="red">{importPreview.erros.length} erro(s)</Pill>
          </div>

          {importPreview.rows.length === 0 ? (
            <p className="text-muted text-sm text-center py-8">Nenhuma linha válida encontrada para importar.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-paper border-b border-line text-muted text-left uppercase tracking-wider">
                    {['Linha','Projeto','Protocolo','Atividade','Status','Abertura'].map(h => <th key={h} className="px-3 py-2 font-medium whitespace-nowrap">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {importPreview.rows.map((row, i) => (
                    <tr key={i} className="border-b border-line last:border-0">
                      <td className="px-3 py-2 font-mono text-muted">{row.linha}</td>
                      <td className="px-3 py-2 font-medium">{row.projeto}</td>
                      <td className="px-3 py-2 font-mono text-muted">{row.protocolo}</td>
                      <td className="px-3 py-2 text-ink-2 max-w-xs truncate">{row.atividade}</td>
                      <td className="px-3 py-2"><StatusChip status={row.status} /></td>
                      <td className="px-3 py-2 text-muted">{row.data_abertura}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {importPreview.ignorados.length > 0 && (
            <details className="mt-3">
              <summary className="text-sm text-amber-700 cursor-pointer font-medium select-none">{importPreview.ignorados.length} linha(s) ignorada(s)</summary>
              <ul className="mt-2 space-y-1">
                {importPreview.ignorados.map((ig, i) => (
                  <li key={i} className="flex gap-2 text-xs bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5">
                    <span className="font-mono text-muted">{ig.linha}</span>
                    <span className="text-amber-800">{ig.motivo}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {importPreview.erros.length > 0 && (
            <details className="mt-2">
              <summary className="text-sm text-red-700 cursor-pointer font-medium select-none">{importPreview.erros.length} erro(s)</summary>
              <ul className="mt-2 space-y-1">
                {importPreview.erros.map((er, i) => (
                  <li key={i} className="flex gap-2 text-xs bg-red-50 border border-red-100 rounded-lg px-3 py-1.5">
                    <span className="font-mono text-muted">{er.linha}</span>
                    <span className="text-red-800">{er.erro}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-line">
            <button onClick={() => setImportPreview(null)} disabled={confirming} className="px-4 py-2 text-sm bg-paper hover:bg-line border border-line-2 rounded-lg transition disabled:opacity-50">Cancelar</button>
            <button onClick={handleConfirmImport} disabled={importPreview.rows.length === 0 || confirming} className="px-4 py-2 text-sm bg-ink text-lime hover:bg-ink-2 rounded-lg disabled:opacity-50 transition font-semibold">
              {confirming ? 'Importando…' : `Confirmar (${importPreview.rows.length})`}
            </button>
          </div>
        </Modal>
      )}

      {/* ═══ Import result ═══ */}
      {importResult && (
        <Modal onClose={() => setImportResult(null)} title="Importação concluída" width="max-w-sm">
          <div className="space-y-2">
            <ResultRow tone="green" label="Importados" value={importResult.importados?.length ?? 0} />
            <ResultRow tone="amber" label="Ignorados"  value={importResult.ignorados?.length ?? 0} />
            <ResultRow tone="red"   label="Erros"      value={importResult.erros?.length ?? 0} />
          </div>
          <button onClick={() => setImportResult(null)} className="mt-5 w-full py-2.5 bg-ink text-lime hover:bg-ink-2 rounded-lg text-sm font-semibold transition">Ok</button>
        </Modal>
      )}

      {/* ═══ Bulk delete confirm ═══ */}
      {showBulkConfirm && (
        <Modal onClose={() => setShowBulkConfirm(false)} title={`Excluir ${selected.size} protocolo(s)?`} width="max-w-md">
          <p className="text-sm text-muted mb-1">
            Protocolos com histórico serão <span className="font-medium text-amber-700">inativados</span>. Os demais serão <span className="font-medium text-red-700">removidos permanentemente</span>.
          </p>
          <p className="text-xs text-muted-faint mb-5">Para remover tudo permanentemente, use "Forçar exclusão".</p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowBulkConfirm(false)} className="px-3 py-2 text-sm bg-paper hover:bg-line border border-line-2 rounded-lg transition">Cancelar</button>
            <button onClick={() => bulkDelMut.mutate(true)} disabled={bulkDelMut.isPending} className="px-3 py-2 text-sm border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg disabled:opacity-50 transition">Forçar exclusão</button>
            <button onClick={() => bulkDelMut.mutate(false)} disabled={bulkDelMut.isPending} className="px-3 py-2 text-sm bg-ink text-lime hover:bg-ink-2 rounded-lg disabled:opacity-50 transition font-semibold">
              {bulkDelMut.isPending ? 'Excluindo…' : 'Confirmar'}
            </button>
          </div>
        </Modal>
      )}

      {/* ═══ Query result ═══ */}
      {queryResult && (
        <Modal onClose={() => setQueryResult(null)} title={<>Resultado — <span className="font-mono text-ink">{queryResult.protocolo}</span></>} width="max-w-md">
          {queryResult.resultado?.erro ? (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
              {queryResult.mudancas_detectadas?.[0] ?? queryResult.resultado.erro}
            </div>
          ) : queryResult.mudancas_detectadas?.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700 mb-2">Mudanças detectadas</p>
              {queryResult.mudancas_detectadas.map((m, i) => (
                <div key={i} className="flex items-start gap-2 text-sm bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5">
                  <AlertTriangle size={13} className="text-amber-500 mt-0.5 shrink-0" /> {m}
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 text-sm text-emerald-700">
              Nenhuma mudança detectada em relação à última consulta.
            </div>
          )}
          {queryResult.resultado?.status_consultado && (
            <p className="text-xs text-muted mt-3">
              Status atual: <span className="font-medium text-ink">{queryResult.resultado.status_consultado}</span>
            </p>
          )}
          <button onClick={() => setQueryResult(null)} className="mt-4 w-full py-2.5 bg-ink text-lime hover:bg-ink-2 rounded-lg text-sm font-semibold transition">Ok</button>
        </Modal>
      )}
    </div>
  )
}

/* ──── helpers ──── */

function MiniKpi({ label, value, sub, tone }) {
  const dotColor = { green: 'bg-accent-green', amber: 'bg-accent-amber', lime: 'bg-lime-deep' }[tone] || 'bg-muted'
  return (
    <div className="rounded-2xl p-5 bg-surface border border-line flex flex-col justify-between min-h-[130px]">
      <div className="font-mono text-[11px] uppercase tracking-wider text-muted">{label}</div>
      <div>
        <div className="text-4xl font-medium num tracking-tight mt-2">{value}</div>
        <div className="flex items-center gap-2 mt-1.5 text-xs text-muted">
          <span className={`dot ${dotColor}`} />
          {sub}
        </div>
      </div>
    </div>
  )
}

function FilterSelect({ value, onChange, placeholder, children }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="appearance-none bg-surface border border-line-2 rounded-lg pl-3 pr-8 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/10 focus:border-ink/30 cursor-pointer transition"
      >
        <option value="">{placeholder}</option>
        {children}
      </select>
      <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
    </div>
  )
}

function StatusChip({ status }) {
  const cfg = STATUS_CONFIG.find(s => s.key === status)
  if (!cfg) return <span className="pill bg-paper text-muted">{status}</span>
  return (
    <span className={`pill ${cfg.chipBg} ${cfg.chipFg}`}>
      <span className={`dot ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

function Modal({ title, children, onClose, width = 'max-w-lg' }) {
  return (
    <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`bg-surface rounded-2xl shadow-pop w-full ${width} max-h-[90vh] overflow-y-auto`}>
        <div className="p-5 border-b border-line flex items-center justify-between sticky top-0 bg-surface z-10">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-md flex items-center justify-center text-muted hover:text-ink hover:bg-paper transition"><X size={16} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

function Pill({ tone, children }) {
  const map = {
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    red:   'bg-red-50 text-red-700',
  }
  return <span className={`pill ${map[tone] || 'bg-paper text-muted'}`}>{children}</span>
}

function ResultRow({ tone, label, value }) {
  const map = {
    green: { bg: 'bg-emerald-50 border-emerald-100', fg: 'text-emerald-700' },
    amber: { bg: 'bg-amber-50 border-amber-100',     fg: 'text-amber-700'   },
    red:   { bg: 'bg-red-50 border-red-100',         fg: 'text-red-700'     },
  }[tone]
  return (
    <div className={`flex items-center justify-between border rounded-lg px-4 py-2.5 ${map.bg}`}>
      <span className={`text-sm ${map.fg}`}>{label}</span>
      <span className={`font-semibold num ${map.fg}`}>{value}</span>
    </div>
  )
}

function Spinner() {
  return (
    <div className="flex items-center gap-3 text-muted text-sm">
      <svg className="animate-spin h-5 w-5 text-ink" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
      </svg>
      Carregando…
    </div>
  )
}
