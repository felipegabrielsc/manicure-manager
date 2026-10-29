import { describe, expect, it } from 'vitest'
import {
  aplicarRecebimento,
  cancelarCobranca,
  civilDate,
  comSaldos,
  comissaoDevida,
  correcaoCobrancaAberta,
  derivarLivro,
  doWorkspace,
  estornarRecebimento,
  filtrarVisaoFinanceira,
  indicadoresFinanceiros,
  roundMoney,
  snapshotComissao,
} from './financeiro.js'

const outubro = { from: '2026-10-01', to: '2026-10-31' }

function charge(overrides = {}) {
  return {
    id: 'c1',
    kind: 'ATENDIMENTO',
    competenceDate: '2026-10-10',
    dueDate: '2026-10-10',
    originalAmount: 150,
    discountAmount: 0,
    countsAsRevenue: true,
    cancelled: false,
    staffId: 'ana',
    ...overrides,
  }
}

describe('dinheiro e datas', () => {
  it('arredonda centavos sem perder 0,1 + 0,2', () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3)
    expect(roundMoney(70.1 + 29.9)).toBe(100)
    expect(roundMoney('10,005')).toBe(10.01)
    expect(roundMoney(1.004)).toBe(1)
  })

  it('lê o dia civil em America/Sao_Paulo', () => {
    expect(civilDate('2026-10-01T02:30:00.000Z')).toBe('2026-09-30')
    expect(civilDate('2026-10-10')).toBe('2026-10-10')
  })
})

describe('cobrança separada do recebimento', () => {
  it('não duplica receita quando 150 entra em PIX e dinheiro', () => {
    let livro = { charges: [charge()], payments: [], expenses: [], commissions: [] }
    livro = aplicarRecebimento(livro, {
      id: 'p1', chargeId: 'c1', amount: 50, method: 'PIX', cashDate: '2026-10-10', idempotencyKey: 'pix-50',
    })
    livro = aplicarRecebimento(livro, {
      id: 'p2', chargeId: 'c1', amount: 100, method: 'DINHEIRO', cashDate: '2026-10-10', idempotencyKey: 'din-100',
    })
    const saldo = comSaldos(livro.charges, livro.payments)[0]
    const ind = indicadoresFinanceiros({ ...livro, ...outubro })
    expect(saldo.status).toBe('PAGO')
    expect(ind.faturamento).toBe(150)
    expect(ind.recebimentos).toBe(150)
    expect(ind.contasAReceber).toBe(0)
  })

  it('deixa parcial e pendente quando só entrou parte', () => {
    const livro = aplicarRecebimento(
      { charges: [charge()], payments: [], expenses: [], commissions: [] },
      { id: 'p1', chargeId: 'c1', amount: 50, method: 'PIX', cashDate: '2026-10-10', idempotencyKey: 'pix-50' },
    )
    const saldo = comSaldos(livro.charges, livro.payments)[0]
    const ind = indicadoresFinanceiros({ ...livro, ...outubro })
    expect(saldo.status).toBe('PARCIAL')
    expect(saldo.pending).toBe(100)
    expect(ind.faturamento).toBe(150)
    expect(ind.recebimentos).toBe(50)
    expect(ind.contasAReceber).toBe(100)
  })

  it('atendimento concluído sem recebimento não entra no caixa', () => {
    const livro = derivarLivro({
      appointments: [{
        id: 9,
        status: 'CONCLUIDO',
        payment_method: 'PENDENTE',
        agreed_price: 150,
        start_time: '2026-10-10T15:00:00.000Z',
        client_id: 1,
        clients: { name: 'Lia' },
        services: { name: 'Gel' },
      }],
    })
    const ind = indicadoresFinanceiros({ ...livro, ...outubro })
    expect(comSaldos(livro.charges, livro.payments)[0].status).toBe('PENDENTE')
    expect(ind.faturamento).toBe(150)
    expect(ind.recebimentos).toBe(0)
    expect(ind.contasAReceber).toBe(150)
  })

  it('separa competência de outubro e caixa de novembro', () => {
    const livro = {
      charges: [charge()],
      payments: [{
        id: 'p1', chargeId: 'c1', amount: 150, method: 'PIX', entryType: 'RECEBIMENTO', cashDate: '2026-11-02', idempotencyKey: 'k',
      }],
      expenses: [],
      commissions: [],
    }
    const out = indicadoresFinanceiros({ ...livro, ...outubro })
    const nov = indicadoresFinanceiros({ ...livro, from: '2026-11-01', to: '2026-11-30' })
    expect(out.faturamento).toBe(150)
    expect(out.recebimentos).toBe(0)
    expect(out.contasAReceber).toBe(0)
    expect(nov.faturamento).toBe(0)
    expect(nov.recebimentos).toBe(150)
  })

  it('estorna integralmente e cancela só sem saldo', () => {
    let livro = aplicarRecebimento(
      { charges: [charge()], payments: [], expenses: [], commissions: [] },
      { id: 'p1', chargeId: 'c1', amount: 150, method: 'PIX', cashDate: '2026-10-10', idempotencyKey: 'k' },
    )
    const bloqueado = cancelarCobranca(livro, 'c1')
    expect(bloqueado.error).toMatch(/Estorne/)
    livro = estornarRecebimento(livro, { paymentId: 'p1', cashDate: '2026-10-12', idempotencyKey: 'est-1' })
    expect(comSaldos(livro.charges, livro.payments)[0].status).toBe('ESTORNADO')
    const estornado = indicadoresFinanceiros({ ...livro, ...outubro })
    expect(estornado.faturamento).toBe(0)
    expect(estornado.recebimentos).toBe(0)
    livro = {
      charges: [charge()],
      payments: [],
      expenses: [],
      commissions: [],
    }
    livro = cancelarCobranca(livro, 'c1')
    expect(comSaldos(livro.charges, livro.payments)[0].status).toBe('CANCELADO')
    expect(indicadoresFinanceiros({ ...livro, ...outubro }).faturamento).toBe(0)
  })

  it('ignora a mesma chave de recebimento repetida', () => {
    const base = { charges: [charge()], payments: [], expenses: [], commissions: [] }
    const payment = { id: 'p1', chargeId: 'c1', amount: 150, method: 'PIX', cashDate: '2026-10-10', idempotencyKey: 'mesma' }
    const once = aplicarRecebimento(base, payment)
    const twice = aplicarRecebimento(once, payment)
    expect(twice.duplicated).toBe(true)
    expect(twice.payments).toHaveLength(1)
    expect(indicadoresFinanceiros({ ...twice, ...outubro }).recebimentos).toBe(150)
  })
})

