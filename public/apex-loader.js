(() => {
  const currentScript = document.currentScript
  if (!currentScript?.src) return

  const apex = window.apex
  const appId = String(apex?.env?.APP_ID ?? '')
  const pageId = String(apex?.env?.APP_PAGE_ID ?? '')
  if (appId !== '158' || pageId !== '1') return

  // Older dashboard builds put the SPA route in `?page=...`, which ORDS
  // treats as an APEX request parameter and rejects without an SSP checksum.
  // Migrate old links to a hash route, then reload the same APEX page cleanly.
  const pageUrl = new URL(window.location.href)
  if (pageUrl.searchParams.has('page')) {
    const requestedPage = pageUrl.searchParams.get('page')
    pageUrl.searchParams.delete('page')
    if (!pageUrl.hash && ['home', 'gates', 'registration'].includes(requestedPage)) {
      pageUrl.hash = requestedPage
    }
    window.location.replace(pageUrl.href)
    return
  }

  const base = new URL('.', currentScript.src)
  const assets = new URL('assets/', base)
  const cssFiles = ['main.css', 'main2.css', 'main3.css']

  const mount = () => {
    const root = document.getElementById('root') ?? document.createElement('div')
    if (root.dataset.zuApexDashboardMounted === 'true') return
    const container = document.querySelector('.t-Body-contentInner')
      ?? document.querySelector('#t_Body_content')
      ?? document.body

    root.id = 'root'
    root.setAttribute('aria-label', 'لوحات جامعة الزرقاء')
    if (!root.isConnected) container.prepend(root)
    root.dataset.zuApexDashboardMounted = 'true'

    cssFiles.forEach((file) => {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = new URL(file, assets).href
      link.dataset.zuApexDashboard = 'true'
      document.head.append(link)
    })

    const layout = document.createElement('style')
    layout.dataset.zuApexDashboard = 'true'
    layout.textContent = `
      html, body { min-width: 320px; overflow-x: hidden; }
      #root { width: 100vw; min-height: 100vh; margin-inline: calc(50% - 50vw); }
      #root > .app-shell { min-height: 100vh; }
      #t_Body_content, .t-Body-mainContent, .t-Body-content, .t-Body-contentInner {
        width: 100% !important; max-width: none !important; margin: 0 !important; padding: 0 !important;
      }
      .t-Region, .t-Region-bodyWrap, .t-Region-body {
        margin: 0 !important; padding: 0 !important; border: 0 !important;
        border-radius: 0 !important; box-shadow: none !important; background: transparent !important;
      }
    `
    document.head.append(layout)

    const module = document.createElement('script')
    module.type = 'module'
    module.src = new URL('main.js', assets).href
    module.onerror = () => {
      root.textContent = 'تعذر تحميل ملفات اللوحة من GitHub Pages.'
    }
    document.body.append(module)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true })
  } else {
    mount()
  }
})()
