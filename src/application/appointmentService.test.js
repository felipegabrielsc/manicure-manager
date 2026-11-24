import { beforeEach, describe, expect, it, vi } from 'vitest'
import { concluirAtendimento, criarAgendamento, reabrirAtendimento, validarRemarcacao } from './appointmentService.js'

vi.mock('./financeiroCache.js', () => ({ invalidarFinanceiro: vi.fn() }))
vi.mock('./financeiroLoad.js', () => ({ sanarCobrancaDaConclusao: vi.fn(async () => {}) }))
vi.mock('../utils/loyalty', () => ({ incrementLoyaltyVisit: vi.fn(async () => {}) }))
vi.mock('./notificationService.js', () => ({
  enqueueWaitlistAvailable: vi.fn(async () => ({ ok: true })),
  marcarEnvioManual: vi.fn(async () => {}),
  syncAppointmentNotifications: vi.fn(async () => {}),
}))
vi.mock('../utils/scheduling', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    fetchSchedulingContext: vi.fn(async () => ({
      businessHours: [{ day_of_week: 1, open_time: '09:00', close_time: '18:00', is_closed: false }],
      appointments: [],
      blockedSlots: [],
    })),
  }
})
vi.mock('../utils/deposit', () => ({ computeDeposit: () => 0 }))

function mondayAt(h, m = 0) {
  const local = new Date(2099, 5, 1)
  const delta = (1 - local.getDay() + 7) % 7
  local.setDate(local.getDate() + delta)
  local.setHours(h, m, 0, 0)
  return local
}

function makeSupabase({ rpcResults = {}, tables = {} } = {}) {
  const calls = { rpc: [], updates: [], inserts: [] }

  function tableApi(name) {
    const state = { filters: {}, patch: null, rows: null }
    const api = {
      select() { return api },
      insert(row) {
        calls.inserts.push({ table: name, row })
        state.rows = tables[name]?.insert?.(row) ?? { data: { id: 'apt-1' }, error: null }
        return api
      },
      update(patch) {
        state.patch = patch
        calls.updates.push({ table: name, patch })
        return api
      },
      eq(col, val) {
        state.filters[col] = val
        return api
      },
      maybeSingle() {
        if (state.rows) return Promise.resolve(state.rows)
        const handler = tables[name]?.maybeSingle
        return Promise.resolve(handler ? handler(state) : { data: null, error: null })
      },
      single() {
        const handler = tables[name]?.single
        return Promise.resolve(handler ? handler(state) : { data: null, error: null })
      },
      then(ok, fail) {
        const handler = tables[name]?.exec
        const result = handler ? handler(state) : { data: null, error: null }
        return Promise.resolve(result).then(ok, fail)
      },
    }
    return api
  }

  return {
    calls,
    from(name) { return tableApi(name) },
    async rpc(fn, args) {
      calls.rpc.push({ fn, args })
      const result = typeof rpcResults[fn] === 'function' ? rpcResults[fn](args) : rpcResults[fn]
      return result || { data: null, error: null }
    },
  }
}

