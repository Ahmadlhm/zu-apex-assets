import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Building2,
  CalendarDays,
  Clock3,
  House,
  Monitor,
  Moon,
  RefreshCw,
  RotateCcw,
  Sun,
  Users,
  X,
} from 'lucide-react'
import universityLogo from '../logo/zarqa_logo.png'
import { dashboardHref } from './navigation'
import { useDisplayMode } from './displayMode'
import {
  canonicalCenterName,
  isBuildingCenter,
  isCircleOrCenter,
  isCollegeCenter,
  isHighlightedOtherCenter,
} from './data/centerMapping'
import { getDashboardPresenceSnapshot, getDashboardTransactions } from './services/dashboardApi'
import { buildPresenceTimeline, transactionHourKey, type HourlyPoint } from './data/presenceTimeline'
import { deduplicateTransactions, isMovementVisible } from './data/movementFilters'
import {
  CATEGORY_LABELS,
  DIRECTION_LABELS,
  GENDER_LABELS,
  type DashboardFilters,
  type PersonCategory,
  type Transaction,
} from './types/dashboard'

const pad = (value: number) => String(value).padStart(2, '0')
const today = () => {
  const value = new Date()
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
}

const defaultFilters = (): DashboardFilters => ({
  dateFrom: today(),
  dateTo: today(),
  timeFrom: '00:00',
  timeTo: '23:59',
  direction: 'ALL',
  gender: 'ALL',
  categories: [],
  gate: 'ALL',
  center: 'ALL',
  department: 'ALL',
  hour: 'ALL',
})

