import { normalizeRank } from './model'
import type { Snapshot, Entity, Filters, AdmissionDay, Graduate } from './model'

type Row = Record<string, unknown>
export interface RegistrationLoadOptions {
  years?: number[]
  initialYear?: number
  refresh?: boolean
  includeGraduates?: boolean
  onProgress?: (progress: { rows: number; pages: number }) => void
  onInitial?: (snapshot: Snapshot) => void
}
const summaryCache = new Map<string, Map<number, Row[]>>()
const summaryCacheLifetimeMs = 5 * 60 * 1000
const summarySessionKey = (base: string, year: number) => `zu-registration-summary-v2:${base}:${year}`
function readSessionSummary(base: string, year: number): Row[] | undefined {
  try {
    if (typeof sessionStorage === 'undefined') return
    const saved = sessionStorage.getItem(summarySessionKey(base, year))
    if (!saved) return
    const entry = JSON.parse(saved)
    if (entry.expires <= Date.now() || !Array.isArray(entry.rows) || entry.rows.some((row: Row) => Number(row.year) !== year)) return
    return entry.rows
  } catch { return }
}
function writeSessionSummary(base: string, year: number, rows: Row[]) {
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(summarySessionKey(base, year), JSON.stringify({ expires: Date.now() + summaryCacheLifetimeMs, rows }))
  } catch { /* Browsers may disable or fill session storage; in-memory cache still works. */ }
}
const graduateCache = new Map<string, Map<number, Row[]>>()
const daysCache = new Map<string, AdmissionDay[]>()
const lookupCache = new Map<string, { faculties: Row[]; departments: Row[] }>()
const connections = [
  { base: (import.meta.env.VITE_REGISTRATION_ORDS_BASE_URL?.trim() || '/ords/fees/registration-dashboard').replace(/\/$/, ''), entity: 'university' as const },
  { base: (import.meta.env.VITE_TECHNICAL_REGISTRATION_ORDS_BASE_URL?.trim() || '/ords/tech_regist/registration-dashboard').replace(/\/$/, ''), entity: 'technical' as const },
]
export const hasRegistrationApi = connections.length > 0
const text = (r: Row, key: string) => String(r[key] ?? '').trim()
const num = (r: Row, key: string) => Number(r[key] ?? 0)

async function pages(base: string, endpoint: string, signal: AbortSignal, range?: { from: number; to: number }, onPage?: (count: number) => void, params?: Record<string, string>): Promise<Row[]> {
  const start = new URL(`${base}/${endpoint}/`, location.href)
  if (range) {
    start.searchParams.set('from_year', String(range.from))
    start.searchParams.set('to_year', String(range.to))
    start.searchParams.set('limit', '10000')
  }
  for (const [key, value] of Object.entries(params ?? {})) start.searchParams.set(key, value)
  const visited = new Set<string>()
  const rows: Row[] = []
  let url: URL | null = start
  while (url) {
    if (visited.has(url.href) || visited.size >= 1000) throw new Error('تعذر إكمال صفحات البيانات: رابط الصفحة مكرر أو عدد الصفحات كبير.')
    visited.add(url.href)
    const requestController = new AbortController()
    const abort = () => requestController.abort(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    const timer = setTimeout(() => requestController.abort(new Error('انتهت مهلة طلب بيانات التسجيل. أعد المحاولة.')), 90000)
    let payload
    try {
      signal.throwIfAborted()
      const response = await fetch(url, { signal: requestController.signal, headers: { Accept: 'application/json' } })
      if (!response.ok) throw new Error(`تعذر تحميل ${endpoint} (HTTP ${response.status}).`)
      payload = await response.json()
    } finally { clearTimeout(timer); signal.removeEventListener('abort', abort) }
    if (!Array.isArray(payload.items)) throw new Error(`استجابة ${endpoint} لا تحتوي على items.`)
    rows.push(...payload.items.map((r: Row) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.toLowerCase(), v]))))
    onPage?.(payload.items.length)
    const next = payload.links?.find((l: { rel: string }) => l.rel === 'next')?.href ?? payload.next?.$ref
    if (payload.hasMore && !next) throw new Error('الاستجابة غير مكتملة: رابط الصفحة التالية غير موجود.')
    if (!next) { url = null; continue }
    const candidate: URL = new URL(next, url)
    // ORDS may return the upstream absolute URL while development uses the local proxy.
    const proxied = start.pathname.startsWith('/api/ords/') && candidate.origin === 'https://eservices.zu.edu.jo' && candidate.pathname.startsWith('/ords/')
    if (proxied) { candidate.pathname = `/api${candidate.pathname}`; candidate.host = start.host; candidate.protocol = start.protocol }
    if (candidate.origin !== start.origin || candidate.pathname !== start.pathname) throw new Error('رابط الصفحة التالية خارج خدمة التسجيل المحددة.')
    url = candidate
  }
  return rows
}

