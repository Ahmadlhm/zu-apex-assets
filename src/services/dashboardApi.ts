import { canonicalCenterName } from '../data/centerMapping'
import { mapZoneToGate } from '../data/gateMapping'
import type { Gender, PersonCategory, Transaction } from '../types/dashboard'

interface OrdsTransaction {
  trans_id: number
  employee_id: string
  employee_name: string
  tr_date: number | string
  trans_time?: string
  tr_time?: number | string
  trans_direction: 'IN' | 'OUT'
  employee_gender: string | number
  suffix: number | string
  emp_position?: string | null
  center?: string
  dept_name?: string
  zone_name: string
  event_id: 0 | 1
}

interface OrdsCollectionResponse {
  items?: OrdsTransaction[]
  hasMore?: boolean
  offset?: number
  limit?: number
  next?: { href?: string; $ref?: string }
  links?: Array<{ rel?: string; href?: string; $ref?: string }>
}

interface TransactionRequest {
  dateFrom: string
  dateTo: string
}

type CompactTransaction = [
  number, string, string, number | string, 'IN' | 'OUT',
  number | string | null, number | string | null, string | null,
  string | null, string | null, string | null,
]

type CompactPresence = [
  number, string, number | string, number | string,
  number | string | null, number | string | null, string | null,
  string | null, string | null, string | null,
]

class MissingDayEndpointError extends Error {}

