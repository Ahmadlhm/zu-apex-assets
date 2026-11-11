import { Children, isValidElement, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react'
import { Area, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { ArrowDown, ArrowUp, BookOpen, Check, ChevronDown, GraduationCap, House, Monitor, Moon, RefreshCw, RotateCcw, Search, Sun, TrendingUp, Users, X } from 'lucide-react'
import logo from '../../logo/zarqa_logo.png'
import { dashboardHref } from '../navigation'
import { useDisplayMode } from '../displayMode'
import { loadRegistration, loadRegistrationDays, loadRegistrationGraduates, hasRegistrationApi } from './api'
import { countFor, countGroups, formatCount as fmt, groupCount, matchingGraduates, ranks, terms, timelineFor, uniqueCount } from './model'
import type { AdmissionDay, Filters, Graduate, Snapshot } from './model'
import './registration.css'

const colors = ['var(--reg-blue)', 'var(--reg-green)', 'var(--reg-gold)', 'var(--reg-red)', 'var(--reg-muted)']
const registrationDayFormatter = new Intl.DateTimeFormat('ar-JO-u-nu-latn', { day: 'numeric', month: 'short', year: 'numeric' })
const currentYear = Number(new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Asia/Amman' }).format(new Date()))
const initialFilters: Filters = { year: currentYear, term: 0, entity: 'all', faculty: '', department: '', metric: 'admitted' }
type RankedRow = { id: string; name: string; total: number; color?: string }

function Card({ title, description, children, className = '', action }: { title: string; description?: string; children: ReactNode; className?: string; action?: ReactNode }) {
  return <section className={`reg-card ${className}`}><header><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</header>{children}</section>
}
function Empty({ children = 'لا توجد بيانات مطابقة للاختيار الحالي.' }: { children?: ReactNode }) { return <div className="reg-empty">{children}</div> }
function optionText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(optionText).join('')
  return isValidElement<{ children?: ReactNode }>(node) ? optionText(node.props.children) : ''
}
function Select({ label, value, onChange, children, disabled = false }: { label: string; value: string | number; onChange: (value: string) => void; children: ReactNode; disabled?: boolean }) {
  const id = useId()
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const options = Children.toArray(children).filter(isValidElement<{ value?: string | number; disabled?: boolean; children?: ReactNode }>).map(option => ({
    value: String(option.props.value ?? optionText(option.props.children)),
    label: optionText(option.props.children),
    disabled: Boolean(option.props.disabled),
  }))
  const selected = options.find(option => option.value === String(value))
  const searchable = options.length > 10
  const visible = query ? options.filter(option => option.label.toLocaleLowerCase('ar').includes(query.trim().toLocaleLowerCase('ar'))) : options
  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', closeOutside)
    if (searchable) search.current?.focus()
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [open, searchable])
  const choose = (option: (typeof options)[number]) => {
    if (option.disabled) return
    onChange(option.value)
    setOpen(false)
    setQuery('')
    trigger.current?.focus()
  }
  const toggle = () => {
    if (disabled) return
    setActive(Math.max(0, options.findIndex(option => option.value === String(value))))
    setQuery('')
    setOpen(current => !current)
  }
  const onKeys = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && open) { event.preventDefault(); setOpen(false); trigger.current?.focus(); return }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) { toggle(); return }
      setActive(index => Math.max(0, Math.min(visible.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))))
    }
    if (event.key === 'Enter' && open) {
      event.preventDefault()
      const option = visible[active]
      if (option) choose(option)
    }
  }
  return <div className={`reg-field reg-dropdown${open ? ' is-open' : ''}`} ref={root} onKeyDown={onKeys}>
    <span id={`${id}-label`}>{label}</span>
    <button ref={trigger} type="button" className="reg-dropdown-trigger" aria-labelledby={`${id}-label ${id}-value`} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? `${id}-list` : undefined} disabled={disabled} onClick={toggle}>
      <span id={`${id}-value`} className="reg-dropdown-value">{selected?.label ?? 'اختر'}</span><ChevronDown size={17} aria-hidden="true" />
    </button>
    {open && <div className="reg-dropdown-menu">
      {searchable && <div className="reg-dropdown-search"><Search size={16} aria-hidden="true" /><input ref={search} type="search" value={query} onChange={event => { setQuery(event.target.value); setActive(0) }} placeholder={`ابحث في ${label}`} aria-label={`ابحث في ${label}`} /></div>}
      <div id={`${id}-list`} className="reg-dropdown-options" role="listbox" aria-labelledby={`${id}-label`}>
        {visible.map((option, index) => <button key={`${option.value}-${index}`} type="button" role="option" aria-selected={option.value === String(value)} className={index === active ? 'is-active' : ''} disabled={option.disabled} onMouseEnter={() => setActive(index)} onClick={() => choose(option)}><span>{option.label}</span>{option.value === String(value) && <Check size={15} aria-hidden="true" />}</button>)}
        {!visible.length && <p className="reg-dropdown-empty">لا توجد نتائج مطابقة.</p>}
      </div>
    </div>}
  </div>
}
function Ranking({ rows, onSelect, selected = '', color = colors[0] }: { rows: RankedRow[]; onSelect?: (id: string) => void; selected?: string; color?: string }) {
  const max = Math.max(...rows.map(r => r.total), 1)
  if (!rows.length) return <Empty />
  return <div className="reg-ranking">{rows.map(row => {
    const content = <><span className="reg-rank-name">{row.name}</span><span className="reg-track"><i style={{ width: `${row.total / max * 100}%`, background: row.color ?? color }} /></span><b>{fmt(row.total)}</b></>
    return onSelect ? <button type="button" key={row.id} className="reg-rank" aria-pressed={selected === row.id} onClick={() => onSelect(row.id)}>{content}</button> : <div className="reg-rank" key={row.id}>{content}</div>
  })}</div>
}
function Donut({ rows, onSelect, selected, unit = 'طالب' }: { rows: RankedRow[]; onSelect?: (id: string) => void; selected?: string; unit?: string }) {
  const total = rows.reduce((s, r) => s + r.total, 0)
  if (!total) return <Empty />
  return <div className="reg-donut-layout"><div className="reg-donut"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={rows} dataKey="total" nameKey="name" innerRadius="63%" outerRadius="88%" stroke="var(--reg-card)" strokeWidth={3} onClick={(_, i) => onSelect?.(rows[i].id)} style={{ cursor: onSelect ? 'pointer' : 'default' }}>{rows.map((r, i) => <Cell key={r.id} fill={r.color ?? colors[i % colors.length]} />)}</Pie></PieChart></ResponsiveContainer><div className="reg-donut-center"><b>{fmt(total)}</b><small>{unit}</small></div></div><div className="reg-legend">{rows.map((r, i) => <button key={r.id} type="button" disabled={!onSelect} aria-pressed={selected === r.id} onClick={() => onSelect?.(r.id)}><i style={{ background: r.color ?? colors[i % colors.length] }} /><span>{r.name}</span><b>{fmt(r.total)}</b><small>{Math.round(r.total / total * 100)}%</small></button>)}</div></div>
}
function DailyChart({ rows, previous, labelA, labelB }: { rows: { date: string; count: number }[]; previous?: { date: string; count: number }[]; labelA: string; labelB: string }) {
  const [weeksBack, setWeeksBack] = useState(0)
  const [selected, setSelected] = useState('')
  const map = new Map<string, { date: string; label: string; current: number; previous: number }>()
  for (const r of rows) { const v = map.get(r.date) ?? { date: r.date, label: r.date.slice(5), current: 0, previous: 0 }; v.current += r.count; map.set(r.date, v) }
  const yearShift = Number.parseInt(labelA, 10) - Number.parseInt(labelB, 10)
  for (const r of previous ?? []) { const date = `${Number(r.date.slice(0, 4)) + yearShift}${r.date.slice(4)}`; const v = map.get(date) ?? { date, label: date.slice(5), current: 0, previous: 0 }; v.previous += r.count; map.set(date, v) }
  const all = [...map.values()].filter(day => day.current > 0 || day.previous > 0).sort((a, b) => a.date.localeCompare(b.date))
  const anchorIndex = all.reduce((index, day, i) => day.current > 0 ? i : index, -1)
  const pageAnchor = anchorIndex < 0 ? all.length - 1 : anchorIndex
  const olderPages = Math.ceil((pageAnchor + 1) / 7)
  const laterPages = Math.ceil((all.length - pageAnchor - 1) / 7)
  const activeWeek = Math.max(-laterPages, Math.min(weeksBack, olderPages - 1))
  const visible = activeWeek >= 0
    ? all.slice(Math.max(0, pageAnchor + 1 - (activeWeek + 1) * 7), pageAnchor + 1 - activeWeek * 7)
    : all.slice(pageAnchor + 1 + (-activeWeek - 1) * 7, pageAnchor + 1 - activeWeek * 7)
  if (!all.length) return <Empty />
  return <><div className="reg-line-legend"><span><i style={{ background: colors[0] }} />{labelA}</span>{previous && <span><i style={{ background: colors[2] }} />{labelB}</span>}</div><div className="reg-chart reg-line"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={visible} margin={{ top: 15, right: 15, bottom: 5, left: 0 }}><CartesianGrid strokeDasharray="3 4" vertical={false} /><XAxis dataKey="label" tickLine={false} axisLine={false} /><YAxis allowDecimals={false} width={45} tickLine={false} axisLine={false} /><Area name={labelA} type="monotone" dataKey="current" stroke={colors[0]} fill={colors[0]} fillOpacity={0.1} strokeWidth={2.5} dot={{ r: 3 }} />{previous && <Line name={labelB} type="monotone" dataKey="previous" stroke={colors[2]} strokeDasharray="5 4" strokeWidth={2} dot={{ r: 3 }} />}</ComposedChart></ResponsiveContainer></div><div className="reg-days">{visible.map(r => <button type="button" key={r.label} aria-pressed={selected === r.label} onClick={() => setSelected(selected === r.label ? '' : r.label)} aria-label={`${r.label}: ${labelA} ${r.current}${previous ? `، ${labelB} ${r.previous}` : ''}`}><small dir="ltr">{r.label}</small><b>{fmt(r.current)}</b>{previous && <em>{fmt(r.previous)}</em>}</button>)}</div>{selected && visible.some(r => r.label === selected) && <p className="reg-note" role="status">اليوم {selected}: {labelA} — {fmt(visible.find(r => r.label === selected)!.current)}{previous ? `، ${labelB} — ${fmt(visible.find(r => r.label === selected)!.previous)}` : ''}</p>}<div className="reg-pagination"><button type="button" disabled={activeWeek >= olderPages - 1} onClick={() => { setWeeksBack(activeWeek + 1); setSelected('') }}>السابق</button><span>صفحة {activeWeek + laterPages + 1} من {olderPages + laterPages}</span><button type="button" disabled={activeWeek <= -laterPages} onClick={() => { setWeeksBack(activeWeek - 1); setSelected('') }}>التالي</button></div></>
}