export async function loadRegistration(signal: AbortSignal, options: RegistrationLoadOptions = {}): Promise<Snapshot> {
  signal.throwIfAborted()
  if (!connections.length) throw new Error('لم تُضبط روابط ORDS للقبول والتسجيل.')
  const progress = { rows: 0, pages: 0 }
  const onPage = (count: number) => { progress.rows += count; progress.pages++; options.onProgress?.({ ...progress }) }
  const combine = (datasets: Snapshot[]): Snapshot => ({ source: 'api', gradesAvailable: datasets.every(d => d.gradesAvailable), facts: [], summary: datasets.flatMap(d => d.summary ?? []), faculties: datasets.flatMap(d => d.faculties), departments: datasets.flatMap(d => d.departments), graduates: datasets.flatMap(d => d.graduates) })
  const currentYear = options.initialYear ?? Math.max(...(options.years ?? []).filter(Number.isInteger))
  if (options.onInitial && Number.isFinite(currentYear)) {
    const initial = await Promise.all(connections.map(c => loadSchema(c.base, c.entity, signal, { ...options, years: [currentYear] }, onPage, false)))
    signal.throwIfAborted()
    options.onInitial(combine(initial))
    if (options.refresh && options.includeGraduates !== false) connections.forEach(c => graduateCache.get(c.base)?.delete(currentYear))
  }
  const datasets = await Promise.all(connections.map(c => loadSchema(c.base, c.entity, signal, { ...options, refresh: options.onInitial ? false : options.refresh }, onPage, options.includeGraduates !== false)))
  return combine(datasets)
}

async function rowsForYears(base: string, endpoint: string, store: Map<string, Map<number, Row[]>>, signal: AbortSignal, options: RegistrationLoadOptions, onPage?: (count: number) => void) {
  const wanted = [...new Set(options.years ?? [])].filter(Number.isInteger).sort((a, b) => a - b)
  if (!wanted.length) return pages(base, endpoint, signal, undefined, onPage)
  const cache = store.get(base) ?? new Map<number, Row[]>()
  if (endpoint === 'summary' && !options.refresh) for (const year of wanted) {
    if (!cache.has(year)) {
      const saved = readSessionSummary(base, year)
      if (saved) cache.set(year, saved)
    }
  }
  const missing = wanted.filter(year => !cache.has(year) || (options.refresh && year === (options.initialYear ?? wanted.at(-1))))
  const ranges: { from: number; to: number }[] = []
  for (const year of missing) {
    const last = ranges.at(-1)
    if (last && last.to === year - 1) last.to = year
    else ranges.push({ from: year, to: year })
  }
  for (const range of ranges) {
    const rows = await pages(base, endpoint, signal, range, onPage)
    signal.throwIfAborted()
    if (rows.some(r => num(r, 'year') < range.from || num(r, 'year') > range.to)) throw new Error('خدمة الطلاب لم تطبق نطاق السنوات المطلوب.')
    for (let year = range.from; year <= range.to; year++) {
      const yearRows = rows.filter(r => num(r, 'year') === year)
      cache.set(year, yearRows)
      if (endpoint === 'summary') writeSessionSummary(base, year, yearRows)
    }
    store.set(base, cache)
  }
  return wanted.flatMap(year => cache.get(year) ?? [])
}

function graduateRows(rows: Row[], source: Entity): Graduate[] {
  const scoped = (r: Row, key: string) => `${source}:${text(r, key) || 'unknown'}`
  return rows.map(r => ({ studentId: scoped(r, 'student_id'), facultyId: scoped(r, 'faculty_id'), departmentId: scoped(r, 'department_id'), entity: source, year: num(r, 'year'), term: num(r, 'term'), rank: normalizeRank(text(r, 'rank')), average: text(r, 'average') ? num(r, 'average') : null }))
}

// Graduate details are independent of the summary and only needed for the selected year.
export async function loadRegistrationGraduates(signal: AbortSignal, options: RegistrationLoadOptions = {}): Promise<Graduate[]> {
  signal.throwIfAborted()
  if (!connections.length) throw new Error('لم تُضبط روابط ORDS للقبول والتسجيل.')
  if (import.meta.env.VITE_REGISTRATION_GRADES_ENABLED !== 'true') return []
  const rows = await Promise.all(connections.map(async c => graduateRows(
    await rowsForYears(c.base, 'graduates', graduateCache, signal, options), c.entity)))
  return rows.flat()
}

