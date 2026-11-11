import { useEffect, useState } from 'react'
import { ArrowLeft, DoorOpen, GraduationCap, LogOut, Monitor, Moon, Sun } from 'lucide-react'
import logo from '../../logo/zarqa_logo.png'
import { dashboardHref } from '../navigation'
import { useDisplayMode } from '../displayMode'
import { getApexLogoutUrl } from './apexLogout'
import './home.css'

const copy = {
  gatesTitle: '\u0644\u0648\u062d\u0629 \u062d\u0631\u0643\u0629 \u0627\u0644\u0628\u0648\u0627\u0628\u0627\u062a',
  gatesDescription: '\u0645\u062a\u0627\u0628\u0639\u0629 \u0627\u0644\u062f\u062e\u0648\u0644 \u0648\u0627\u0644\u062e\u0631\u0648\u062c\u060c \u0627\u0644\u0623\u0634\u062e\u0627\u0635 \u0627\u0644\u0641\u0631\u064a\u062f\u064a\u0646\u060c \u062d\u0631\u0643\u0629 \u0627\u0644\u0628\u0648\u0627\u0628\u0627\u062a \u0648\u0627\u0644\u0643\u0644\u064a\u0627\u062a \u0648\u0627\u0644\u062f\u0648\u0627\u0626\u0631.',
  registrationTitle: '\u0644\u0648\u062d\u0629 \u0627\u0644\u0642\u0628\u0648\u0644 \u0648\u0627\u0644\u062a\u0633\u062c\u064a\u0644',
  registrationDescription: '\u0627\u0633\u062a\u0643\u0634\u0627\u0641 \u0627\u0644\u0645\u0642\u0628\u0648\u0644\u064a\u0646 \u0648\u0627\u0644\u0645\u0633\u062c\u0644\u064a\u0646 \u062d\u0633\u0628 \u0627\u0644\u0633\u0646\u0629 \u0648\u0627\u0644\u0641\u0635\u0644 \u0648\u0627\u0644\u0643\u0644\u064a\u0629 \u0648\u0627\u0644\u062a\u062e\u0635\u0635\u060c \u0648\u0645\u062a\u0627\u0628\u0639\u0629 \u0627\u0644\u062e\u0631\u064a\u062c\u064a\u0646.',
  gatesTags: ['\u0627\u0644\u062d\u0631\u0643\u0629 \u0627\u0644\u064a\u0648\u0645\u064a\u0629', '\u0627\u0644\u0628\u0648\u0627\u0628\u0627\u062a', '\u0627\u0644\u0623\u0634\u062e\u0627\u0635'],
  registrationTags: ['\u0627\u0644\u0642\u0628\u0648\u0644', '\u0627\u0644\u062a\u0633\u062c\u064a\u0644', '\u0627\u0644\u062a\u0642\u062f\u064a\u0631\u0627\u062a'],
  pageTitle: '\u0644\u0648\u062d\u0627\u062a \u0627\u0644\u0645\u0624\u0634\u0631\u0627\u062a | \u062c\u0627\u0645\u0639\u0629 \u0627\u0644\u0632\u0631\u0642\u0627\u0621',
  logoAlt: '\u0634\u0639\u0627\u0631 \u062c\u0627\u0645\u0639\u0629 \u0627\u0644\u0632\u0631\u0642\u0627\u0621',
  university: '\u062c\u0627\u0645\u0639\u0629 \u0627\u0644\u0632\u0631\u0642\u0627\u0621',
  system: '\u0646\u0638\u0627\u0645 \u0644\u0648\u062d\u0627\u062a \u0627\u0644\u0645\u0624\u0634\u0631\u0627\u062a',
  light: '\u062a\u0641\u0639\u064a\u0644 \u0627\u0644\u0648\u0636\u0639 \u0627\u0644\u0641\u0627\u062a\u062d',
  dark: '\u062a\u0641\u0639\u064a\u0644 \u0627\u0644\u0648\u0636\u0639 \u0627\u0644\u062f\u0627\u0643\u0646',
  logout: '\u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062e\u0631\u0648\u062c',
  eyebrow: '\u0645\u0646\u0635\u0629 \u0627\u0644\u0645\u062a\u0627\u0628\u0639\u0629 \u0648\u0627\u0644\u062a\u062d\u0644\u064a\u0644',
  heading: '\u0644\u0648\u062d\u0627\u062a \u062c\u0627\u0645\u0639\u0629 \u0627\u0644\u0632\u0631\u0642\u0627\u0621',
  intro: '\u0627\u062e\u062a\u0631 \u0627\u0644\u0644\u0648\u062d\u0629 \u0627\u0644\u062a\u064a \u062a\u0631\u064a\u062f \u0627\u0633\u062a\u0639\u0631\u0627\u0636\u0647\u0627. \u064a\u0645\u0643\u0646\u0643 \u0627\u0644\u0639\u0648\u062f\u0629 \u0625\u0644\u0649 \u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u062d\u0629 \u0645\u0646 \u062f\u0627\u062e\u0644 \u0623\u064a \u0644\u0648\u062d\u0629.',
  available: '\u0627\u0644\u0644\u0648\u062d\u0627\u062a \u0627\u0644\u0645\u062a\u0627\u062d\u0629',
  open: '\u0641\u062a\u062d \u0627\u0644\u0644\u0648\u062d\u0629',
  footer: '\u062c\u0627\u0645\u0639\u0629 \u0627\u0644\u0632\u0631\u0642\u0627\u0621 \u00b7 \u0644\u0648\u062d\u0627\u062a \u0627\u0644\u0645\u0624\u0634\u0631\u0627\u062a',
}