// Keep recently viewed days in memory so changing the date range does not
// download and decode the same large ORDS response again. Live data expires
// quickly; completed days are still refreshed periodically for corrections.
const dayCache = new Map<string, { rows: Transaction[]; expiresAt: number }>()
const MAX_CACHED_DAYS = 3
const localToday = () => {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export const clearDashboardDayCache = () => dayCache.clear()

const daysInRange = (from: string, to: string) => {
  const datePattern = /^\d{4}-\d{2}-\d{2}$/
  if (!datePattern.test(from) || !datePattern.test(to)) throw new Error('اختر تاريخ بداية ونهاية صحيحين.')
  const start = Date.parse(`${from}T00:00:00Z`)
  const end = Date.parse(`${to}T00:00:00Z`)
  if (!Number.isFinite(start) || !Number.isFinite(end)
    || new Date(start).toISOString().slice(0, 10) !== from
    || new Date(end).toISOString().slice(0, 10) !== to) {
    throw new Error('اختر تاريخ بداية ونهاية صحيحين.')
  }
  if (start > end) {
    throw new Error('تاريخ البداية يجب أن يسبق تاريخ النهاية.')
  }
  const count = Math.round((end - start) / 86_400_000) + 1
  if (count > 31) throw new Error('الحد الأقصى للفترة هو 31 يوماً. اختر فترة أقصر.')
  return Array.from({ length: count }, (_, index) =>
    new Date(start + index * 86_400_000).toISOString().slice(0, 10),
  )
}

const categoryFromSuffix = (suffix: number): PersonCategory => {
  if ([1, 5, 6].includes(suffix)) return 'student'
  if ([2, 11].includes(suffix)) return 'admin'
  if ([3, 12].includes(suffix)) return 'faculty'
  return 'other'
}

const normalizeDate = (value: string | number) => {
  const digits = String(value).replace(/\D/g, '').slice(0, 8)
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
}

const normalizeTime = (value: string | number | undefined) => {
  if (!value) return '00:00:00'
  if (String(value).includes(':')) return String(value).padStart(8, '0')
  const digits = String(value).replace(/\D/g, '').padStart(6, '0').slice(-6)
  return `${digits.slice(0, 2)}:${digits.slice(2, 4)}:${digits.slice(4, 6)}`
}

const normalizeTransaction = (row: OrdsTransaction): Transaction => {
  const suffix = Number(row.suffix)
  // A null EMP_POSITION represents an uncategorized record in the source data.
  // Keep legacy responses (where the field is absent) working until ORDS is updated.
  const category = row.emp_position === null || row.emp_position?.trim() === ''
    ? 'other'
    : categoryFromSuffix(suffix)
  const department = row.dept_name?.trim() || 'غير محدد'
  const rawCenter = row.center?.trim()
  const centerSource = rawCenter || (department.includes('التعليم المستمر') ? department : 'غير محدد')
  return {
    id: row.trans_id,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    date: normalizeDate(row.tr_date),
    time: normalizeTime(row.trans_time ?? row.tr_time),
    direction: row.trans_direction,
      gender: (Number(row.employee_gender) === 1
        ? 'M'
        : Number(row.employee_gender) === 2
          ? 'F'
          : 'UNKNOWN') as Gender,
    category,
    suffix,
    center: suffix === 5 ? 'مركز التعليم المستمر' : canonicalCenterName(centerSource),
    department,
    zoneName: row.zone_name,
    gate: mapZoneToGate(row.zone_name),
    eventId: row.event_id,
  }
}

const nextPageUrl = (payload: OrdsCollectionResponse) => {
  if (payload.next) return payload.next.href ?? payload.next.$ref
  const nextLink = payload.links?.find((link) => link.rel?.toLowerCase() === 'next')
  return nextLink?.href ?? nextLink?.$ref
}

const compactRowToTransaction = (row: CompactTransaction, day: string): Transaction => {
  if (!Array.isArray(row) || row.length !== 11 || !Number.isFinite(Number(row[0]))) {
    throw new Error('صيغة بيانات البوابات غير متوقعة.')
  }
  return normalizeTransaction({
    trans_id: Number(row[0]),
    employee_id: String(row[1] ?? ''),
    employee_name: String(row[2] ?? ''),
    tr_date: day,
    tr_time: row[3],
    trans_direction: row[4],
    employee_gender: row[5] ?? '',
    suffix: row[6] ?? '',
    emp_position: row[7],
    center: row[8] ?? '',
    dept_name: row[9] ?? '',
    zone_name: row[10] ?? '',
    event_id: 1,
  })
}

const compactPresenceToTransaction = (row: CompactPresence): Transaction => {
  if (!Array.isArray(row) || row.length !== 10 || !Number.isFinite(Number(row[0])) || !String(row[1] ?? '').trim()) {
    throw new Error('صيغة بيانات الموجودين غير متوقعة.')
  }
  return normalizeTransaction({
    trans_id: Number(row[0]),
    employee_id: String(row[1]),
    employee_name: '',
    tr_date: row[2],
    tr_time: row[3],
    trans_direction: 'IN',
    employee_gender: row[4] ?? '',
    suffix: row[5] ?? '',
    emp_position: row[6],
    center: row[7] ?? '',
    dept_name: row[8] ?? '',
    zone_name: row[9] ?? '',
    event_id: 1,
  })
}

const isSecurityPresence = (row: CompactPresence) => (
  String(row[6] ?? '').trim().replaceAll('أ', 'ا') === 'امن وحماية' &&
  String(row[8] ?? '').trim() === 'شعبة الأمن والسلامة'
)

export async function getDashboardPresenceSnapshot(
  atDate: string,
  atTime: string,
  lookbackHours = 24,
  signal?: AbortSignal,
): Promise<Transaction[]> {
  daysInRange(atDate, atDate)
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(atTime) || !Number.isInteger(lookbackHours) || lookbackHours < 1 || lookbackHours > 72) {
    throw new Error('وقت نهاية الفترة أو مدة احتساب الموجودين غير صحيحة.')
  }
  const endOfDay = atTime === '23:59'
  const asOf = Date.parse(`${atDate}T${atTime}:${endOfDay ? '59' : '00'}Z`)
  const cutoff = asOf - lookbackHours * 3_600_000
  // The published endpoint includes the supplied minute. Request the preceding
  // minute so the selected end excludes 06:00 when the user chooses 06:00.
  const requestEnd = new Date(asOf - (endOfDay ? 0 : 60_000)).toISOString()
  const requestDate = requestEnd.slice(0, 10)
  const requestTime = requestEnd.slice(11, 16)
  const baseUrl = import.meta.env.VITE_ORDS_BASE_URL?.trim() || '/ords/zu_gates/gates-dashboard'
  const url = new URL(`${baseUrl.replace(/\/$/, '')}/presence-snapshot/`, window.location.origin)
  url.searchParams.set('at_date', requestDate)
  url.searchParams.set('at_time', requestTime)
  url.searchParams.set('lookback_hours', String(lookbackHours))
  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`ORDS presence request failed: ${response.status}`)
  const payload: unknown = await response.json()
  if (!Array.isArray(payload)) throw new Error('صيغة بيانات الموجودين غير متوقعة.')
  return payload
    .map((row) => row as CompactPresence)
    .filter((row) => normalizeDate(row[2]) === atDate || isSecurityPresence(row))
    .map(compactPresenceToTransaction)
    .filter((row) => Date.parse(`${row.date}T${row.time}Z`) >= cutoff)
}

