export type Direction = 'IN' | 'OUT'
export type Gender = 'M' | 'F' | 'UNKNOWN'
export type PersonCategory = 'student' | 'admin' | 'faculty' | 'other'

export interface Transaction {
  id: number
  employeeId: string
  employeeName: string
  date: string
  time: string
  direction: Direction
  gender: Gender
  category: PersonCategory
  suffix: number
  center: string
  department: string
  zoneName: string
  gate: string
  eventId: 0 | 1
}

export interface DashboardFilters {
  dateFrom: string
  dateTo: string
  timeFrom: string
  timeTo: string
  direction: 'ALL' | Direction
  gender: 'ALL' | Gender
  categories: PersonCategory[]
  gate: string
  center: string
  department: string
  hour: string
}

export const CATEGORY_LABELS: Record<PersonCategory, string> = {
  student: 'طلاب',
  admin: 'إداريون',
  faculty: 'هيئة تدريس',
  other: 'أخرى',
}

export const GENDER_LABELS: Record<Gender, string> = {
  M: 'ذكر',
  F: 'أنثى',
  UNKNOWN: 'غير محدد',
}

export const DIRECTION_LABELS: Record<Direction, string> = {
  IN: 'دخول',
  OUT: 'خروج',
}
