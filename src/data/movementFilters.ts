import type { DashboardFilters, Transaction } from '../types/dashboard'
import { transactionHourKey } from './presenceTimeline'

const timeInSeconds = (value: string) => {
  const [hours, minutes, seconds] = value.split(':').map(Number)
  return (hours * 3600) + (minutes * 60) + seconds
}

// A reader may report the same crossing more than once. Keep the newest
// movement for each person, calendar day and canonical gate within 60 seconds.
// Deduplication must run before any dashboard filter, including time/direction.
export const deduplicateTransactions = (rows: Transaction[]) => {
  const newestFirst = (a: Transaction, b: Transaction) => a.date === b.date
    ? (a.time === b.time ? b.id - a.id : a.time > b.time ? -1 : 1)
    : a.date > b.date ? -1 : 1
  const ordered = rows.every((row, index) => index === 0 || newestFirst(rows[index - 1], row) <= 0)
  const sortedRows = ordered ? rows : [...rows].sort(newestFirst)
  const lastAcceptedByKey = new Map<string, number>()
  const uniqueRows: Transaction[] = []

  sortedRows.forEach((row) => {
    const key = `${row.employeeId}|${row.date}|${row.gate}`
    const currentSeconds = timeInSeconds(row.time)
    const lastAcceptedSeconds = lastAcceptedByKey.get(key)
    if (lastAcceptedSeconds !== undefined && Math.abs(lastAcceptedSeconds - currentSeconds) <= 60) return
    lastAcceptedByKey.set(key, currentSeconds)
    uniqueRows.push(row)
  })

  return uniqueRows
}

export const isMovementVisible = (row: Transaction, filters: DashboardFilters) => {
  const minute = row.time.slice(0, 5)
  return (
    row.eventId === 1 &&
    row.date >= filters.dateFrom &&
    row.date <= filters.dateTo &&
    minute >= filters.timeFrom &&
    (filters.timeTo === '23:59' ? minute <= filters.timeTo : minute < filters.timeTo) &&
    (filters.direction === 'ALL' || row.direction === filters.direction) &&
    (filters.gender === 'ALL' || row.gender === filters.gender) &&
    (!filters.categories.length || filters.categories.includes(row.category)) &&
    (filters.gate === 'ALL' || row.gate === filters.gate) &&
    (filters.center === 'ALL' || row.center === filters.center) &&
    (filters.department === 'ALL' || row.department === filters.department) &&
    (filters.hour === 'ALL' || transactionHourKey(row) === filters.hour)
  )
}