const formatNumber = (value: number) => new Intl.NumberFormat('en-US').format(value)
const formatDate = (value: string) =>
  new Intl.DateTimeFormat('ar-JO-u-nu-latn', { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(`${value}T12:00:00`),
  )

interface CenterDataItem {
  label: string
  total: number
  selectable?: boolean
  kind?: 'center' | 'department' | 'group'
  groupKey?: 'buildings' | 'other'
}

const groupCenters = (rows: Transaction[]): CenterDataItem[] => {
  const peopleByCenter = new Map<string, Set<string>>()
  rows.forEach((row) => {
    const label = canonicalCenterName(row.center)
    const people = peopleByCenter.get(label) ?? new Set<string>()
    people.add(row.employeeId)
    peopleByCenter.set(label, people)
  })
  return [...peopleByCenter]
    .map(([label, people]) => ({ label, total: people.size, kind: 'center' as const }))
    .sort((a, b) => b.total - a.total)
}

const groupDepartments = (rows: Transaction[]): CenterDataItem[] => {
  const peopleByDepartment = new Map<string, Set<string>>()
  rows.forEach((row) => {
    const label = row.department?.trim() || 'غير محدد'
    const people = peopleByDepartment.get(label) ?? new Set<string>()
    people.add(row.employeeId)
    peopleByDepartment.set(label, people)
  })
  return [...peopleByDepartment]
    .map(([label, people]) => ({ label, total: people.size, kind: 'department' as const }))
    .sort((a, b) => b.total - a.total)
}

const isPresenceVisible = (row: Transaction, filters: DashboardFilters) => (
  (filters.gender === 'ALL' || row.gender === filters.gender) &&
  (filters.gate === 'ALL' || row.gate === filters.gate) &&
  (filters.center === 'ALL' || row.center === filters.center) &&
  (filters.department === 'ALL' || row.department === filters.department) &&
  (filters.hour === 'ALL' || transactionHourKey(row) === filters.hour)
)

const presenceAsOf = (dateTo: string, timeTo: string) => {
  const now = new Date()
  const currentDate = today()
  const nextMinute = new Date(now)
  nextMinute.setMinutes(now.getMinutes() + 1, 0, 0)
  const currentTime = nextMinute.getDate() === now.getDate()
    ? `${pad(nextMinute.getHours())}:${pad(nextMinute.getMinutes())}`
    : '23:59'
  return dateTo > currentDate
    ? { date: currentDate, time: currentTime }
    : { date: dateTo, time: dateTo === currentDate && timeTo > currentTime ? currentTime : timeTo }
}

interface DateTimeFieldProps {
  label: string
  type: 'date' | 'time'
  value: string
  onChange: (value: string) => void
}

function DateTimeField({ label, type, value, onChange }: DateTimeFieldProps) {
  return (
    <label className="filter-field">
      <span>{label}</span>
      <div className="input-wrap">
        {type === 'date' ? <CalendarDays size={15} /> : <Clock3 size={15} />}
        <input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
      </div>
    </label>
  )
}

interface PresenceCardProps {
  rows: Transaction[] | null
  categoryTotals: Record<PersonCategory, number>
  activeCategories: PersonCategory[]
  onCategoryToggle: (category: PersonCategory) => void
  loading: boolean
  error: string
}

function PresenceCard({ rows, categoryTotals, activeCategories, onCategoryToggle, loading, error }: PresenceCardProps) {
  const categories: Transaction['category'][] = ['student', 'admin', 'faculty', 'other']
  return (
    <article className="presence-card">
      <div className="metric-top">
        <span>العدد الإجمالي داخل الجامعة</span>
        <span className="metric-icon"><Users size={19} /></span>
      </div>
      <strong>{rows === null ? '—' : formatNumber(rows.length)}</strong>
      <small className="presence-hint">{error || (loading ? 'جارٍ احتساب الموجودين...' : 'حسب آخر حركة خلال 24 ساعة حتى نهاية الفترة')}</small>
      <div className="people-breakdown">
        {categories.map((category) => (
          <button
            type="button"
            className={`presence-category${activeCategories.includes(category) ? ' active' : ''}`}
            key={category}
            aria-pressed={activeCategories.includes(category)}
            onClick={() => onCategoryToggle(category)}
          >
            <span>{CATEGORY_LABELS[category]}</span>
            <b>{rows === null ? '—' : formatNumber(categoryTotals[category])}</b>
          </button>
        ))}
      </div>
    </article>
  )
}

interface MovementCardProps {
  total: number
  entries: number
  exits: number
}

function MovementCard({ total, entries, exits }: MovementCardProps) {
  return (
    <article className="movement-summary-card">
      <div className="metric-top">
        <span>إجمالي الحركات</span>
        <span className="metric-icon"><Building2 size={19} /></span>
      </div>
      <strong>{formatNumber(total)}</strong>
      <div className="movement-breakdown">
        <div><span><ArrowDownToLine size={15} /> عدد الدخول</span><b>{formatNumber(entries)}</b></div>
        <div><span><ArrowUpFromLine size={15} /> عدد الخروج</span><b>{formatNumber(exits)}</b></div>
      </div>
    </article>
  )
}

interface ChartCardProps {
  title: string
  subtitle: string
  children: React.ReactNode
  className?: string
  headerAction?: React.ReactNode
}

function ChartCard({ title, subtitle, children, className = '', headerAction }: ChartCardProps) {
  return (
    <article className={`chart-card ${className}`}>
      <header>
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        {headerAction}
      </header>
      {children}
    </article>
  )
}

interface CenterChartProps {
  title: string
  subtitle: string
  emptyMessage?: string
  data: CenterDataItem[]
  mode: 'centers' | 'departments' | 'group'
  selectedCenter: string
  selectedDepartment: string
  accent: string
  onCenterSelect: (center: string) => void
  onDepartmentSelect: (department: string) => void
  onGroupSelect: (groupKey: 'buildings' | 'other') => void
  onBack: () => void
  animationCycle: number
}

function TouchBarList({
  rows,
  color,
  selectedLabel,
  onSelect,
  animationCycle,
}: {
  rows: Array<{ label: string; total: number; selectable?: boolean }>
  color: string
  selectedLabel?: string
  onSelect: (index: number) => void
  animationCycle: number
}) {
  const max = Math.max(1, ...rows.map((row) => row.total))
  return <div className="touch-bar-list">{rows.map((row, index) => {
    const content = <>
      <span className="touch-bar-name">{row.label}</span>
      <span className="touch-bar-track"><span key={animationCycle} className="touch-bar-fill" style={{ width: `${(row.total / max) * 100}%`, background: selectedLabel === row.label ? 'var(--chart-red)' : color, animationDelay: `${Math.min(index, 8) * 30}ms` }} /></span>
      <b className="touch-bar-value" dir="ltr">{formatNumber(row.total)}</b>
    </>
    return row.selectable === false
      ? <div className="touch-bar-row" key={row.label}>{content}</div>
      : <button type="button" className="touch-bar-row" key={row.label} aria-pressed={selectedLabel === row.label} aria-label={`${row.label}: ${formatNumber(row.total)} شخص`} onClick={() => onSelect(index)}>{content}</button>
  })}</div>
}

function CenterChart({
  title,
  subtitle,
  emptyMessage,
  data,
  mode,
  selectedCenter,
  selectedDepartment,
  accent,
  onCenterSelect,
  onDepartmentSelect,
  onGroupSelect,
  onBack,
  animationCycle,
}: CenterChartProps) {
  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      headerAction={mode !== 'centers' || selectedCenter !== 'ALL' ? (
        <button type="button" className="reset-button" onClick={onBack}>
          <RotateCcw size={14} /> العودة
        </button>
      ) : undefined}
    >
      {data.length ? <TouchBarList rows={data} color={accent} selectedLabel={mode === 'departments' ? selectedDepartment : selectedCenter} animationCycle={animationCycle} onSelect={(index) => {
        const item = data[index]
        if (item.kind === 'group' && item.groupKey) onGroupSelect(item.groupKey)
        else if (mode === 'departments') onDepartmentSelect(item.label)
        else onCenterSelect(item.label)
      }} /> : <EmptyState message={emptyMessage} />}
    </ChartCard>
  )
}

