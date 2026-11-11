(() => {
  const currentScript = document.currentScript
  if (!currentScript?.src) return

  const apex = window.apex
  const appId = String(apex?.env?.APP_ID ?? '')
  const pageId = String(apex?.env?.APP_PAGE_ID ?? '')
  if (appId !== '158' || pageId !== '1') return

  const base = new URL('.', currentScript.src)
  const assets = new URL('assets/', base)
  const cssFiles = ['main.css', 'main2.css', 'main3.css']

  const mount = () => {
    if (document.getElementById('zu-apex-dashboard-root')) return
    const container = document.querySelector('.t-Body-contentInner')
      ?? document.querySelector('#t_Body_content')
      ?? document.body

    const root = document.createElement('div')
    root.id = 'zu-apex-dashboard-root'
    root.setAttribute('aria-label', 'لوحات جامعة الزرقاء')
    container.prepend(root)

    cssFiles.forEach((file) => {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = new URL(file, assets).href
      link.dataset.zuApexDashboard = 'true'
      document.head.append(link)
    })

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
