import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, Navigate } from 'react-router-dom'
import {
  Calendar,
  User,
  Scissors,
  Package,
  Gift,
  Users,
  DollarSign,
  Crown,
  Settings,
  ShieldCheck,
  LogOut,
  Menu,
  X,
  Plus,
} from 'lucide-react'
import { supabase } from '../supabaseClient'
import { useSessionProfile } from '../context/SessionProfile'
import { hasFeature, FEATURE_BY_PATH } from '../utils/entitlements'
import PlanGate from './PlanGate'
import { isSiteOwnerId } from '../utils/siteOwner'

const NAV_ITEMS = [
  { to: '/', label: 'Agenda', icon: Calendar, id: 'nav-agenda', end: true },
  { to: '/clientes', label: 'Clientes', icon: User, id: 'nav-clientes' },
  { to: '/servicos', label: 'Serviços', icon: Scissors, id: 'nav-servicos' },
  { to: '/estoque', label: 'Estoque', icon: Package, id: 'nav-estoque' },
  { to: '/fidelidade', label: 'Fidelidade', icon: Gift, id: 'nav-fidelidade' },
  { to: '/equipe', label: 'Equipe', icon: Users, id: 'nav-equipe' },
  { to: '/financeiro', label: 'Financeiro', icon: DollarSign, id: 'nav-financeiro' },
  { to: '/planos', label: 'Planos', icon: Crown, id: 'nav-planos' },
  { to: '/configuracoes', label: 'Configurações', icon: Settings, id: 'nav-config' },
]

const STAFF_HIDDEN = new Set(['/equipe', '/planos', '/configuracoes'])

const TITLES = {
  '/': 'Agenda',
  '/novo': 'Novo agendamento',
  '/clientes': 'Clientes',
  '/servicos': 'Serviços',
  '/estoque': 'Estoque',
  '/fidelidade': 'Fidelidade',
  '/equipe': 'Equipe',
  '/financeiro': 'Financeiro',
  '/planos': 'Planos',
  '/configuracoes': 'Configurações',
  '/admin': 'Administração',
}

export default function AppLayout() {
  const location = useLocation()
  const { profile } = useSessionProfile()
  const isStaff = !!profile?.is_staff
  const [adminFromDb, setAdminFromDb] = useState(false)
  const [loginEmail, setLoginEmail] = useState('')
  const [menuAberto, setMenuAberto] = useState(false)
  const isAdmin = !!profile?.is_admin || adminFromDb

  useEffect(() => {
    let cancelled = false
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      if (!cancelled) setLoginEmail(user.email || '')
      if (isSiteOwnerId(user.id)) {
        if (!cancelled) setAdminFromDb(true)
        return
      }
      const { data } = await supabase.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
      if (!cancelled) setAdminFromDb(!!data?.is_admin)
    })
    return () => { cancelled = true }
  }, [profile?.is_admin, location.pathname])

  useEffect(() => {
    setMenuAberto(false)
  }, [location.pathname])

  async function handleLogout() {
    if (!window.confirm('Sair da conta?')) return
    await supabase.auth.signOut()
    window.location.assign('/')
  }

  const titulo = TITLES[location.pathname] || 'Agenda Manicure'
  const mostrarNovo = location.pathname === '/'

  if (profile?.onboarding_done === false && !profile?.is_staff && !profile?.is_admin) {
    return <Navigate to="/onboarding" replace />
  }

  function renderNav(closeOnClick) {
    return (
      <>
        {NAV_ITEMS.filter(item => {
          if (isStaff && STAFF_HIDDEN.has(item.to)) return false
          const feature = FEATURE_BY_PATH[item.to]
          if (!feature) return true
          return hasFeature(profile, feature)
        }).map(item => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              id={item.id}
              end={item.end}
              className={({ isActive }) => `app-nav-link${isActive ? ' is-active' : ''}`}
              onClick={() => closeOnClick && setMenuAberto(false)}
            >
              <Icon size={20} strokeWidth={2} />
              <span>{item.label}</span>
            </NavLink>
          )
        })}
        {isAdmin && (
          <NavLink
            to="/admin"
            id="nav-admin"
            className={({ isActive }) => `app-nav-link${isActive ? ' is-active' : ''}`}
            onClick={() => closeOnClick && setMenuAberto(false)}
          >
            <ShieldCheck size={20} strokeWidth={2} />
            <span>Admin</span>
          </NavLink>
        )}
      </>
    )
  }

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="app-sidebar-brand">Agenda Manicure</div>
        <nav className="app-nav" id="menu-gestao">
          {renderNav(false)}
        </nav>
        <button type="button" className="app-nav-link app-nav-logout" onClick={handleLogout} id="btn-logout">
          <LogOut size={20} />
          <span>Sair</span>
        </button>
        {loginEmail ? (
          <div style={{ fontSize: '11px', color: '#64748b', padding: '8px 12px 0', wordBreak: 'break-all' }}>{loginEmail}</div>
        ) : null}
      </aside>

      <div className="app-main">
        <header className="app-topbar">
          <button
            type="button"
            className="app-icon-btn"
            aria-label="Abrir menu"
            onClick={() => setMenuAberto(true)}
          >
            <Menu size={22} />
          </button>
          <h1 className="app-topbar-title">{titulo}</h1>
          {mostrarNovo ? (
            <NavLink to="/novo" className="app-topbar-action" id="btn-novo-top">
              <Plus size={18} strokeWidth={2.5} />
              Novo
            </NavLink>
          ) : (
            <span className="app-topbar-spacer" />
          )}
        </header>

        <div className="app-content">
          <PlanGate />
          <Outlet />
        </div>
      </div>

      {menuAberto && (
        <div className="app-drawer-root">
          <button type="button" className="app-drawer-backdrop" aria-label="Fechar menu" onClick={() => setMenuAberto(false)} />
          <aside className="app-drawer">
            <div className="app-drawer-head">
              <strong>Menu</strong>
              <button type="button" className="app-icon-btn" aria-label="Fechar" onClick={() => setMenuAberto(false)}>
                <X size={20} />
              </button>
            </div>
            <nav className="app-nav">{renderNav(true)}</nav>
            <button type="button" className="app-nav-link app-nav-logout" onClick={handleLogout}>
              <LogOut size={20} />
              <span>Sair</span>
            </button>
            {loginEmail ? (
              <div style={{ fontSize: '11px', color: '#64748b', padding: '8px 12px 0', wordBreak: 'break-all' }}>{loginEmail}</div>
            ) : null}
          </aside>
        </div>
      )}
    </div>
  )
}
