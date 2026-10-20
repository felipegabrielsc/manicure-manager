import { describe, expect, it } from 'vitest'
import { cancelPending } from './notificationService.js'

describe('notificationService', () => {
  it('cancela pending e sending ao remarcar', async () => {
    const seen = { statuses: null }
    const supabase = {
      from() {
        return {
          update() {
            return {
              eq() {
                return {
                  in(_field, values) {
                    seen.statuses = values
                    return Promise.resolve({ error: null })
                  },
                }
              },
            }
          },
        }
      },
    }
    const result = await cancelPending(supabase, { appointmentId: 1 })
    expect(result.ok).toBe(true)
    expect(seen.statuses).toEqual(['pending', 'sending'])
  })
})