describe('mensalidades', () => {
  const ana = {
    id: 7,
    name: 'Ana',
    type: 'MENSALISTA',
    phone: '16999990000',
    monthly_fee: 250,
    monthly_due_day: 10,
    monthly_due_offset: 0,
  }

  it('mostra parcial sem mudar a competência', () => {
    const livro = derivarLivro({
      viewDate: new Date(2026, 9, 1),
      clients: [ana],
      appointments: [],
      transactions: [{
        id: 't1', client_id: 7, type: 'RECEITA', category: 'mensalidade', amount: 100, date: '2026-10-11', payment_method: 'PIX', description: 'Mensalidade Ana',
      }],
    })
    const cobranca = comSaldos(livro.charges, livro.payments)[0]
    expect(cobranca.competenceDate).toBe('2026-10-01')
    expect(cobranca.status).toBe('PARCIAL')
    expect(cobranca.liquido).toBe(250)
    expect(cobranca.received).toBe(100)
    expect(cobranca.pending).toBe(150)
  })

  it('aceita pagamento antecipado e atrasado na mesma cobrança', () => {
    const cedo = derivarLivro({
      viewDate: new Date(2026, 9, 1),
      clients: [ana],
      transactions: [{
        id: 't1', client_id: 7, type: 'RECEITA', category: 'mensalidade', amount: 250, date: '2026-09-20', payment_method: 'PIX',
      }],
    })
    expect(cedo.charges[0].competenceDate).toBe('2026-10-01')
    expect(comSaldos(cedo.charges, cedo.payments)[0].status).toBe('PAGO')
    expect(indicadoresFinanceiros({ ...cedo, from: '2026-09-01', to: '2026-09-30' }).recebimentos).toBe(250)
    expect(indicadoresFinanceiros({ ...cedo, ...outubro }).faturamento).toBe(250)
    expect(indicadoresFinanceiros({ ...cedo, ...outubro }).recebimentos).toBe(0)

    const tarde = derivarLivro({
      viewDate: new Date(2026, 9, 1),
      clients: [ana],
      transactions: [{
        id: 't2', client_id: 7, type: 'RECEITA', category: 'mensalidade', amount: 250, date: '2026-11-04', payment_method: 'DINHEIRO',
      }],
    })
    expect(tarde.charges[0].competenceDate).toBe('2026-10-01')
    expect(comSaldos(tarde.charges, tarde.payments)[0].status).toBe('PAGO')
    expect(indicadoresFinanceiros({ ...tarde, from: '2026-11-01', to: '2026-11-30' }).recebimentos).toBe(250)
  })

  it('sem valor fixo soma o preço do serviço e fica a receber', () => {
    const livro = derivarLivro({
      appointments: [{
        id: 3,
        status: 'CONCLUIDO',
        payment_method: 'MENSALIDADE',
        agreed_price: 0,
        start_time: '2026-10-10T15:00:00.000Z',
        client_id: 7,
        clients: { id: 7, name: 'Ana', type: 'MENSALISTA', monthly_due_day: 10, monthly_due_offset: 1 },
        services: { name: 'Gel', default_price: 80 },
      }],
    })
    const saldo = comSaldos(livro.charges, livro.payments)[0]
    const ind = indicadoresFinanceiros({ ...livro, ...outubro })
    expect(saldo.kind).toBe('MENSALIDADE')
    expect(saldo.status).toBe('PENDENTE')
    expect(saldo.liquido).toBe(80)
    expect(saldo.pending).toBe(80)
    expect(ind.faturamento).toBe(80)
    expect(ind.recebimentos).toBe(0)
    expect(ind.contasAReceber).toBe(80)
  })

  it('ainda não recebi usa o preço do serviço e não cancela a conta', () => {
    const livro = derivarLivro({
      appointments: [{
        id: 4,
        status: 'CONCLUIDO',
        payment_method: 'PENDENTE',
        agreed_price: 0,
        start_time: '2026-10-10T15:00:00.000Z',
        client_id: 8,
        clients: { name: 'Lia' },
        services: { name: 'Gel', default_price: 90 },
      }],
    })
    const saldo = comSaldos(livro.charges, livro.payments)[0]
    const ind = indicadoresFinanceiros({ ...livro, ...outubro })
    expect(saldo.kind).toBe('ATENDIMENTO')
    expect(saldo.status).toBe('PENDENTE')
    expect(saldo.pending).toBe(90)
    expect(ind.recebimentos).toBe(0)
    expect(ind.contasAReceber).toBe(90)
  })
})

