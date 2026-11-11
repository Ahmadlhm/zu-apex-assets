export type DashboardPage = 'home' | 'gates' | 'registration'

// Keep navigation on the same static index.html when the build is hosted in APEX.
// The local /gates/ and /registration/ preview paths return to Vite's root.
export function dashboardHref(page: DashboardPage) {
  const pathname = location.pathname.replace(/\/(?:gates|registration)\/?(?:index\.html)?$/, '/')
  const indexPath = pathname.endsWith('/') ? `${pathname}index.html` : pathname
  return `${indexPath}?page=${page}`
}