const dashboards = [
  {
    page: 'gates' as const,
    title: copy.gatesTitle,
    description: copy.gatesDescription,
    icon: DoorOpen,
    className: 'home-gates',
    tags: copy.gatesTags,
  },
  {
    page: 'registration' as const,
    title: copy.registrationTitle,
    description: copy.registrationDescription,
    icon: GraduationCap,
    className: 'home-registration',
    tags: copy.registrationTags,
  },
]

export default function Home() {
  const [dark, setDark] = useState(() => localStorage.getItem('home-theme') === 'dark')
  const { displayMode, setDisplayMode, scale } = useDisplayMode()
  const logoutUrl = getApexLogoutUrl()
  useEffect(() => {
    document.title = copy.pageTitle
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('home-theme', dark ? 'dark' : 'light')
    return () => document.documentElement.classList.remove('dark')
  }, [dark])

  return <div className={`home-page${dark ? ' home-dark' : ''}${displayMode ? ' home-display-mode' : ''}`} dir="rtl" style={{ zoom: scale, minHeight: `${100 / scale}vh` }}>
    <header className="home-header">
      <div className="home-wrap home-header-inner">
        <div className="home-brand"><img src={logo} alt={copy.logoAlt} /><div><strong>{copy.university}</strong><span>{copy.system}</span></div></div>
        <div className="home-header-actions">
          <button type="button" className="home-theme" onClick={() => setDisplayMode(value => !value)} aria-label={displayMode ? 'إيقاف وضع الشاشة' : 'تشغيل وضع الشاشة'} title={displayMode ? 'إيقاف وضع الشاشة' : 'تشغيل وضع الشاشة'} aria-pressed={displayMode}><Monitor size={19} /></button>
          {logoutUrl && <a className="home-logout" href={logoutUrl} target="_top"><LogOut size={18} aria-hidden="true" /><span>{copy.logout}</span></a>}
          <button type="button" className="home-theme" onClick={() => setDark(value => !value)} aria-label={dark ? copy.light : copy.dark}>{dark ? <Sun size={19} /> : <Moon size={19} />}</button>
        </div>
      </div>
    </header>
    <main className="home-wrap home-main">
      <section className="home-intro" aria-labelledby="home-title">
        <span className="home-eyebrow"><span />{copy.eyebrow}</span>
        <h1 id="home-title">{copy.heading}</h1>
        <p>{copy.intro}</p>
      </section>
      <section className="home-dashboard-grid" aria-label={copy.available}>
        {dashboards.map(({ page, title, description, icon: Icon, className, tags }) => <a key={page} className={`home-dashboard-card ${className}`} href={dashboardHref(page)}>
          <span className="home-card-icon"><Icon size={28} strokeWidth={1.8} /></span>
          <span className="home-card-copy"><strong>{title}</strong><span>{description}</span></span>
          <span className="home-card-tags">{tags.map(tag => <small key={tag}>{tag}</small>)}</span>
          <span className="home-card-action">{copy.open} <ArrowLeft size={18} aria-hidden="true" /></span>
        </a>)}
      </section>
    </main>
    <footer className="home-footer home-wrap">{copy.footer}</footer>
  </div>
}