function EmptyState({ message = 'لا توجد بيانات مطابقة للفلاتر الحالية' }: { message?: string }) {
  return <div className="empty-state">{message}</div>
}

function HourlyLine({ rows, selected, onSelect }: {
  rows: HourlyPoint[]
  selected: string
  onSelect: (key: string) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const plotRef = useRef<SVGSVGElement>(null)
  const [plotWidth, setPlotWidth] = useState(600)
  const [plotHeight, setPlotHeight] = useState(244)
  const lastKey = rows.at(-1)?.key
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    const updateWidth = () => setPlotWidth(Math.max(360, container.clientWidth))
    updateWidth()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(updateWidth)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const plot = plotRef.current
    if (!plot) return
    const updateHeight = () => setPlotHeight(Math.max(100, Math.round(plot.getBoundingClientRect().height)))
    updateHeight()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(updateHeight)
    observer.observe(plot)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.clientWidth - scrollRef.current.scrollWidth
    }
  }, [lastKey])
  const width = plotWidth
  const left = 28
  const right = width - 28
  const top = Math.max(28, Math.min(40, Math.round(plotHeight * .16)))
  const bottom = plotHeight - 18
  const max = Math.max(1, ...rows.map((row) => row.count))
  const x = (index: number) => right - (index * (right - left)) / Math.max(1, rows.length - 1)
  const y = (count: number) => bottom - (count / max) * (bottom - top)
  const points = rows.map((row, index) => ({ x: x(index), y: y(row.count) }))
  const path = points.reduce((result, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`
    const previous = points[index - 1]
    const middle = (previous.x + point.x) / 2
    return `${result} C ${middle} ${previous.y}, ${middle} ${point.y}, ${point.x} ${point.y}`
  }, '')
  return <div className="hour-line-scroll" dir="rtl" ref={scrollRef}><div className="hour-line-content" style={{ width }}>
    <svg ref={plotRef} className="hour-line-plot" viewBox={`0 0 ${width} ${plotHeight}`} preserveAspectRatio="none" aria-hidden="true">
      {[top, (top + bottom) / 2, bottom].map((level) => <line key={level} x1={left} x2={right} y1={level} y2={level} className="hour-line-grid" />)}
      <path d={path} className="hour-line-path" />
      {rows.map((row, index) => <g key={row.key}>
        <circle cx={x(index)} cy={y(row.count)} r={selected === row.key ? 7 : 4} className={selected === row.key ? 'hour-line-dot selected' : 'hour-line-dot'} />
        {row.count > 0 && <text x={x(index)} y={Math.max(18, y(row.count) - (index % 2 ? 21 : 13))} className="hour-line-value">{formatNumber(row.count)}</text>}
        <rect x={x(index) - 23} y={top - 18} width={46} height={bottom - top + 36} fill="transparent" className="hour-line-hit" onClick={() => onSelect(row.key)} />
      </g>)}
    </svg>
    <div className="hour-line-labels" style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }}>
      {rows.map((row) => <button type="button" key={row.key} aria-pressed={selected === row.key} aria-label={`${row.date} ${row.hour}:00: ${formatNumber(row.count)} شخص`} onClick={() => onSelect(row.key)}>
        <span dir="ltr">{row.hour}</span>
      </button>)}
    </div>
  </div></div>
}

export default function App() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [filters, setFilters] = useState<DashboardFilters>(() => {
    const defaults = defaultFilters()
    const date = new URLSearchParams(window.location.search).get('date')
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return defaults
    const timestamp = Date.parse(`${date}T00:00:00Z`)
    return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === date
      ? { ...defaults, dateFrom: date, dateTo: date }
      : defaults
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [presenceSnapshot, setPresenceSnapshot] = useState<Transaction[] | null>(null)
  const [presenceAt, setPresenceAt] = useState<{ date: string; time: string } | null>(null)
  const [presenceLoading, setPresenceLoading] = useState(true)
  const [presenceError, setPresenceError] = useState('')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [barAnimationCycle, setBarAnimationCycle] = useState(0)
  const [dark, setDark] = useState(() => localStorage.getItem('zug-theme') === 'dark')
  const { displayMode, setDisplayMode, scale, wideLayout } = useDisplayMode()
  const [otherGroup, setOtherGroup] = useState<'NONE' | 'buildings' | 'other'>('NONE')
  const activeRequest = useRef<AbortController | null>(null)
  const activePresenceRequest = useRef<AbortController | null>(null)
  const pulseResults = useCallback(() => {
    setBarAnimationCycle((cycle) => cycle + 1)
  }, [])

  const changeFilters: typeof setFilters = setFilters

  const loadData = useCallback(async (dateFrom: string, dateTo: string, refresh = false) => {
    activeRequest.current?.abort()
    const controller = new AbortController()
    activeRequest.current = controller
    setLoading(true)
    setError('')
    try {
      const rows = await getDashboardTransactions({ dateFrom, dateTo }, controller.signal, refresh)
      if (controller.signal.aborted) return
      setTransactions(rows)
      setLastUpdated(new Date())
      pulseResults()
    } catch (error) {
      if (controller.signal.aborted) return
      setError(error instanceof Error && /^(اختر|تاريخ|الحد الأقصى)/.test(error.message)
        ? error.message
        : 'تعذر تحميل البيانات. تحقق من اتصال ORDS وحاول مرة أخرى.')
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null
        setLoading(false)
      }
    }
  }, [pulseResults])

  const loadPresence = useCallback(async (dateTo: string, timeTo: string) => {
    activePresenceRequest.current?.abort()
    const controller = new AbortController()
    activePresenceRequest.current = controller
    setPresenceLoading(true)
    setPresenceError('')
    setPresenceSnapshot(null)
    setPresenceAt(null)
    try {
      const asOf = presenceAsOf(dateTo, timeTo)
      const rows = await getDashboardPresenceSnapshot(asOf.date, asOf.time, 24, controller.signal)
      if (!controller.signal.aborted) {
        setPresenceSnapshot(rows)
        setPresenceAt(asOf)
        pulseResults()
      }
    } catch {
      if (!controller.signal.aborted) setPresenceError('تعذر احتساب الموجودين. تحقق من خدمة ORDS الخاصة بالموجودين.')
    } finally {
      if (activePresenceRequest.current === controller) {
        activePresenceRequest.current = null
        setPresenceLoading(false)
      }
    }
  }, [pulseResults])

  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (active) void loadData(filters.dateFrom, filters.dateTo)
    })
    return () => {
      active = false
      activeRequest.current?.abort()
    }
  }, [filters.dateFrom, filters.dateTo, loadData])

  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (active) void loadPresence(filters.dateTo, filters.timeTo)
    })
    return () => {
      active = false
      activePresenceRequest.current?.abort()
    }
  }, [filters.dateTo, filters.timeTo, loadPresence])

  useEffect(() => {
    const refreshTimer = window.setInterval(() => {
      void loadData(filters.dateFrom, filters.dateTo)
      void loadPresence(filters.dateTo, filters.timeTo)
    }, 300_000)
    return () => window.clearInterval(refreshTimer)
  }, [filters.dateFrom, filters.dateTo, filters.timeTo, loadData, loadPresence])

  useEffect(() => {
    document.title = '\u0644\u0648\u062d\u0629 \u062d\u0631\u0643\u0629 \u0627\u0644\u0628\u0648\u0627\u0628\u0627\u062a | \u062c\u0627\u0645\u0639\u0629 \u0627\u0644\u0632\u0631\u0642\u0627\u0621'
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('zug-theme', dark ? 'dark' : 'light')
  }, [dark])

  const successfulTransactions = useMemo(
    () => deduplicateTransactions(transactions.filter((row) => row.eventId === 1)),
    [transactions],
  )
  const filtered = useMemo(
    () => successfulTransactions.filter((row) => isMovementVisible(row, filters)),
    [successfulTransactions, filters],
  )

  const presenceRows = useMemo(() => (presenceSnapshot ?? []).filter((row) => (
    isPresenceVisible(row, filters)
  )), [presenceSnapshot, filters])

  const currentPresence = useMemo(
    () => presenceRows.filter((row) => !filters.categories.length || filters.categories.includes(row.category)),
    [presenceRows, filters.categories],
  )

  const hourlyData = useMemo((): HourlyPoint[] => {
    if (!presenceAt) return []
    const rows = (presenceSnapshot ?? []).filter((row) => (
      isPresenceVisible(row, { ...filters, hour: 'ALL' }) &&
      (!filters.categories.length || filters.categories.includes(row.category))
    ))
    return buildPresenceTimeline(rows, presenceAt)
  }, [presenceAt, presenceSnapshot, filters])

  const gateData = useMemo(() => {
    const peopleByGate = new Map<string, Set<string>>()
    currentPresence.forEach((row) => {
      const people = peopleByGate.get(row.gate) ?? new Set<string>()
      people.add(row.employeeId)
      peopleByGate.set(row.gate, people)
    })
    return [...peopleByGate].map(([gate, people]) => ({ gate, total: people.size }))
      .sort((a, b) => b.total - a.total)
  }, [currentPresence])

  const centerRows = useMemo(() => (presenceSnapshot ?? []).filter((row) => (
    isPresenceVisible(row, { ...filters, department: 'ALL' }) &&
    (!filters.categories.length || filters.categories.includes(row.category))
  )), [presenceSnapshot, filters])

  const collegeDrilldown = filters.center !== 'ALL' && isCollegeCenter(filters.center)
  const otherDrilldown = filters.center !== 'ALL' && !isCollegeCenter(filters.center)

  const collegeData = useMemo(() => {
    if (otherGroup !== 'NONE') return []
    if (collegeDrilldown) {
      return groupDepartments(centerRows.filter((row) => row.center === filters.center))
    }
    return groupCenters(centerRows.filter((row) => isCollegeCenter(row.center)))
  }, [centerRows, collegeDrilldown, filters.center, otherGroup])

  const otherCenterData = useMemo(() => {
    if (otherDrilldown) {
      return groupDepartments(centerRows.filter((row) => row.center === filters.center))
    }
    if (otherGroup === 'buildings') {
      return groupCenters(centerRows.filter((row) => isBuildingCenter(row.center)))
    }
    if (otherGroup === 'other') {
      return groupCenters(centerRows.filter((row) => (
        !isCollegeCenter(row.center) &&
        !isCircleOrCenter(row.center) &&
        !isBuildingCenter(row.center) &&
        !isHighlightedOtherCenter(row.center)
      )))
    }
    const nonCollegeRows = centerRows.filter((row) => !isCollegeCenter(row.center))
    const circleData = groupCenters(nonCollegeRows.filter((row) => (
      isCircleOrCenter(row.center) && !isHighlightedOtherCenter(row.center)
    )))
    const highlightedData = groupCenters(nonCollegeRows.filter((row) => isHighlightedOtherCenter(row.center)))
    const buildingRows = nonCollegeRows.filter((row) => isBuildingCenter(row.center))
    const otherRows = nonCollegeRows.filter((row) => (
      !isCircleOrCenter(row.center) &&
      !isBuildingCenter(row.center) &&
      !isHighlightedOtherCenter(row.center)
    ))
    const groups: CenterDataItem[] = [...circleData, ...highlightedData]
    if (buildingRows.length) groups.push({ label: 'المباني', total: buildingRows.length, kind: 'group', groupKey: 'buildings' })
    if (otherRows.length) groups.push({ label: 'أخرى', total: otherRows.length, kind: 'group', groupKey: 'other' })
    return groups.sort((a, b) => b.total - a.total)
  }, [centerRows, filters.center, otherDrilldown, otherGroup])

  const presenceCategoryTotals = useMemo(() => ({
    student: presenceRows.filter((row) => row.category === 'student').length,
    admin: presenceRows.filter((row) => row.category === 'admin').length,
    faculty: presenceRows.filter((row) => row.category === 'faculty').length,
    other: presenceRows.filter((row) => row.category === 'other').length,
  }), [presenceRows])

  const activeFilterChips = useMemo(() => {
    const chips: { key: keyof DashboardFilters; label: string; category?: PersonCategory }[] = []
    if (filters.direction !== 'ALL') chips.push({ key: 'direction', label: DIRECTION_LABELS[filters.direction] })
    if (filters.gender !== 'ALL') chips.push({ key: 'gender', label: GENDER_LABELS[filters.gender] })
    filters.categories.forEach((category) => chips.push({ key: 'categories', label: CATEGORY_LABELS[category], category }))
    if (filters.gate !== 'ALL') chips.push({ key: 'gate', label: filters.gate })
    if (filters.center !== 'ALL') chips.push({ key: 'center', label: filters.center })
    if (filters.department !== 'ALL') chips.push({ key: 'department', label: filters.department })
    if (filters.hour !== 'ALL') chips.push({ key: 'hour', label: `${filters.hour.slice(0, 10)} · ${filters.hour.slice(11)}:00` })
    if (filters.timeFrom !== '00:00' || filters.timeTo !== '23:59') {
      chips.push({ key: 'timeFrom', label: `${filters.timeFrom} – ${filters.timeTo}` })
    }
    return chips
  }, [filters])

  const updateFilter = <K extends keyof DashboardFilters>(key: K, value: DashboardFilters[K]) => {
    if ((key === 'dateFrom' || key === 'dateTo') && filters[key] !== value) {
      setLoading(true)
      setError('')
    }
    changeFilters((current) => {
      const next = { ...current, [key]: value }
      if (key === 'center') next.department = 'ALL'
      return next
    })
  }

  const clearChip = (key: keyof DashboardFilters, category?: PersonCategory) => {
    changeFilters((current) => {
      const defaults = defaultFilters()
      if (key === 'categories' && category) {
        return { ...current, categories: current.categories.filter((item) => item !== category) }
      }
      if (key === 'timeFrom') return { ...current, timeFrom: defaults.timeFrom, timeTo: defaults.timeTo }
      return { ...current, [key]: defaults[key] }
    })
  }

  const toggleCategory = (category: PersonCategory) => {
    changeFilters((current) => ({
      ...current,
      categories: current.categories.includes(category)
        ? current.categories.filter((item) => item !== category)
        : [...current.categories, category],
    }))
  }

  const toggleGate = (gate: string) => {
    changeFilters((current) => {
      const isSameSelection = current.gate === gate
      return {
        ...current,
        gate: isSameSelection ? 'ALL' : gate,
      }
    })
  }

  const entryCount = filtered.filter((row) => row.direction === 'IN').length
  const exitCount = filtered.filter((row) => row.direction === 'OUT').length
  const lastRows = filtered.slice(0, 10)
  const presenceEmptyMessage = presenceLoading ? 'جارٍ احتساب الموجودين...' : presenceError || undefined

  return (
    <div className={`app-shell${displayMode ? ' gates-display-mode' : ''}${wideLayout ? ' gates-virtual-wide' : ''}`} style={{ zoom: scale, minHeight: `${100 / scale}vh` }}>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand-block">
            <div className="logo-frame"><img src={universityLogo} alt="شعار جامعة الزرقاء" /></div>
            <div>
              <p>جامعة الزرقاء</p>
              <h1>لوحة حركة البوابات</h1>
            </div>
          </div>
          <div className="header-actions">
            <button className="icon-button" type="button" onClick={() => setDisplayMode(value => !value)} aria-label={displayMode ? 'إيقاف وضع الشاشة' : 'تشغيل وضع الشاشة'} title={displayMode ? 'إيقاف وضع الشاشة' : 'تشغيل وضع الشاشة'} aria-pressed={displayMode}><Monitor size={18} /></button>
            <a className="icon-button" href={dashboardHref('home')} aria-label={'\u0627\u0644\u0635\u0641\u062d\u0629 \u0627\u0644\u0631\u0626\u064a\u0633\u064a\u0629'}><House size={18} /></a>
            <div className="live-status">
              <i />
              <span>{lastUpdated ? `آخر تحديث ${lastUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · تلقائي كل 5 دقائق` : 'جارٍ التحديث'}</span>
            </div>
            <button className="icon-button" type="button" onClick={() => {
              void loadData(filters.dateFrom, filters.dateTo, true)
              void loadPresence(filters.dateTo, filters.timeTo)
            }} aria-label="تحديث البيانات">
              <RefreshCw size={18} className={loading || presenceLoading ? 'spin' : ''} />
            </button>
            <button className="icon-button" type="button" onClick={() => setDark((value) => !value)} aria-label="تبديل نمط العرض">
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </div>
      </header>

      <main className="dashboard">
        <section className="filter-panel" aria-label="فلاتر اللوحة">
          <div className="filter-heading">
            <div>
              <h2>تصفية البيانات</h2>
              {loading ? (
                <p className="filter-loading" role="status" aria-live="polite">
                  <RefreshCw size={13} className="spin" /> جارٍ تحميل البيانات حسب الفترة المحددة...
                </p>
              ) : (
                <p>من تاريخ/وقت للحركات، وإلى تاريخ/وقت يحددان لحظة احتساب الموجودين</p>
              )}
            </div>
            <button type="button" className="reset-button" onClick={() => {
              setOtherGroup('NONE')
              const defaults = defaultFilters()
              if (filters.dateFrom !== defaults.dateFrom || filters.dateTo !== defaults.dateTo) {
                setLoading(true)
                setError('')
              }
              changeFilters(defaults)
            }}>
              <RotateCcw size={15} /> إعادة تعيين
            </button>
          </div>
          <div className="filter-grid">
            <DateTimeField label="من تاريخ" type="date" value={filters.dateFrom} onChange={(value) => updateFilter('dateFrom', value)} />
            <DateTimeField label="إلى تاريخ" type="date" value={filters.dateTo} onChange={(value) => updateFilter('dateTo', value)} />
            <DateTimeField label="من وقت" type="time" value={filters.timeFrom} onChange={(value) => updateFilter('timeFrom', value)} />
            <DateTimeField label="إلى وقت" type="time" value={filters.timeTo} onChange={(value) => updateFilter('timeTo', value)} />
          </div>
          {activeFilterChips.length > 0 && (
            <div className="active-filters">
              <span>الفلاتر النشطة</span>
              {activeFilterChips.map((chip) => (
                <button key={`${chip.key}-${chip.label}`} type="button" onClick={() => clearChip(chip.key, chip.category)}>
                  {chip.label}<X size={13} />
                </button>
              ))}
            </div>
          )}
        </section>

        {error && <div className="error-banner">{error}</div>}

        <section className="metrics-grid" aria-label="المؤشرات الرئيسية">
          <PresenceCard
            rows={presenceSnapshot === null ? null : currentPresence}
            categoryTotals={presenceCategoryTotals}
            activeCategories={filters.categories}
            onCategoryToggle={toggleCategory}
            loading={presenceLoading}
            error={presenceError}
          />
          <MovementCard
            total={filtered.length}
            entries={entryCount}
            exits={exitCount}
          />
        </section>

        <section className="dashboard-charts" aria-label="رسوم الموجودين عند نهاية الفترة">
          <div className="chart-column chart-column-hourly">
          <ChartCard title="الموجودون عند نهاية الفترة حسب ساعة الدخول" subtitle={`ساعات ${presenceAt ? `${formatDate(presenceAt.date)} حتى ${presenceAt.time}` : 'اليوم المختار'} فقط؛ اضغط على الوقت للتصفية`} className="wide-card">
            {presenceSnapshot?.length ? <HourlyLine rows={hourlyData} selected={filters.hour} onSelect={(key) => updateFilter('hour', filters.hour === key ? 'ALL' : key)} /> : <EmptyState message={presenceEmptyMessage} />}
          </ChartCard>
          <CenterChart
            animationCycle={barAnimationCycle}
            title={otherDrilldown ? `الموجودون عند نهاية الفترة حسب الأقسام داخل ${filters.center}` : otherGroup === 'buildings' ? 'الموجودون عند نهاية الفترة حسب المباني' : otherGroup === 'other' ? 'الموجودون عند نهاية الفترة ضمن أخرى' : 'الموجودون عند نهاية الفترة حسب الدوائر والمراكز'}
            emptyMessage={presenceError || (collegeDrilldown ? 'لا توجد دوائر أو مراكز ضمن الكلية المحددة؛ اضغط على العودة لإظهارها' : presenceEmptyMessage)}
            subtitle={otherDrilldown || otherGroup !== 'NONE' ? 'عدد الأشخاص الموجودين؛ اضغط على عنصر للتصفية' : 'عدد الأشخاص الموجودين؛ اضغط على دائرة أو مركز لعرض أقسامه'}
            data={otherCenterData}
            mode={otherDrilldown ? 'departments' : otherGroup !== 'NONE' ? 'group' : 'centers'}
            selectedCenter={filters.center}
            selectedDepartment={filters.department}
            accent="var(--chart-blue-strong)"
            onCenterSelect={(center) => {
              setOtherGroup('NONE')
              updateFilter('center', filters.center === center ? 'ALL' : center)
            }}
            onDepartmentSelect={(department) => updateFilter('department', filters.department === department ? 'ALL' : department)}
            onGroupSelect={() => undefined}
            onBack={() => {
              setOtherGroup('NONE')
              updateFilter('center', 'ALL')
            }}
          />
          </div>
          <div className="chart-column chart-column-gates">
          <ChartCard title="الموجودون عند نهاية الفترة حسب البوابة" subtitle="عدد الموجودين حسب بوابة آخر دخول؛ اضغط على العمود للتصفية">
            {gateData.length ? <TouchBarList rows={gateData.map((row) => ({ label: row.gate, total: row.total }))} color="var(--chart-gold)" selectedLabel={filters.gate} animationCycle={barAnimationCycle} onSelect={(index) => toggleGate(gateData[index].gate)} /> : <EmptyState message={presenceEmptyMessage} />}
          </ChartCard>
          <CenterChart
            animationCycle={barAnimationCycle}
            title={collegeDrilldown ? `الموجودون عند نهاية الفترة حسب الأقسام داخل ${filters.center}` : 'الموجودون عند نهاية الفترة حسب الكليات'}
            emptyMessage={presenceError || (otherDrilldown || otherGroup !== 'NONE' ? 'لا توجد كليات ضمن الجهة المحددة؛ اضغط على العودة لإظهارها' : presenceEmptyMessage)}
            subtitle={collegeDrilldown ? 'عدد الأشخاص الموجودين؛ اضغط على قسم للتصفية' : 'عدد الأشخاص الموجودين؛ اضغط على كلية لعرض أقسامها'}
            data={collegeData}
            mode={collegeDrilldown ? 'departments' : 'centers'}
            selectedCenter={filters.center}
            selectedDepartment={filters.department}
            accent="var(--chart-green)"
            onCenterSelect={(center) => {
              setOtherGroup('NONE')
              updateFilter('center', filters.center === center ? 'ALL' : center)
            }}
            onDepartmentSelect={(department) => updateFilter('department', filters.department === department ? 'ALL' : department)}
            onGroupSelect={(groupKey) => {
              setOtherGroup(groupKey)
              updateFilter('center', 'ALL')
            }}
            onBack={() => {
              setOtherGroup('NONE')
              updateFilter('center', 'ALL')
            }}
          />
          </div>
        </section>

        <details className="table-card movement-details">
          <summary className="table-toggle">أحدث الحركات <span>عرض الجدول</span></summary>
          <div className="table-heading">
            <div>
              <h2>أحدث الحركات</h2>
              <p>آخر 10 حركات ناجحة مطابقة للفلاتر</p>
            </div>
            <span>{formatNumber(lastRows.length)} من {formatNumber(filtered.length)} حركة</span>
          </div>
          <div className="table-scroll">
            <table>
              <thead><tr><th>التاريخ والوقت</th><th>الاسم</th><th>الفئة</th><th>الجنس</th><th>الكلية / الدائرة</th><th>القسم</th><th>البوابة</th><th>الاتجاه</th></tr></thead>
              <tbody>
                {lastRows.map((row) => (
                  <tr key={row.id}>
                    <td><b>{row.time.slice(0, 5)}</b><small>{formatDate(row.date)}</small></td>
                    <td><b>{row.employeeName}</b><small>{row.employeeId}</small></td>
                    <td><span className={`category-tag category-${row.category}`}>{CATEGORY_LABELS[row.category]}</span></td>
                    <td>{GENDER_LABELS[row.gender]}</td>
                    <td>{row.center}</td>
                    <td>{row.department}</td>
                    <td>{row.gate}</td>
                    <td><span className={`direction-tag direction-${row.direction.toLowerCase()}`}>{DIRECTION_LABELS[row.direction]}</span></td>
                  </tr>
                ))}
                {!lastRows.length && <tr><td colSpan={8}><EmptyState /></td></tr>}
              </tbody>
            </table>
          </div>
        </details>
      </main>
    </div>
  )
}
