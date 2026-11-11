export function getApexLogoutUrl(): string | null {
  if (window.parent === window) return null

  try {
    const host = window.parent as Window & {
      apex?: { env?: { APP_ID?: string | number; APP_SESSION?: string | number } }
    }
    const appId = String(host.apex?.env?.APP_ID ?? '')
    const sessionId = String(host.apex?.env?.APP_SESSION ?? '')
    if (!/^\d+$/.test(appId) || !/^\d+$/.test(sessionId)) return null

    const ordsPath = host.location.pathname.match(/^.*?\/ords\//)?.[0]
    if (!ordsPath) return null
    const url = new URL(`${ordsPath}apex_authentication.logout`, host.location.origin)
    url.search = new URLSearchParams({ p_app_id: appId, p_session_id: sessionId }).toString()
    return url.href
  } catch {
    return null
  }
}