export default function RegistrationApp() {
  const [data, setData] = useState<Snapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [partial, setPartial] = useState(false)
  const [error, setError] = useState('')
  const [updated, setUpdated] = useState<Date | null>(null)
  const [refresh, setRefresh] = useState(0)
  const [filters, setFilters] = useState<Filters>(initialFilters)
  const [view, setView] = useState('overview')
  const [dark, setDark] = useState(() => localStorage.getItem('registration-theme') === 'dark')
  const { displayMode, setDisplayMode, scale, wideLayout } = useDisplayMode()
  const [compareYear, setCompareYear] = useState(currentYear - 1)
  const [compareTerm, setCompareTerm] = useState(0)
  const [fromDay, setFromDay] = useState('')
  const [toDay, setToDay] = useState('')
  const [gradeMode, setGradeMode] = useState('faculty')
  const [gradeRank, setGradeRank] = useState('')
  const [yearFrom, setYearFrom] = useState(currentYear - 1)
  const [yearTo, setYearTo] = useState(currentYear)
  const [progress, setProgress] = useState({ rows: 0, pages: 0 })
  const [loadedKey, setLoadedKey] = useState('')
  const [registeredDays, setRegisteredDays] = useState<AdmissionDay[]>([])
  const [daysLoadedKey, setDaysLoadedKey] = useState('')
  const [daysLoading, setDaysLoading] = useState(false)
  const [daysError, setDaysError] = useState('')
  const [graduates, setGraduates] = useState<Graduate[]>([])
  const [graduatesLoadedKey, setGraduatesLoadedKey] = useState('')
  const [graduateFailure, setGraduateFailure] = useState({ key: '', message: '' })
  const completedRefresh = useRef(0)
  const completedDaysRefresh = useRef(0)
  const completedGraduateRefresh = useRef(0)
  const viewRef = useRef(view)
  useEffect(() => { viewRef.current = view }, [view])
  const requestedYears = useMemo(() => [...new Set([filters.year, filters.year - 1, compareYear,
    ...Array.from({ length: Math.max(0, yearTo - yearFrom + 1) }, (_, i) => yearFrom + i)])].sort((a, b) => a - b), [filters.year, compareYear, yearFrom, yearTo])
  const requestKey = requestedYears.join(',')
  const dayYears = useMemo(() => [...new Set([filters.year, filters.year - 1, compareYear])].sort((a, b) => a - b), [filters.year, compareYear])
  const dailyFilters = useMemo(() => ({ entity: filters.entity, faculty: filters.faculty, department: filters.department, metric: filters.metric }), [filters.entity, filters.faculty, filters.department, filters.metric])
  const daysRequestKey = JSON.stringify([dayYears, filters.entity, filters.faculty, filters.department, filters.metric, refresh])
  useEffect(() => {
    document.documentElement.classList.add('registration-page')
    return () => document.documentElement.classList.remove('registration-page')
  }, [])
  useEffect(() => { document.title = 'لوحة القبول والتسجيل | جامعة الزرقاء'; document.documentElement.classList.toggle('dark', dark); localStorage.setItem('registration-theme', dark ? 'dark' : 'light') }, [dark])
  useEffect(() => {
    const controller = new AbortController()
    let active = true
    async function load() {
      setLoading(true); setError(''); setProgress({ rows: 0, pages: 0 })
      try {
        const result = await loadRegistration(controller.signal, { years: requestedYears, initialYear: filters.year, includeGraduates: false, refresh: refresh > completedRefresh.current,
          onProgress: value => { if (active) setProgress(value) },
          onInitial: viewRef.current === 'overview' ? snapshot => { if (active && viewRef.current === 'overview') { setData(snapshot); setLoadedKey(requestKey); setPartial(true) } } : undefined })
        if (!active) return
        setData(result); setPartial(false); setUpdated(new Date()); setLoadedKey(requestKey); completedRefresh.current = refresh
      } catch (e) { controller.abort(); if (active) setError(e instanceof Error ? e.message : 'تعذر تحميل بيانات التسجيل.') }
      finally { if (active) setLoading(false) }
    }
    void load()
    return () => { active = false; controller.abort() }
  }, [refresh, requestedYears, requestKey, filters.year])
  useEffect(() => { if (!hasRegistrationApi || loading) return; const id = setTimeout(() => setRefresh(r => r + 1), 300000); return () => clearTimeout(id) }, [loading, refresh])
  useEffect(() => {
    if (!hasRegistrationApi || view !== 'comparison') return
    const controller = new AbortController()
    let active = true
    async function loadDays() {
      setDaysLoading(true); setDaysError('')
      try {
        const rows = await loadRegistrationDays(controller.signal, dayYears, dailyFilters, refresh > completedDaysRefresh.current)
        if (active) { setRegisteredDays(rows); setDaysLoadedKey(daysRequestKey); completedDaysRefresh.current = refresh }
      } catch (e) { if (active) setDaysError(e instanceof Error ? e.message : 'تعذر تحميل التواريخ اليومية.') }
      finally { if (active) setDaysLoading(false) }
    }
    void loadDays()
    return () => { active = false; controller.abort() }
  }, [dayYears, daysRequestKey, dailyFilters, refresh, view])
  const summaryReady = Boolean(data && loadedKey === requestKey)
  const graduatesRequestKey = `${filters.year}:${refresh}`
  const graduatesError = graduateFailure.key === graduatesRequestKey ? graduateFailure.message : ''
  const gradesAvailable = Boolean(data?.gradesAvailable)
  useEffect(() => {
    if (!summaryReady || !gradesAvailable) return
    const controller = new AbortController()
    let active = true
    void loadRegistrationGraduates(controller.signal, { years: [filters.year], refresh: refresh > completedGraduateRefresh.current })
      .then(rows => { if (active) { setGraduates(rows); setGraduatesLoadedKey(graduatesRequestKey); setGraduateFailure({ key: '', message: '' }); completedGraduateRefresh.current = refresh } })
      .catch(e => { if (active) setGraduateFailure({ key: graduatesRequestKey, message: e instanceof Error ? e.message : 'تعذر تحميل بيانات الخريجين.' }) })
    return () => { active = false; controller.abort() }
  }, [summaryReady, gradesAvailable, filters.year, refresh, graduatesRequestKey])
  const graduatesReady = !gradesAvailable || graduatesLoadedKey === graduatesRequestKey
  const years = useMemo(() => [...new Set([...Array.from({ length: 10 }, (_, i) => currentYear - i), ...(data?.summary?.map(r => r.year) ?? data?.facts.map(r => r.year) ?? [])])].sort((a, b) => a - b), [data])
  const gradRows = useMemo(() => data && graduatesReady ? matchingGraduates({ ...data, graduates }, filters) : [], [data, graduates, graduatesReady, filters])
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFromDay(''); setToDay('')
    if (key === 'term') setCompareTerm(Number(value))
    setFilters(f => ({ ...f, [key]: value, ...(key === 'entity' ? { faculty: '', department: '' } : key === 'faculty' ? { department: '' } : {}) }))
  }
  const reset = () => { setFilters({ ...initialFilters, year: years.at(-1) ?? 2026 }); setGradeRank(''); setGradeMode('faculty'); setFromDay(''); setToDay(''); setCompareYear(years.at(-2) ?? years.at(-1) ?? 2025); setCompareTerm(0); setYearFrom(Math.max(years[0] ?? 2022, (years.at(-1) ?? currentYear) - 1)); setYearTo(years.at(-1) ?? 2026) }
  const metricName = filters.metric === 'admitted' ? 'الطلبة المقبولون' : 'الطلبة المسجلون'
  const facultyName = (id: string) => data?.faculties.find(r => r.id === id)?.name ?? 'كلية غير محددة'
  const deptName = (id: string) => data?.departments.find(r => r.id === id)?.name ?? 'تخصص غير محدد'
  const accepted = data ? countFor(data, filters, 'admitted') : 0
  const registered = data ? countFor(data, filters, 'registered') : 0
  const current = data ? countFor(data, filters) : 0
  const previous = data ? countFor(data, { ...filters, year: filters.year - 1 }) : 0
  const change = previous ? (current - previous) / previous * 100 : null
  const availableFaculties = data?.faculties.filter(r => filters.entity === 'all' || r.entity === filters.entity) ?? []
  const availableDepartments = data?.departments.filter(r => (!filters.faculty || r.facultyId === filters.faculty) && availableFaculties.some(f => f.id === r.facultyId)) ?? []
  const facultyRows = data ? countGroups(data, filters, 'faculty').map(r => ({ ...r, name: facultyName(r.id) })).sort((a, b) => b.total - a.total) : []
  const departmentRows = data ? countGroups(data, filters, 'department').map(r => ({ ...r, name: deptName(r.id) })).sort((a, b) => b.total - a.total) : []
  const yearRows = years.filter(y => y >= yearFrom && y <= yearTo && (!partial || data?.summary?.some(r => r.year === y))).map(year => ({ year: String(year), total: data ? countFor(data, { ...filters, year }) : 0 }))
  const termRows = [1, 2, 3].map(term => ({ id: String(term), name: terms[term], total: data ? countFor(data, { ...filters, term }) : 0 }))
  const gradeRows = ranks.map((rank, i) => ({ id: rank, name: rank, total: uniqueCount(gradRows.filter(r => r.rank === rank)), color: colors[i] })).filter(r => r.total)
  const daysReady = !data?.summary || (!daysLoading && (daysLoadedKey === daysRequestKey || Boolean(daysError)))
  const activeDays = daysLoadedKey === daysRequestKey ? registeredDays : []
  const dailyTimeline = data ? timelineFor(data, filters, filters.year, filters.term, '', '', activeDays) : { rows: [], undated: 0 }
  const daily = dailyTimeline.rows
  const registrationDates = [...new Set(daily.filter(day => day.count > 0).map(day => day.date))].sort()
  const dateLabel = (date: string) => registrationDayFormatter.format(new Date(`${date}T12:00:00Z`))
  const shiftedDate = (date: string) => date ? `${Number(date.slice(0, 4)) + compareYear - filters.year}${date.slice(4)}` : ''
  const compareFilters = { ...filters, year: compareYear, term: compareTerm }
  const compareCount = data ? countFor(data, compareFilters) : 0
  const compareByDept = data ? countGroups(data, compareFilters, 'department') : []
  const compareTable = [...new Set([...departmentRows.map(r => r.id), ...compareByDept.map(r => r.id)])].map(id => ({ id, name: deptName(id), a: departmentRows.find(r => r.id === id)?.total ?? 0, b: compareByDept.find(r => r.id === id)?.total ?? 0 })).sort((a, b) => b.a - a.a)
  const invalidRange = Boolean(fromDay && toDay && fromDay > toDay)
  const historyATimeline = data && !invalidRange ? timelineFor(data, filters, filters.year, filters.term, fromDay, toDay, activeDays) : { rows: [], undated: 0 }
  const historyBTimeline = data && !invalidRange ? timelineFor(data, filters, compareYear, compareTerm, shiftedDate(fromDay), shiftedDate(toDay), activeDays) : { rows: [], undated: 0 }
  const historyA = historyATimeline.rows, historyB = historyBTimeline.rows
  const sumA = historyA.reduce((s, r) => s + r.count, 0), sumB = historyB.reduce((s, r) => s + r.count, 0)
  const historyAUnavailable = !historyA.length && historyATimeline.undated > 0
  const historyBUnavailable = !historyB.length && historyBTimeline.undated > 0
  const monthMap = new Map<string, number>()
  daily.forEach(r => { const month = r.date.slice(5, 7); monthMap.set(month, (monthMap.get(month) ?? 0) + r.count) })
  const months = [...monthMap].sort().map(([id, total]) => ({ id, name: new Intl.DateTimeFormat('ar-JO', { month: 'long', timeZone: 'UTC' }).format(new Date(`2026-${id}-01T00:00:00Z`)), total }))
  const rankedGraduates = groupCount(gradeRank ? gradRows.filter(r => r.rank === gradeRank) : gradRows, r => gradeMode === 'faculty' ? r.facultyId : r.departmentId).map(r => ({ ...r, name: gradeMode === 'faculty' ? facultyName(r.id) : deptName(r.id) })).sort((a, b) => b.total - a.total)
  return <div className={`registration-app${dark ? ' reg-dark' : ''}${displayMode ? ' reg-display-mode' : ''}${wideLayout ? ' reg-virtual-wide' : ''}`} dir="rtl" style={{ zoom: scale, minHeight: `${100 / scale}vh` }}>
    <header className="reg-header"><div className="reg-container reg-header-inner"><div className="reg-brand"><img src={logo} alt="شعار جامعة الزرقاء" /><div><p>جامعة الزرقاء · نظام المؤشرات</p><h1>لوحة القبول والتسجيل</h1></div></div><div className="reg-header-actions"><button type="button" onClick={() => setDisplayMode(value => !value)} aria-label={displayMode ? "إيقاف وضع الشاشة" : "تشغيل وضع الشاشة"} title={displayMode ? "إيقاف وضع الشاشة" : "تشغيل وضع الشاشة"} aria-pressed={displayMode}><Monitor size={18} /></button><a className="reg-home-link" href={dashboardHref("home")} aria-label="الصفحة الرئيسية"><House size={18} /></a><span className="reg-live"><i />{updated ? `آخر تحديث ${updated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Amman' })}` : 'تحميل البيانات'}</span><button type="button" onClick={() => setRefresh(r => r + 1)} disabled={loading} aria-label="تحديث بيانات التسجيل"><RefreshCw size={18} className={loading ? 'spin' : ''} /></button><button type="button" onClick={() => setDark(d => !d)} aria-label="تبديل نمط العرض">{dark ? <Sun size={18} /> : <Moon size={18} />}</button></div></div></header>
    <main className="reg-container reg-main" aria-busy={loading}>
      <section className="reg-filters" aria-label="تصفية التسجيل"><div className="reg-filters-heading"><div><h2>تصفية البيانات</h2><p>اختر الفترة والجهة لاستكشاف مؤشرات القبول والتسجيل</p></div><button type="button" className="reg-reset" onClick={reset}><RotateCcw size={15} />إعادة تعيين</button></div><div className="reg-filter-grid">
        <Select label="الجهة" value={filters.entity} onChange={v => set('entity', v as Filters['entity'])}><option value="all">كل الجهات</option><option value="university" disabled={!data?.faculties.some(f => f.entity === 'university')}>الجامعة</option><option value="technical" disabled={!data?.faculties.some(f => f.entity === 'technical')}>الكلية التقنية</option></Select>
        <Select label="السنة الدراسية" value={filters.year} onChange={v => set('year', Number(v))}>{years.map(y => <option key={y} value={y}>{y}</option>)}</Select>
        <Select label="الفصل الدراسي" value={filters.term} onChange={v => set('term', Number(v))}>{terms.map((t, i) => <option key={t} value={i}>{t}</option>)}</Select>
        <Select label="الكلية" value={filters.faculty} onChange={v => set('faculty', v)}><option value="">كل الكليات</option>{availableFaculties.map(f => <option key={f.id} value={f.id}>{f.name}{filters.entity === 'all' && f.entity === 'technical' ? ' · التقنية' : ''}</option>)}</Select>
        <Select label="التخصص / القسم" value={filters.department} onChange={v => set('department', v)}><option value="">كل التخصصات</option>{availableDepartments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
        <div className="reg-field"><span>المقياس</span><div className="reg-segment"><button type="button" aria-pressed={filters.metric === 'admitted'} onClick={() => set('metric', 'admitted')}>الطلبة المقبولون</button><button type="button" aria-pressed={filters.metric === 'registered'} onClick={() => set('metric', 'registered')}>الطلبة المسجلون</button></div></div>
      </div></section>
      {loading && <div className="reg-status" role="status"><RefreshCw size={16} className="spin" />{progress.pages > 0 && <b>{fmt(progress.rows)} سجل · </b>}جارٍ تحميل بيانات التسجيل…</div>}
      {daysError && <div className="reg-error" role="alert">{daysError}</div>}{error && <div className="reg-error" role="alert">{error}{data && ' — المعروض آخر بيانات تم تحميلها بنجاح.'}<button type="button" onClick={() => setRefresh(r => r + 1)} disabled={loading}>إعادة المحاولة</button></div>}
      {data?.source === 'demo' && <div className="reg-demo" role="status"><span><i />وضع المعاينة · بيانات تجريبية</span><small>الأرقام للتجربة ولا تمثل سجلات الجامعة الفعلية.</small></div>}
      <div className="reg-chips">{filters.term !== 0 && <button type="button" onClick={() => set('term', 0)}>{terms[filters.term]}<X size={13} /></button>}{filters.faculty && <button type="button" onClick={() => set('faculty', '')}>{facultyName(filters.faculty)}<X size={13} /></button>}{filters.department && <button type="button" onClick={() => set('department', '')}>{deptName(filters.department)}<X size={13} /></button>}</div>
      {data && loadedKey === requestKey && <><section className="reg-kpis" aria-label="مؤشرات التسجيل">{[
        { label: 'الطلبة المقبولون', count: fmt(accepted), icon: <Users size={21} />, color: colors[0], hint: `طلاب جدد لديهم تسجيل · ${filters.year} · ${terms[filters.term]}` },
        { label: 'الطلبة المسجلون', count: fmt(registered), icon: <BookOpen size={21} />, color: colors[1], hint: 'طلاب جدد وقدامى' },
        { label: `التغير السنوي · ${metricName}`, count: partial ? '…' : change === null ? '—' : `${change > 0 ? '+' : ''}${change.toFixed(1)}%`, icon: <TrendingUp size={21} />, color: colors[2], hint: partial ? 'جارٍ تحميل سنة المقارنة' : previous ? `مقارنة مع ${filters.year - 1} · نفس الفلاتر` : 'لا توجد قاعدة مقارنة للسنة السابقة' },
        { label: 'الطلبة الخريجون', count: graduatesError ? '—' : !graduatesReady ? '…' : data.gradesAvailable ? fmt(uniqueCount(gradRows)) : '—', icon: <GraduationCap size={21} />, color: colors[3], hint: graduatesError ? 'تعذر تحميل بيانات الخريجين' : !graduatesReady ? 'جارٍ تحميل بيانات الخريجين' : data.gradesAvailable ? 'حسب سنة وفصل التخرج' : 'بيانات التخرج غير متاحة بعد' },
      ].map(k => <article key={k.label} className="reg-kpi" style={{ '--kpi-color': k.color } as CSSProperties}><div><span>{k.label}</span><i>{k.icon}</i></div><strong dir="ltr">{k.count}</strong><small>{k.hint}</small></article>)}</section>
      <div className="reg-tabs" role="tablist" aria-label="أقسام التسجيل">{[['overview', 'نظرة عامة'], ['comparison', 'القبول والمقارنة'], ['grades', 'التقدير والتخصصات']].map(([id, label]) => <button type="button" key={id} id={`tab-${id}`} role="tab" aria-selected={view === id} aria-controls={`panel-${id}`} tabIndex={view === id ? 0 : -1} onKeyDown={e => {
        const ids = ['overview', 'comparison', 'grades']
        const currentIndex = ids.indexOf(id)
        const nextIndex = e.key === 'ArrowLeft' ? (currentIndex + 1) % 3 : e.key === 'ArrowRight' ? (currentIndex + 2) % 3 : e.key === 'Home' ? 0 : e.key === 'End' ? 2 : -1
        if (nextIndex < 0) return
        e.preventDefault(); setView(ids[nextIndex]); document.getElementById(`tab-${ids[nextIndex]}`)?.focus()
      }} onClick={() => setView(id)}>{label}</button>)}</div>
      <div role="tabpanel" id={`panel-${view}`} aria-labelledby={`tab-${view}`}>
      {partial && view !== 'overview' && <div className="reg-status" role="status"><RefreshCw size={16} className="spin" />جارٍ تحميل سنة المقارنة…</div>}
      {view === 'grades' && graduatesError && <div className="reg-error" role="alert">{graduatesError}<button type="button" onClick={() => setRefresh(r => r + 1)} disabled={loading}>إعادة المحاولة</button></div>}
      {view === 'grades' && !graduatesReady && !graduatesError && <div className="reg-status" role="status"><RefreshCw size={16} className="spin" />جارٍ تحميل بيانات الخريجين للسنة المختارة…</div>}
      {view === 'overview' && <div className="reg-grid reg-overview-grid">
        <div className="reg-overview-column reg-span-7">
          <Card title={`${metricName} حسب السنة`} description="اضغط على سنة لتحديث بقية المؤشرات" action={<div className="reg-year-range"><Select label="من سنة" value={yearFrom} onChange={v => { setYearFrom(+v); if (+v > yearTo) setYearTo(+v) }}>{years.map(y => <option key={y}>{y}</option>)}</Select><Select label="إلى سنة" value={yearTo} onChange={v => { setYearTo(+v); if (+v < yearFrom) setYearFrom(+v) }}>{years.map(y => <option key={y}>{y}</option>)}</Select></div>}><Ranking rows={yearRows.map(r => ({ id: r.year, name: r.year, total: r.total }))} onSelect={id => set('year', +id)} selected={String(filters.year)} /></Card>
          <Card title={`${metricName} حسب الكلية`} description="طلاب؛ اضغط على الكلية لعرض تخصصاتها وتحديث اللوحة"><div className="reg-columns"><Ranking rows={facultyRows} onSelect={id => set('faculty', filters.faculty === id ? '' : id)} selected={filters.faculty} color={colors[1]} /></div></Card>
        </div>
        <div className="reg-overview-column reg-span-5">
          <Card title="حسب الفصل الدراسي" description="اضغط على الفصل لتصفيته"><Donut rows={termRows} onSelect={v => set('term', +v === filters.term ? 0 : +v)} selected={String(filters.term)} unit="طالب / فصل" /></Card>
          <Card title={filters.faculty ? `تخصصات ${facultyName(filters.faculty)}` : `أعلى 8 تخصصات · ${metricName}`} description="اضغط على التخصص لتصفية اللوحة"><Ranking rows={filters.faculty ? departmentRows : departmentRows.slice(0, 8)} onSelect={id => set('department', filters.department === id ? '' : id)} selected={filters.department} color={colors[2]} /></Card>
        </div>
      </div>}
      {view === 'comparison' && !partial && <div className="reg-grid"><Card title={filters.metric === 'admitted' ? 'الطلبة المقبولون حسب الشهر' : 'الطلبة المسجلون حسب الشهر'} description={filters.metric === 'admitted' ? `حسب أول تاريخ تسجيل · ${filters.year}` : `حسب أول تاريخ تسجيل متاح · ${filters.year}`} className="reg-span-4">{!daysReady ? <div className="reg-status" role="status">جارٍ تحميل البيانات اليومية…</div> : !months.length && dailyTimeline.undated ? <Empty>لا توجد تسجيلات مؤرخة ضمن الفترة المختارة.</Empty> : <Donut rows={months} />}{dailyTimeline.undated > 0 && <p className="reg-note" role="status">{fmt(dailyTimeline.undated)} {'طالباً بلا تاريخ تسجيل'}؛ لا يظهرون في الرسم.</p>}</Card><Card title={filters.metric === 'admitted' ? 'مقارنة الطلبة المقبولين بين فترتين' : 'مقارنة الطلبة المسجلين بين فترتين'} description={filters.metric === 'admitted' ? 'طلاب جدد حسب أول تاريخ تسجيل؛ تتأثر بفلاتر الجهة والكلية والتخصص' : 'طلاب حسب أول تاريخ تسجيل؛ تتأثر بفلاتر الجهة والكلية والتخصص'} className="reg-span-8"><div className="reg-compare-fields"><div className="reg-period-label"><i />الفترة أ: {filters.year} · {terms[filters.term]}</div><Select label="الفترة ب · السنة" value={compareYear} onChange={v => setCompareYear(+v)}>{years.map(y => <option key={y}>{y}</option>)}</Select><Select label="الفترة ب · الفصل" value={compareTerm} onChange={v => setCompareTerm(+v)}>{terms.map((t, i) => <option key={t} value={i}>{t}</option>)}</Select><Select label="من تاريخ في الفترة أ" value={fromDay} onChange={setFromDay} disabled={!registrationDates.length}><option value="">أول تاريخ متاح</option>{registrationDates.map(date => <option key={date} value={date}>{dateLabel(date)}</option>)}</Select><Select label="إلى تاريخ في الفترة أ" value={toDay} onChange={setToDay} disabled={!registrationDates.length}><option value="">آخر تاريخ متاح</option>{registrationDates.map(date => <option key={date} value={date}>{dateLabel(date)}</option>)}</Select></div>{invalidRange ? <div className="reg-error" role="alert">تاريخ البداية يجب أن يسبق تاريخ النهاية.</div> : <><div className="reg-compare-totals"><span>الفترة أ <b>{historyAUnavailable ? '—' : fmt(sumA)}</b></span><span>الفترة ب <b>{historyBUnavailable ? '—' : fmt(sumB)}</b></span><span>الفرق <b dir="ltr">{historyAUnavailable || historyBUnavailable ? '—' : `${sumA - sumB > 0 ? '+' : ''}${fmt(sumA - sumB)}`}</b></span></div>{!daysReady ? <div className="reg-status" role="status">جارٍ تحميل البيانات اليومية…</div> : !historyA.length && historyATimeline.undated ? <Empty>لا توجد تسجيلات مؤرخة ضمن الفترة المختارة.</Empty> : <DailyChart key={`${filters.metric}-${filters.year}-${filters.term}-${compareYear}-${compareTerm}-${filters.entity}-${filters.faculty}-${filters.department}-${fromDay}-${toDay}`} rows={historyA} previous={historyB} labelA={`${filters.year} · ${terms[filters.term]}`} labelB={`${compareYear} · ${terms[compareTerm]}`} />}{(historyATimeline.undated > 0 || historyBTimeline.undated > 0) && <p className="reg-note" role="status">{'طلاب بلا تاريخ تسجيل'}: {fmt(historyATimeline.undated)} في الفترة أ، {fmt(historyBTimeline.undated)} في الفترة ب؛ لا يظهرون في الرسم الزمني.</p>}</>}</Card><Card title={`مقارنة ${filters.metric === 'admitted' ? 'الطلبة المقبولين' : 'الطلبة المسجلين'} حسب التخصص`} description="للفترة الدراسية كاملة؛ تتأثر بفلاتر الجهة والكلية والتخصص، ولا تتأثر بنطاق الأيام أعلاه" className="reg-span-12"><div className="reg-table-scroll"><table><thead><tr><th>التخصص</th><th>{filters.year} · {terms[filters.term]}</th><th>{compareYear} · {terms[compareTerm]}</th><th>الفرق</th></tr></thead><tbody>{compareTable.map(r => <tr key={r.id}><td>{r.name}</td><td>{fmt(r.a)}</td><td>{fmt(r.b)}</td><td><span className={`reg-difference ${r.a >= r.b ? 'positive' : 'negative'}`}>{r.a >= r.b ? <ArrowUp size={13} /> : <ArrowDown size={13} />}{fmt(Math.abs(r.a - r.b))}</span></td></tr>)}{!compareTable.length && <tr><td colSpan={4}>لا توجد بيانات للفترتين.</td></tr>}</tbody><tfoot><tr><th>الطلاب</th><td>{fmt(current)}</td><td>{fmt(compareCount)}</td><td dir="ltr">{fmt(current - compareCount)}</td></tr></tfoot></table></div></Card></div>}
      {view === 'grades' && graduatesReady && <div className="reg-grid"><Card title={`توزيع التقدير حسب ${gradeMode === 'faculty' ? 'الكلية' : 'التخصص'}`} description="اضغط على الجزء الملون لتحديد التقدير، أو على الاسم لعرض التخصصات" className="reg-span-8" action={<div className="reg-segment"><button type="button" aria-pressed={gradeMode === 'faculty'} onClick={() => setGradeMode('faculty')}>الكليات</button><button type="button" aria-pressed={gradeMode === 'department'} onClick={() => setGradeMode('department')}>التخصصات</button></div>}>{!data.gradesAvailable ? <Empty>بيانات التخرج غير متاحة بعد.</Empty> : !rankedGraduates.length ? <Empty /> : <><div className="reg-grade-filter-legend">{gradeRows.map((row, index) => <button key={row.id} type="button" aria-pressed={gradeRank === row.id} onClick={() => setGradeRank(gradeRank === row.id ? '': row.id)}><i style={{ background: colors[index] }} aria-hidden="true" /><span>{row.name}</span><b dir="ltr">{fmt(row.total)}</b></button>)}</div><div className="reg-grade-list">{rankedGraduates.map(r => {
        const group = gradRows.filter(g => (gradeMode === 'faculty' ? g.facultyId : g.departmentId) === r.id)
        const values = ranks.map(rank => ({ rank, count: uniqueCount(group.filter(g => g.rank === rank)) }))
        const total = values.reduce((s, v) => s + v.count, 0)
        return <div key={r.id} className="reg-grade-row"><button type="button" className="reg-grade-name" onClick={() => { if (gradeMode === 'faculty') { set('faculty', r.id); setGradeMode('department') } else set('department', filters.department === r.id ? '' : r.id) }}>{r.name}</button><div className="reg-stacked">{values.map((v, i) => v.count > 0 && <button key={v.rank} aria-label={`${r.name} · ${v.rank}: ${fmt(v.count)}`} aria-pressed={gradeRank === v.rank} onClick={() => setGradeRank(gradeRank === v.rank ? '' : v.rank)} style={{ flexGrow: v.count, background: colors[i], opacity: gradeRank && gradeRank !== v.rank ? 0.2 : 1 }} />)}</div><span className="reg-grade-total"><small>{gradeRank || 'المجموع'}</small><b dir="ltr">{fmt(gradeRank ? values.find(v => v.rank === gradeRank)?.count ?? 0 : total)}</b></span></div>
      })}</div></>}</Card><Card title="توزيع التقدير" description="طلاب خريجون" className="reg-span-4">{data.gradesAvailable ? <><Donut rows={gradeRows} onSelect={v => setGradeRank(gradeRank === v ? '' : v)} selected={gradeRank} unit="خريج" />{gradeRank && <button type="button" className="reg-reset" onClick={() => setGradeRank('')}>إلغاء تصفية {gradeRank}<X size={13} /></button>}</> : <Empty>سيظهر التوزيع عند توفر البيانات.</Empty>}</Card></div>}
      </div><footer className="reg-footer"><span>جامعة الزرقاء · مؤشرات القبول والتسجيل</span><span>{data.source === 'demo' ? 'معاينة تجريبية' : 'تحديث تلقائي كل 5 دقائق'} · الأعداد حسب الطلاب</span></footer></>}
    </main>
  </div>
}

