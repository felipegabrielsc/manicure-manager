import { describe, expect, it } from 'vitest'
import {
  classifySendResult,
  recoverStuckRows,
  tryClaim,
  isStuckSending,
} from './dispatchPolicy.js'

describe('dispatchPolicy', () => {
  it('recupera sending parado há mais de 5 minutos', () => {
    const now = new Date('2026-10-19T12:00:00.000Z')
    const stuck = {
      id: '1',
      status: 'sending',
      updated_at: '2026-10-19T11:50:00.000Z',
    }
    const fresh = {
      id: '2',
      status: 'sending',
      updated_at: '2026-10-19T11:58:00.000Z',
    }
    expect(isStuckSending(stuck, now)).toBe(true)
    expect(isStuckSending(fresh, now)).toBe(false)
    const recovered = recoverStuckRows([stuck, fresh], now)
    expect(recovered[0].status).toBe('pending')
    expect(recovered[0].error_message).toBe('recovered_stuck_sending')
    expect(recovered[1].status).toBe('sending')
  })

  it('dois workers não enviam a mesma reserva', () => {
    const store = [{ id: 'n1', status: 'pending' }]
    expect(tryClaim(store, 'n1')).toBe(true)
    expect(tryClaim(store, 'n1')).toBe(false)
    expect(store[0].status).toBe('sending')
  })

  it('classifica enviado, retry e falha definitiva', () => {
    expect(classifySendResult({ ok: true }).outcome).toBe('sent')
    expect(classifySendResult({ ok: true, providerMessageId: null }).reason).toBe('ok_ambiguous')
    expect(classifySendResult({ ok: false, retry: true, error: 'gateway_down' }).outcome).toBe('retry')
    expect(classifySendResult({ ok: false, error: 'no_phone' }).outcome).toBe('failed')
    expect(classifySendResult({ ok: false, status: 409 }).outcome).toBe('sent')
  })
})
