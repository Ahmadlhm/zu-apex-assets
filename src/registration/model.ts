export type Entity = 'university' | 'technical' | 'unknown'
export type Metric = 'admitted' | 'registered'
export type StudentGroup = 'all' | 'new' | 'continuing'
export interface Faculty { id: string; name: string; entity: Entity }
export interface Department { id: string; name: string; facultyId: string }
export interface Fact {
  studentId: string; facultyId: string; departmentId: string; entity: Entity
  year: number; term: number; kind: Metric; studentGroup: 'new' | 'continuing'; date: string | null
}
export interface Graduate { studentId: string; facultyId: string; departmentId: string; entity: Entity; year: number; term: number; rank: string; average: number | null }
export interface AdmissionDay { date: string; year: number; term: number; count: number; entity: Entity }
export interface SummaryCell { year: number; term: number; facultyId: string; departmentId: string; entity: Entity; kind: Metric; studentGroup: StudentGroup; total: number }
export interface Snapshot { facts: Fact[]; summary?: SummaryCell[]; faculties: Faculty[]; departments: Department[]; graduates: Graduate[]; source: 'demo' | 'api'; gradesAvailable: boolean }
export interface Filters { year: number; term: number; entity: Entity | 'all'; faculty: string; department: string; metric: Metric }
export const terms = ['كل الفصول', 'الفصل الأول', 'الفصل الثاني', 'الفصل الصيفي']
export const ranks = ['ممتاز', 'جيد جداً', 'جيد', 'مقبول', 'غير محدد']
export const formatCount = (n: number) => n.toLocaleString('en-US')
export const uniqueCount = (rows: { studentId: string }[]) => new Set(rows.map(r => r.studentId).filter(Boolean)).size
export function matchingFacts(data: Snapshot, filters: Filters, metric = filters.metric) {
  return data.facts.filter(r => r.kind === metric
    && r.year === filters.year && (!filters.term || r.term === filters.term)
    && (filters.entity === 'all' || r.entity === filters.entity) && (!filters.faculty || r.facultyId === filters.faculty)
    && (!filters.department || r.departmentId === filters.department))
}
export function matchingGraduates(data: Snapshot, filters: Filters) {
  return data.graduates.filter(r => r.year === filters.year && (!filters.term || r.term === filters.term)
    && (filters.entity === 'all' || r.entity === filters.entity) && (!filters.faculty || r.facultyId === filters.faculty)
    && (!filters.department || r.departmentId === filters.department))
}
export function groupCount<T extends { studentId: string }>(rows: T[], key: (row: T) => string) {
  const groups = new Map<string, Set<string>>()
  for (const row of rows) { const id = key(row); const set = groups.get(id) ?? new Set<string>(); if (row.studentId) set.add(row.studentId); groups.set(id, set) }
  return [...groups].map(([id, ids]) => ({ id, total: ids.size }))
}
export function countFor(data: Snapshot, filters: Filters, metric = filters.metric) {
  if (!data.summary) return uniqueCount(matchingFacts(data, filters, metric))
  return data.summary.filter(r => r.year === filters.year && r.term === filters.term && r.kind === metric
    && (filters.entity === 'all' || r.entity === filters.entity)
    && r.facultyId === filters.faculty && r.departmentId === filters.department
    && r.studentGroup === 'all')
    .reduce((sum, r) => sum + r.total, 0)
}
export function countGroups(data: Snapshot, filters: Filters, dimension: 'faculty' | 'department') {
  if (!data.summary) return groupCount(matchingFacts(data, filters), r => dimension === 'faculty' ? r.facultyId : r.departmentId)
  const ids = dimension === 'faculty'
    ? data.faculties.map(r => r.id).filter(id => !filters.faculty || id === filters.faculty)
    : data.departments.map(r => r.id).filter(id => !filters.department || id === filters.department)
  return ids.map(id => ({ id, total: countFor(data, { ...filters, [dimension]: id }) })).filter(r => r.total > 0)
}
export function normalizeRank(value: string) {
  const name = value.trim().replace(/[ًٌٍَُِّْ]/g, '').replace(/\s+/g, ' ')
  return name === 'جيد جدا' ? 'جيد جداً' : ranks.includes(name) ? name : 'غير محدد'
}
function withinDateRange(date: string, from: string, to: string) {
  const day = from.length === 10 || to.length === 10 ? date : date.slice(5)
  return (!from || day >= from) && (!to || day <= to)
}
export function timelineFor(data: Snapshot, filters: Filters, year: number, term: number, from = '', to = '', registeredDays?: AdmissionDay[]) {
  if (data.summary) {
    const scoped = (registeredDays ?? []).filter(r => r.year === year && r.term === term
      && (filters.entity === 'all' || r.entity === filters.entity))
    return { rows: scoped.filter(r => r.date && withinDateRange(r.date, from, to))
      .sort((a, b) => a.date.localeCompare(b.date)), undated: scoped.filter(r => !r.date).reduce((n, r) => n + r.count, 0) }
  }

  const firstDate = new Map<string, { date: string; entity: Entity }>()
  for (const fact of matchingFacts(data, { ...filters, year, term })) {
    const date = fact.date && /^\d{4}-\d{2}-\d{2}$/.test(fact.date) ? fact.date : ''
    const previous = firstDate.get(fact.studentId)
    if (!previous || (date && (!previous.date || date < previous.date))) {
      firstDate.set(fact.studentId, { date, entity: fact.entity })
    }
  }
  const grouped = new Map<string, AdmissionDay>()
  let undated = 0
  for (const { date, entity } of firstDate.values()) {
    if (!date) { undated++; continue }
    if (!withinDateRange(date, from, to)) continue
    const key = `${entity}:${date}`
    const day = grouped.get(key) ?? { date, year, term, count: 0, entity }
    day.count++
    grouped.set(key, day)
  }
  return { rows: [...grouped.values()].sort((a, b) => a.date.localeCompare(b.date)), undated }
}
