import { useEffect, useState } from 'react'

const storageKey = 'dashboard-display-mode'

const isAndroidDevice = () => /Android/i.test(navigator.userAgent) ||
  ((navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform === 'Android') ||
  (/Linux/i.test(navigator.platform) && navigator.maxTouchPoints > 0)

const displayScale = (width: number, height: number) =>
  width <= 800 || width <= height ? 1 : Math.max(.67, Math.min(1, 800 / width))

export function useDisplayMode() {
  const [displayMode, setDisplayMode] = useState(() => {
    const saved = localStorage.getItem(storageKey) ?? localStorage.getItem('registration-display-mode')
    return saved === 'on' || (saved !== 'off' && isAndroidDevice())
  })
  const [displaySize, setDisplaySize] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }))

  useEffect(() => {
    const update = () => setDisplaySize({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  useEffect(() => { localStorage.setItem(storageKey, displayMode ? 'on' : 'off') }, [displayMode])

  const scale = displayMode ? displayScale(displaySize.width, displaySize.height) : 1
  return { displayMode, setDisplayMode, scale, wideLayout: displayMode && displaySize.width / scale > 1200 }
}