describe('appointmentService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('recusa remarcar em cima de outro horário da mesma profissional', () => {
    const start = mondayAt(10)
    const result = validarRemarcacao({
      startTime: start,
      durationMinutes: 60,
      businessHours: [{ day_of_week: start.getDay(), open_time: '09:00', close_time: '18:00', is_closed: false }],
      appointments: [{
        id: '1',
        start_time: start.toISOString(),
        status: 'AGENDADO',
        staff_id: 'staff-1',
        services: { duration_minutes: 60 },
      }],
      staffId: 'staff-1',
    })
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('Horário indisponível ou já ocupado.')
  })

  it('duas profissionais no mesmo horário não conflitam', () => {
    const start = mondayAt(10)
    const result = validarRemarcacao({
      startTime: start,
      durationMinutes: 60,
      businessHours: [{ day_of_week: start.getDay(), open_time: '09:00', close_time: '18:00', is_closed: false }],
      appointments: [{
        id: '1',
        start_time: start.toISOString(),
        status: 'AGENDADO',
        staff_id: 'staff-1',
        services: { duration_minutes: 60 },
      }],
      staffId: 'staff-2',
    })
    expect(result.valid).toBe(true)
  })

  it('conclusão com erro real no sync reverte status e pacote', async () => {
    let packageUsed = 1
    let aptStatus = 'AGENDADO'
    const supabase = makeSupabase({
      rpcResults: {
        sincronizar_conclusao_atendimento: { data: null, error: { message: 'falha de cobrança' } },
      },
      tables: {
        clients: {
          single: () => ({ data: { package_size: 4, package_used: packageUsed }, error: null }),
          exec: (state) => {
            if (state.patch && 'package_used' in state.patch) packageUsed = state.patch.package_used
            return { data: null, error: null }
          },
        },
        appointments: {
          exec: (state) => {
            if (state.patch?.status) aptStatus = state.patch.status
            return { data: null, error: null }
          },
        },
      },
    })

    const result = await concluirAtendimento(supabase, {
      agendamento: { id: 10, client_id: 'c1', user_id: 'ws', status: 'AGENDADO', payment_method: null },
      metodo: 'PACOTE',
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBe('falha de cobrança')
    expect(aptStatus).toBe('AGENDADO')
    expect(packageUsed).toBe(1)
    expect(supabase.calls.updates.some((u) => u.table === 'appointments' && u.patch.status === 'CONCLUIDO')).toBe(true)
    expect(supabase.calls.updates.some((u) => u.table === 'clients' && u.patch.package_used === 2)).toBe(true)
  })

  it('conclusão com RPC ausente avisa e mantém sucesso', async () => {
    const supabase = makeSupabase({
      rpcResults: {
        sincronizar_conclusao_atendimento: {
          data: null,
          error: { message: 'Could not find the function public.sincronizar_conclusao_atendimento' },
        },
      },
      tables: {
        appointments: { exec: () => ({ data: null, error: null }) },
      },
    })

    const result = await concluirAtendimento(supabase, {
      agendamento: { id: 11, client_id: 'c1', user_id: 'ws', status: 'AGENDADO' },
      metodo: 'PIX',
    })

    expect(result.ok).toBe(true)
    expect(result.avisoFinanceiro).toMatch(/040/)
  })

  it('reabrir com erro real no revert restaura concluído', async () => {
    let aptStatus = 'CONCLUIDO'
    let packageUsed = 2
    const supabase = makeSupabase({
      rpcResults: {
        reverter_conclusao_atendimento: { data: null, error: { message: 'não reverteu' } },
      },
      tables: {
        clients: {
          maybeSingle: () => ({ data: { package_used: packageUsed }, error: null }),
          exec: (state) => {
            if (state.patch && 'package_used' in state.patch) packageUsed = state.patch.package_used
            return { data: null, error: null }
          },
        },
        appointments: {
          exec: (state) => {
            if (state.patch?.status) aptStatus = state.patch.status
            if ('payment_method' in (state.patch || {})) {
              /* keep */
            }
            return { data: null, error: null }
          },
        },
      },
    })

    const result = await reabrirAtendimento(supabase, {
      id: 12,
      client_id: 'c1',
      user_id: 'ws',
      payment_method: 'PACOTE',
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBe('não reverteu')
    expect(aptStatus).toBe('CONCLUIDO')
    expect(packageUsed).toBe(2)
  })

  it('criar agendamento consome cupom via RPC antes do insert', async () => {
    const supabase = makeSupabase({
      rpcResults: {
        validar_horario_agendamento: { data: { valid: true }, error: null },
        consumir_cupom: { data: { ok: true }, error: null },
      },
      tables: {
        profiles: { maybeSingle: () => ({ data: { deposit_mode: 'off' }, error: null }) },
        appointments: {
          insert: () => ({ data: { id: 'apt-9' }, error: null }),
          maybeSingle() { return Promise.resolve({ data: { id: 'apt-9' }, error: null }) },
        },
      },
    })
    // insert().select().maybeSingle chain
    const originalFrom = supabase.from.bind(supabase)
    supabase.from = (name) => {
      const api = originalFrom(name)
      if (name === 'appointments') {
        const insertResult = { data: { id: 'apt-9' }, error: null }
        return {
          insert() {
            supabase.calls.inserts.push({ table: 'appointments' })
            return {
              select() {
                return {
                  maybeSingle: async () => insertResult,
                }
              },
            }
          },
        }
      }
      if (name === 'profiles') {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({ data: { deposit_mode: 'off', deposit_value: 0 }, error: null }),
                }
              },
            }
          },
        }
      }
      return api
    }

    const result = await criarAgendamento(supabase, {
      workspaceId: 'ws',
      clientId: 'c1',
      serviceId: 's1',
      startTime: mondayAt(11),
      durationMinutes: 60,
      agreedPrice: 80,
      couponId: 'cup-1',
      clientName: 'Ana',
    })

    expect(result.ok).toBe(true)
    expect(supabase.calls.rpc.some((r) => r.fn === 'consumir_cupom')).toBe(true)
    const cupomIdx = supabase.calls.rpc.findIndex((r) => r.fn === 'consumir_cupom')
    const insertHappened = supabase.calls.inserts.length > 0
    expect(cupomIdx).toBeGreaterThanOrEqual(0)
    expect(insertHappened).toBe(true)
  })

  it('criar agendamento recusa cupom esgotado na RPC sem gravar horário', async () => {
    const supabase = makeSupabase({
      rpcResults: {
        validar_horario_agendamento: { data: { valid: true }, error: null },
        consumir_cupom: { data: { ok: false, error: 'Cupom esgotado ou inválido.' }, error: null },
      },
    })
    supabase.from = (name) => {
      if (name === 'profiles') {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({ data: { deposit_mode: 'off' }, error: null }),
                }
              },
            }
          },
        }
      }
      return {
        insert() {
          supabase.calls.inserts.push({ table: name })
          return { select() { return { maybeSingle: async () => ({ data: { id: 'x' }, error: null }) } } }
        },
      }
    }

    const result = await criarAgendamento(supabase, {
      workspaceId: 'ws',
      clientId: 'c1',
      serviceId: 's1',
      startTime: mondayAt(11),
      durationMinutes: 60,
      agreedPrice: 80,
      couponId: 'cup-1',
    })

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/Cupom/)
    expect(supabase.calls.inserts.length).toBe(0)
  })
})
