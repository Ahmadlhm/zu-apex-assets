import { StrictMode, Suspense, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { GatesApp, Home, RegistrationApp } from './routes'
import './index.css'

function getPage() {
  const requestedPage = location.hash.replace(/^#\/?/, '')
  if (requestedPage === 'home' || requestedPage === 'gates' || requestedPage === 'registration') return requestedPage
  return location.pathname.startsWith('/registration') ? 'registration'
    : location.pathname.startsWith('/gates') ? 'gates' : 'home'
}

function DashboardRouter() {
  const [page, setPage] = useState(getPage)

  useEffect(() => {
    const updatePage = () => setPage(getPage())
    window.addEventListener('hashchange', updatePage)
    return () => window.removeEventListener('hashchange', updatePage)
  }, [])

  return page === 'registration' ? <RegistrationApp /> : page === 'gates' ? <GatesApp /> : <Home />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<div className="page-boot" role="status">جارٍ فتح اللوحة…</div>}>
      <DashboardRouter />
    </Suspense>
  </StrictMode>,
)