describe('correção de cobrança aberta', () => {
  const visita = {
    id: 9,
    status: 'CONCLUIDO',
    payment_method: 'MENSALIDADE',
    agreed_price: 0,
    start_time: '2026-10-10T15:00:00.000Z',
    client_id: 7,
    clients: { monthly_fee: 0 },
    services: { default_price: 80 },
  }

  it('reabre mensalidade marcada como paga sem dinheiro recebido', () => {
    const patch = correcaoCobrancaAberta({
      id: 'm1',
      kind: 'MENSALIDADE',
      status: 'PAGO',
      original_amount: 0,
      recognizes_revenue: false,
      cancelled_at: null,
      client_id: 7,
      competence_date: '2026-10-01',
    }, [visita], [])
    expect(patch).toMatchObject({
      status: 'PENDENTE',
      recognizes_revenue: true,
      original_amount: 80,
      cancelled_at: null,
    })
  })

  it('não mexe em mensalidade que já teve recebimento', () => {
    const patch = correcaoCobrancaAberta({
      id: 'm1',
      kind: 'MENSALIDADE',
      status: 'PAGO',
      original_amount: 80,
      recognizes_revenue: true,
      client_id: 7,
      competence_date: '2026-10-01',
    }, [visita], [{ charge_id: 'm1', amount: 80, entry_type: 'RECEBIMENTO' }])
    expect(patch).toBeNull()
  })

  it('desfaz cancelamento de ainda não recebi enquanto a visita segue concluída', () => {
    const patch = correcaoCobrancaAberta({
      id: 'a1',
      kind: 'ATENDIMENTO',
      appointment_id: 4,
      status: 'CANCELADO',
      cancelled_at: '2026-10-10T18:00:00.000Z',
      original_amount: 90,
      recognizes_revenue: false,
      client_id: 8,
    }, [{
      id: 4,
      status: 'CONCLUIDO',
      payment_method: 'PENDENTE',
      agreed_price: 90,
      client_id: 8,
    }], [])
    expect(patch.status).toBe('PENDENTE')
    expect(patch.cancelled_at).toBeNull()
    expect(patch.recognizes_revenue).toBe(true)
  })

  it('não reabre cobrança cancelada pela dona', () => {
    const patch = correcaoCobrancaAberta({
      id: 'm1',
      kind: 'MENSALIDADE',
      status: 'CANCELADO',
      cancelled_manually: true,
      original_amount: 80,
      client_id: 7,
      competence_date: '2026-10-01',
    }, [visita], [])
    expect(patch).toBeNull()
  })
})