const getCompactDay = async (baseUrl: string, day: string, signal?: AbortSignal, refresh = false) => {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  const key = `${baseUrl}|${day}`
  const cached = dayCache.get(key)
  if (!refresh && cached && cached.expiresAt > Date.now()) {
    dayCache.delete(key)
    dayCache.set(key, cached)
    return cached.rows
  }
  const url = new URL(`${baseUrl}/transactions-day/`, window.location.origin)
  url.searchParams.set('day', day)
  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } })
  if (response.status === 404) throw new MissingDayEndpointError()
  if (!response.ok) throw new Error(`ORDS request failed: ${response.status}`)
  const payload: unknown = await response.json()
  if (!Array.isArray(payload)) throw new Error('صيغة بيانات البوابات غير متوقعة.')
  const rows = payload.map((row) => compactRowToTransaction(row as CompactTransaction, day))
  if (!signal?.aborted) {
    dayCache.delete(key)
    dayCache.set(key, {
      rows,
      expiresAt: Date.now() + (day === localToday() ? 60_000 : 15 * 60_000),
    })
    if (dayCache.size > MAX_CACHED_DAYS) dayCache.delete(dayCache.keys().next().value!)
  }
  return rows
}

const getCompactRange = async (baseUrl: string, days: string[], signal?: AbortSignal, refresh = false) => {
  const results: Transaction[][] = new Array(days.length)
  let nextIndex = 0
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort, { once: true })
  if (signal?.aborted) controller.abort()
  const worker = async () => {
    while (nextIndex < days.length) {
      const index = nextIndex++
      results[index] = await getCompactDay(baseUrl, days[index], controller.signal, refresh)
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.min(3, days.length) }, worker))
    return results.reverse().flat()
  } catch (error) {
    controller.abort()
    throw error
  } finally {
    signal?.removeEventListener('abort', onAbort)
  }
}

const getLegacyRange = async (baseUrl: string, request: TransactionRequest, signal?: AbortSignal) => {
  const endpoint = new URL(`${baseUrl}/transactions/`, window.location.origin)
  endpoint.searchParams.set('from_date', request.dateFrom)
  endpoint.searchParams.set('to_date', request.dateTo)

  const items: OrdsTransaction[] = []
  let pageUrl: string | undefined = endpoint.toString()
  let pageCount = 0
  const seenPages = new Set<string>()

  while (pageUrl) {
    if (pageCount >= 100 || seenPages.has(pageUrl)) {
      throw new Error('تعذر تحميل جميع صفحات الحركات. اختر فترة أقصر.')
    }
    seenPages.add(pageUrl)
    const currentPageUrl: string = pageUrl
    const response = await fetch(currentPageUrl, { signal, headers: { Accept: 'application/json' } })
    if (!response.ok) throw new Error(`ORDS request failed: ${response.status}`)
    const payload = (await response.json()) as OrdsCollectionResponse | OrdsTransaction[]

    if (Array.isArray(payload)) {
      items.push(...payload)
      pageUrl = undefined
    } else {
      if (!Array.isArray(payload.items)) throw new Error('صيغة بيانات البوابات غير متوقعة.')
      items.push(...payload.items)
      const linkedPage = nextPageUrl(payload)
      if (linkedPage) {
        const linkedUrl = new URL(linkedPage, currentPageUrl)
        const routedNextUrl = new URL(currentPageUrl)
        routedNextUrl.search = linkedUrl.search
        pageUrl = routedNextUrl.toString()
      } else if (payload.hasMore && payload.limit) {
        const nextUrl: URL = new URL(currentPageUrl)
        nextUrl.searchParams.set('offset', String((payload.offset ?? 0) + payload.limit))
        pageUrl = nextUrl.toString()
      } else if (payload.hasMore) {
        throw new Error('تعذر متابعة صفحات الحركات.')
      } else {
        pageUrl = undefined
      }
    }
    pageCount += 1
  }
  return items.map(normalizeTransaction)
}

export async function getDashboardTransactions(
  request: TransactionRequest,
  signal?: AbortSignal,
  refresh = false,
): Promise<Transaction[]> {
  const baseUrl = import.meta.env.VITE_ORDS_BASE_URL?.trim() || '/ords/zu_gates/gates-dashboard'
  const days = daysInRange(request.dateFrom, request.dateTo)

  const normalizedBase = baseUrl.replace(/\/$/, '')
  try {
    return await getCompactRange(normalizedBase, days, signal, refresh)
  } catch (error) {
    if (signal?.aborted || !(error instanceof MissingDayEndpointError)) throw error
    return getLegacyRange(normalizedBase, request, signal)
  }
}
