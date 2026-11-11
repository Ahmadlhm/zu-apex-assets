import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { GatesApp, Home, RegistrationApp } from './routes'
import './index.css'

const requestedPage = new URLSearchParams(location.search).get('page')
const page = requestedPage === 'home' || requestedPage === 'gates' || requestedPage === 'registration'
  ? requestedPage
  : location.pathname.startsWith('/registration') ? 'registration'
    : location.pathname.startsWith('/gates') ? 'gates' : 'home'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<div className="page-boot" role="status">جارٍ فتح اللوحة…</div>}>
      {page === 'registration' ? <RegistrationApp /> : page === 'gates' ? <GatesApp /> : <Home />}
    </Suspense>
  </StrictMode>,
)