describe('comissões e indicadores', () => {
  it('mantém a comissão histórica quando o percentual muda', () => {
    const historica = snapshotComissao({
      appointmentId: 4,
      staffId: 'ana',
      staffName: 'Ana',
      percent: 40,
      baseAmount: 120,
      recognizedAt: '2026-10-10',
    })
    expect(historica.amountDue).toBe(48)
    const depois = comissaoDevida({ historica, percentualAtual: 45, baseAmount: 120 })
    expect(depois.amountDue).toBe(48)
    expect(depois.percentApplied).toBe(40)
  })

  it('não subtrai comissão duas vezes e separa caixa de competência', () => {
    const livro = {
      charges: [charge({ originalAmount: 1000 })],
      payments: [{ id: 'p', chargeId: 'c1', amount: 1000, entryType: 'RECEBIMENTO', cashDate: '2026-10-10', method: 'PIX' }],
      expenses: [
        { id: 'aluguel', amount: 200, cashDate: '2026-10-05', category: 'despesa' },
        { id: 'comissao-paga', amount: 100, cashDate: '2026-10-20', category: 'comissao', commissionEntryId: 'com-1' },
        { id: 'imposto', amount: 50, cashDate: '2026-10-21', category: 'imposto' },
      ],
      commissions: [{
        id: 'com-1', staffId: 'ana', amountDue: 100, status: 'PAGO', recognizedAt: '2026-10-10', percentApplied: 10, baseAmount: 1000,
      }],
    }
    const ind = indicadoresFinanceiros({ ...livro, ...outubro })
    expect(ind.faturamento).toBe(1000)
    expect(ind.despesasPagas).toBe(350)
    expect(ind.resultadoCaixa).toBe(650)
    expect(ind.resultadoOperacional).toBe(650)
    expect(ind.contasAPagar).toBe(0)
  })

  it('comissão pendente reduz o operacional e não o caixa', () => {
    const ind = indicadoresFinanceiros({
      charges: [charge({ originalAmount: 1000 })],
      payments: [{ id: 'p', chargeId: 'c1', amount: 1000, entryType: 'RECEBIMENTO', cashDate: '2026-10-10', method: 'PIX' }],
      expenses: [{ id: 'aluguel', amount: 200, cashDate: '2026-10-05', category: 'despesa' }],
      commissions: [{ id: 'com-1', amountDue: 100, status: 'PENDENTE', recognizedAt: '2026-10-10' }],
      ...outubro,
    })
    expect(ind.resultadoCaixa).toBe(800)
    expect(ind.resultadoOperacional).toBe(700)
    expect(ind.contasAPagar).toBe(100)
  })

  it('profissional não vê despesa nem comissão de outra pessoa', () => {
    const visao = filtrarVisaoFinanceira({
      isStaff: true,
      staffId: 'ana',
      charges: [charge({ staffId: 'ana' }), charge({ id: 'c2', staffId: 'bia' })],
      payments: [
        { id: 'p1', chargeId: 'c1', amount: 10 },
        { id: 'p2', chargeId: 'c2', amount: 99 },
      ],
      expenses: [{ id: 'e', amount: 40 }],
      commissions: [
        { id: 'a', staffId: 'ana', amountDue: 4 },
        { id: 'b', staffId: 'bia', amountDue: 9 },
      ],
    })
    expect(visao.charges.map((item) => item.id)).toEqual(['c1'])
    expect(visao.payments.map((item) => item.id)).toEqual(['p1'])
    expect(visao.expenses).toEqual([])
    expect(visao.commissions.map((item) => item.id)).toEqual(['a'])
  })

  it('não mistura lançamentos de outro salão', () => {
    const rows = doWorkspace([
      { id: 1, userId: 'salao-a' },
      { id: 2, userId: 'salao-b' },
    ], 'salao-a')
    expect(rows.map((row) => row.id)).toEqual([1])
  })
})
