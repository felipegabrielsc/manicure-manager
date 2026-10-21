import { describe, expect, it } from 'vitest'
import { absenceRate, buildSalonReport, occupancyRate, resumoDoDia, retentionRate, revenueByService } from './salonReports.js'

describe('relatórios do salão', () => {
  it('calcula ocupação, falta e retorno', () => {
    expect(occupancyRate({ bookedMinutes: 120, openMinutes: 240 })).toBe(50)
    expect(absenceRate({ faltou: 1, total: 4 })).toBe(25)
    expect(retentionRate({ returningClients: 2, totalClients: 5 })).toBe(40)
  })

  it('agrupa faturamento por serviço', () => {
    const rows = revenueByService([
      { status: 'CONCLUIDO', agreed_price: 80, payment_method: 'PIX', services: { name: 'Gel' } },
      { status: 'CONCLUIDO', agreed_price: 40, payment_method: 'PIX', services: { name: 'Pé' } },
      { status: 'CONCLUIDO', agreed_price: 80, payment_method: 'PACOTE', services: { name: 'Gel' } },
      { status: 'FALTOU', agreed_price: 80, services: { name: 'Gel' } },
    ])
    expect(rows[0]).toEqual({ name: 'Gel', amount: 80, count: 1 })
    expect(rows[1]).toEqual({ name: 'Pé', amount: 40, count: 1 })
  })

  it('resume o dia: caixa e próximo horário', () => {
    const now = new Date('2026-10-19T14:00:00')
    const resumo = resumoDoDia({
      now,
      appointments: [
        { status: 'CONCLUIDO', agreed_price: 90, payment_method: 'PIX', start_time: '2026-10-19T10:00:00' },
        { status: 'CONCLUIDO', agreed_price: 50, payment_method: 'PENDENTE', start_time: '2026-10-19T11:00:00' },
        { status: 'AGENDADO', agreed_price: 80, start_time: '2026-10-19T15:00:00', clients: { name: 'Ana' } },
        { status: 'CANCELADO', agreed_price: 80, start_time: '2026-10-19T16:00:00' },
      ],
    })
    expect(resumo.caixa).toBe(90)
    expect(resumo.proximos).toBe(1)
    expect(resumo.proximo.clients.name).toBe('Ana')
  })

  it('monta o painel comercial do mês', () => {
    const report = buildSalonReport([
      { status: 'CONCLUIDO', client_id: 1, agreed_price: 80, payment_method: 'PIX', services: { name: 'Gel', duration_minutes: 60 } },
      { status: 'CONCLUIDO', client_id: 1, agreed_price: 80, payment_method: 'PIX', services: { name: 'Gel', duration_minutes: 60 } },
      { status: 'FALTOU', client_id: 2, agreed_price: 80, services: { name: 'Pé', duration_minutes: 60 } },
    ])
    expect(report.atendimentos).toBe(2)
    expect(report.ausencias).toBe(1)
    expect(report.retorno).toBe(100)
    expect(report.servicos[0].name).toBe('Gel')
  })
})
