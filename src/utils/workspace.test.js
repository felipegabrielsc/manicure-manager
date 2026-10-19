import { describe, expect, it } from 'vitest'
import { isStaffProfile, workspaceId } from './workspace.js'

describe('workspaceId', () => {
  it('dona usa o próprio id', () => {
    expect(workspaceId({ workspace_id: 'dona' }, 'dona')).toBe('dona')
    expect(workspaceId({}, 'dona')).toBe('dona')
    expect(workspaceId(null, 'dona')).toBe('dona')
  })

  it('profissional usa o salão', () => {
    expect(workspaceId({ workspace_id: 'dona', salon_owner_id: 'dona', is_staff: true }, 'pro')).toBe('dona')
    expect(workspaceId({ salon_owner_id: 'dona' }, 'pro')).toBe('dona')
  })

  it('sem sessão devolve null', () => {
    expect(workspaceId(null, null)).toBe(null)
    expect(isStaffProfile(null)).toBe(false)
    expect(isStaffProfile({ salon_owner_id: 'dona' })).toBe(true)
  })
})
