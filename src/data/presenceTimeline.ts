import type { Transaction } from '../types/dashboard'

export interface HourlyPoint {
  key: string
  hour: string
  date: string
  count: number
}

export const transactionHourKey = (row: Transaction) => `${row.date}T${row.time.slice(0, 2)}`

export const buildPresenceTimeline = (
  rows: Transaction[],
  asOf: { date: string; time: string },
): HourlyPoint[] => {
  const end = Date.parse(`${asOf.date}T${asOf.time}:${asOf.time === '23:59' ? '59' : '00'}Z`)
  const counts = new Map<string, number>()
  rows.forEach((row) => {
    if (row.date !== asOf.date) return
    const timestamp = Date.parse(`${row.date}T${row.time}Z`)
    if (asOf.time === '23:59' ? timestamp > end : timestamp >= end) return
    const key = transactionHourKey(row)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  })
  const lastHour = asOf.time.endsWith(':00') ? Number(asOf.time.slice(0, 2)) - 1 : Number(asOf.time.slice(0, 2))
  return Array.from({ length: lastHour + 1 }, (_, hour) => {
    const key = `${asOf.date}T${String(hour).padStart(2, '0')}`
    return { key, date: key.slice(0, 10), hour: key.slice(11), count: counts.get(key) ?? 0 }
  })
}