export async function loadRegistrationDays(signal: AbortSignal, years: number[], filters: Pick<Filters, 'entity' | 'faculty' | 'department' | 'metric'>, refresh = false): Promise<AdmissionDay[]> {
  signal.throwIfAborted()
  const selected = connections.filter(c => filters.entity === 'all' || c.entity === filters.entity)
  const result = await Promise.all(selected.flatMap(c => years.map(async year => {
    const faculty = filters.faculty.startsWith(`${c.entity}:`) ? filters.faculty.slice(c.entity.length + 1) : ''
    const department = filters.department.startsWith(`${c.entity}:`) ? filters.department.slice(c.entity.length + 1) : ''
    if ((filters.faculty && !faculty) || (filters.department && !department)) return []
    const studentGroup = filters.metric === 'admitted' ? 'new' : 'all'
    const key = JSON.stringify([c.base, year, faculty, department, studentGroup, filters.metric])
    if (!refresh && daysCache.has(key)) return daysCache.get(key)!
    const params: Record<string, string> = { year: String(year), limit: '1000', student_group: studentGroup, metric: filters.metric }
    if (faculty) params.faculty_id = faculty
    if (department) params.department_id = department
    const rows = await pages(c.base, 'registration-days', signal, undefined, undefined, params)
    const days = rows.map(r => ({ date: text(r, 'event_date'), year, term: num(r, 'scope_term'), count: num(r, 'total'), entity: c.entity }))
    daysCache.set(key, days)
    return days
  })))
  return result.flat()
}

async function loadSchema(base: string, source: Entity, signal: AbortSignal, options: RegistrationLoadOptions, onPage: (count: number) => void, includeGraduates = true): Promise<Snapshot> {
  const gradesAvailable = import.meta.env.VITE_REGISTRATION_GRADES_ENABLED === 'true'
  async function lookups() {
    const cached = lookupCache.get(base)
    if (cached && !options.refresh) return cached
    const [faculties, departments] = await Promise.all(['faculties', 'departments'].map(endpoint => pages(base, endpoint, signal)))
    signal.throwIfAborted()
    const result = { faculties, departments }
    lookupCache.set(base, result)
    return result
  }
  const [summary, { faculties, departments }, graduates] = await Promise.all([
    rowsForYears(base, 'summary', summaryCache, signal, options, onPage), lookups(), gradesAvailable && includeGraduates ? rowsForYears(base, 'graduates', graduateCache, signal, options, onPage) : Promise.resolve([] as Row[]),
  ])
  const scoped = (r: Row, key: string) => `${source}:${text(r, key) || 'unknown'}`
  if (summary.some(r => !['admitted', 'registered'].includes(text(r, 'kind')) || !Number.isInteger(num(r, 'year')) || num(r, 'year') < 1900 || ![0, 1, 2, 3].includes(num(r, 'scope_term')) || num(r, 'total') < 0)) throw new Error('ملخص الطلاب يحتوي على بيانات غير صالحة.')
  const facultyRows: Snapshot['faculties'] = faculties.map(r => ({ id: scoped(r, 'id'), name: text(r, 'name'), entity: source }))
  const departmentRows: Snapshot['departments'] = departments.map(r => ({ id: scoped(r, 'id'), name: text(r, 'name'), facultyId: scoped(r, 'faculty_id') }))
  if (summary.some(r => text(r, 'faculty_id') === 'TRANSFER_REVIEW' || text(r, 'department_id') === 'TRANSFER_REVIEW')) {
    const reviewId = `${source}:TRANSFER_REVIEW`
    if (!facultyRows.some(row => row.id === reviewId)) facultyRows.push({ id: reviewId, name: 'تحويلات تحتاج مراجعة', entity: source })
    if (!departmentRows.some(row => row.id === reviewId)) departmentRows.push({ id: reviewId, name: 'تخصص غير محسوم من سجل التحويل', facultyId: reviewId })
  }
  if (summary.some(r => text(r, 'faculty_id') === 'DUES_REVIEW' || text(r, 'department_id') === 'DUES_REVIEW')) {
    const reviewId = `${source}:DUES_REVIEW`
    if (!facultyRows.some(row => row.id === reviewId)) facultyRows.push({ id: reviewId, name: 'بيانات الفصل تحتاج مراجعة', entity: source })
    if (!departmentRows.some(row => row.id === reviewId)) departmentRows.push({ id: reviewId, name: 'الكلية أو التخصص غير محدد في DUES', facultyId: reviewId })
  }
  return {
    source: 'api', gradesAvailable,
    faculties: facultyRows,
    departments: departmentRows,
    facts: [],
    summary: summary.map(r => ({ facultyId: text(r, 'faculty_id') ? scoped(r, 'faculty_id') : '', departmentId: text(r, 'department_id') ? scoped(r, 'department_id') : '', entity: source, year: num(r, 'year'), term: num(r, 'scope_term'), kind: text(r, 'kind') as 'admitted' | 'registered', studentGroup: text(r, 'student_group') as 'all' | 'new' | 'continuing', total: num(r, 'total') })),
    graduates: graduateRows(graduates, source),
  }
}
