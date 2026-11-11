export type DashboardPage = 'home' | 'gates' | 'registration'

// Keep navigation on the same static index.html when the build is hosted in APEX.
// The local /gates/ and /registration/ preview paths return to Vite's root.
export function dashboardHref(page: DashboardPage) {
  const pathname = location.pathname.replace(/\/(?:gates|registration)\/?(?:index\.html)?$/, '/')
  const indexPath = pathname.endsWith('/') ? `${pathname}index.html` : pathname
  const search = new URLSearchParams(location.search)
  search.delete('page')
  const query = search.toString()
  // `page` is reserved by Oracle APEX/ORDS and can trigger APEX page routing
  // (including checksum validation). Keep SPA navigation in the URL fragment.
  return `${indexPath}${query ? `?${query}` : ''}#${page}`
}
