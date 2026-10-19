import { describe, expect, it } from 'vitest'
import { assembleSessionProfile, isPlatformAdmin } from './sessionProfile'
import { canOpenPath } from './entitlements'

const OWNER = 'owner-1'
const STAFF = 'staff-1'
const OTHER = 'salon-b'

describe('assembleSessionProfile', () => {
  it('não promove admin por UUID ou perfil vazio', () => {
    expect(assembleSessionProfile(null, '9bcc70ad-16b6-4d91-b64d-28c44ba75795')).toBeNull()
    expect(isPlatformAdmin({ id: OWNER, is_admin: false })).toBe(false)
    expect(isPlatformAdmin({ is_admin: true })).toBe(true)
  })

  it('dona do salão só é admin se o banco marcar is_admin', () => {
    const p = assembleSessionProfile({ id: OWNER, is_admin: false, business_name: 'Studio' }, OWNER)
    expect(p.is_admin).toBe(false)
    expect(p.is_staff).toBe(false)
    expect(p.workspace_id).toBe(OWNER)
    expect(canOpenPath(p, '/admin')).toBe(false)
  })

  it('profissional herda o salão e nunca recebe is_admin', () => {
    const p = assembleSessionProfile(
      { id: STAFF, salon_owner_id: OWNER, is_admin: true, is_blocked: false },
      STAFF,
      { ownerRow: { business_name: 'Studio', is_admin: true, is_blocked: false }, staffMemberId: 'sm-1' },
    )
    expect(p.is_admin).toBe(false)
    expect(p.is_staff).toBe(true)
    expect(p.workspace_id).toBe(OWNER)
    expect(canOpenPath(p, '/admin')).toBe(false)
    expect(canOpenPath(p, '/configuracoes')).toBe(false)
    expect(canOpenPath(p, '/equipe')).toBe(false)
  })

  it('visitante sem perfil não abre o painel', () => {
    expect(canOpenPath(null, '/admin')).toBe(false)
  })

  it('salão B não vira workspace da profissional do salão A', () => {
    const p = assembleSessionProfile(
      { id: STAFF, salon_owner_id: OWNER },
      STAFF,
      { ownerRow: { id: OWNER } },
    )
    expect(p.workspace_id).not.toBe(OTHER)
    expect(p.salon_owner_id).toBe(OWNER)
  })
})
