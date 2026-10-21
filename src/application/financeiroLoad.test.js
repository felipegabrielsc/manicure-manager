import { beforeEach, describe, expect, it } from 'vitest'
import { indicadoresFinanceiros } from '../domain/financeiro.js'
import { toDateInputValue } from '../utils/dates.js'
import { limparCacheFinanceiro, CACHE_FINANCEIRO_MS, chaveFinanceiro, gravarCache, gravarSeAtual, invalidarFinanceiro, lerCache, versaoCache } from './financeiroCache.js'
import {
  buscarPrincipalFinanceiro,
  buscarSecundarioFinanceiro,
  COLUNAS,
  janelaFinanceira,
  montarLivro,
} from './financeiroLoad.js'
import {
  decidirSincronizacao,
  limparMemoriaSincronizacao,
  marcarFinanceiroSujo,
  marcarSincronizado,
  planejarCarregamento,
  precisaRecarregarAposSync,
  sincronizarControlada,
  SYNC_FINANCEIRO_MS,
} from './financeiroSync.js'
import { MEDICAO_INICIAL } from './financeiroTiming.js'
import { filtrarMovimentos, montarPainelFinanceiro } from './financeiroView.js'

const outubro = new Date(2026, 9, 15)

beforeEach(() => {
  limparCacheFinanceiro()
  limparMemoriaSincronizacao()
})

function cliente(resolver, atraso = 0) {
  const chamadas = []
  function chain(table) {
    const estado = { table, cols: '', filtros: [] }
    const api = {
      select(cols) {
        estado.cols = cols
        chamadas.push({ table, cols, op: 'select', em: performance.now() })
        return api
      },
      gte(col, val) {
        estado.filtros.push({ op: 'gte', col, val })
        chamadas.push({ table, op: 'gte', col, val, cols: estado.cols, em: performance.now() })
        return api
      },
      lte() { return api },
      eq(col, val) { estado.filtros.push({ op: 'eq', col, val }); return api },
      lt(col, val) { estado.filtros.push({ op: 'lt', col, val }); return api },
      in(col, ids) {
        chamadas.push({ table, op: 'in', col, tamanho: ids.length, filtros: estado.filtros.map((item) => ({ ...item })), em: performance.now() })
        return api
      },
      order() { return api },
      limit() { return api },
      maybeSingle() { return responder() },
      then(ok, fail) { return responder().then(ok, fail) },
    }
    function responder() {
      return new Promise((resolve) => {
        const entregar = () => resolve(resolver(estado) || { data: [], error: null })
        if (atraso) setTimeout(entregar, atraso)
        else entregar()
      })
    }
    return api
  }
  return {
    chamadas,
    from(table) { return chain(table) },
    rpc: async () => ({ data: { ok: true, appointments: 0 }, error: null }),
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
  }
}

function cobranca(id = 'c1') {
  return {
    id,
    user_id: 'salao-a',
    kind: 'ATENDIMENTO',
    competence_date: '2026-10-10',
    due_date: '2026-10-10',
    original_amount: 150,
    discount_amount: 0,
    recognizes_revenue: true,
    status: 'PARCIAL',
    description: 'Ana — Mão',
    service_name: 'Mão',
    staff_id: 'ana',
  }
}

function pagamento(overrides = {}) {
  return {
    id: 'p1',
    user_id: 'salao-a',
    charge_id: 'c1',
    amount: 100,
    method: 'PIX',
    entry_type: 'RECEBIMENTO',
    received_at: '2026-10-10T15:00:00-03:00',
    idempotency_key: 'k1',
    ...overrides,
  }
}

describe('medição inicial', () => {
  it('registra o caminho serial antigo e o caminho até a tela responder', () => {
    expect(MEDICAO_INICIAL.etapasSeriais).toContain('sincronizacao')
    expect(MEDICAO_INICIAL.etapasSeriais.indexOf('sincronizacao')).toBeLessThan(MEDICAO_INICIAL.etapasSeriais.indexOf('agenda'))
    expect(MEDICAO_INICIAL.caminhoAteInteragir).not.toContain('sincronizacao')
  })

  it('consulta o bloco principal junto, não uma etapa depois da outra', async () => {
    const atraso = 40
    const supabase = cliente(() => ({ data: [], error: null }), atraso)
    const inicio = performance.now()
    await buscarPrincipalFinanceiro(supabase, { dataAtual: outubro, temTabela: true })
    const gasto = performance.now() - inicio
    const selects = supabase.chamadas.filter((item) => item.op === 'select')
    const primeiros = selects.slice(0, 4)
    expect(primeiros.length).toBe(4)
    expect(Math.max(...primeiros.map((item) => item.em)) - Math.min(...primeiros.map((item) => item.em))).toBeLessThan(20)
    expect(gasto).toBeLessThan(atraso * 3)
  })
})

describe('sincronização', () => {
  it('não bloqueia a leitura na primeira abertura e pula quando acabou de conferir', () => {
    expect(decidirSincronizacao({ temTabela: false, workspaceId: 'salao-a' }).executar).toBe(false)
    const primeira = decidirSincronizacao({ temTabela: true, workspaceId: 'salao-a', agora: 1_000 })
    expect(primeira).toMatchObject({ executar: true, motivo: 'primeira', bloquearLeitura: false })
    marcarSincronizado('salao-a', 1_000)
    expect(decidirSincronizacao({ temTabela: true, workspaceId: 'salao-a', agora: 1_000 + 5_000 }).executar).toBe(false)
    expect(decidirSincronizacao({
      temTabela: true,
      workspaceId: 'salao-a',
      agora: 1_000 + SYNC_FINANCEIRO_MS,
    }).motivo).toBe('expirada')
    marcarFinanceiroSujo('salao-a')
    expect(decidirSincronizacao({ temTabela: true, workspaceId: 'salao-a', agora: 2_000 }).bloquearLeitura).toBe(true)
  })

  it('reusa a conferência que já está em andamento', async () => {
    let chamadas = 0
    let liberar
    const supabase = {
      rpc() {
        chamadas += 1
        return new Promise((resolve) => {
          liberar = () => resolve({ data: { ok: true, appointments: 2 }, error: null })
        })
      },
    }
    const primeira = sincronizarControlada(supabase, 'salao-a')
    const segunda = sincronizarControlada(supabase, 'salao-a')
    expect(segunda).toBe(primeira)
    liberar()
    const resultado = await primeira
    expect(chamadas).toBe(1)
    expect(precisaRecarregarAposSync(resultado)).toBe(true)
    expect(precisaRecarregarAposSync({ ok: true, appointments: 0 })).toBe(false)
    expect(precisaRecarregarAposSync({ ok: true, appointments: null })).toBe(true)
  })

  it('usa o cache fresco só quando a conferência não está pendente', () => {
    const fresco = { stale: false, valor: { livro: {} } }
    const recente = decidirSincronizacao({ temTabela: true, workspaceId: 'salao-a', agora: 5_000 })
    marcarSincronizado('salao-a', 5_000)
    const decidida = decidirSincronizacao({ temTabela: true, workspaceId: 'salao-a', agora: 5_000 })
    expect(planejarCarregamento({ cacheItem: fresco, decisao: decidida }).usarCache).toBe(true)
    expect(planejarCarregamento({ cacheItem: fresco, decisao: recente, sincronizando: true })).toMatchObject({
      usarCache: true,
      acompanharSync: true,
    })
    expect(planejarCarregamento({ cacheItem: { stale: true, valor: {} }, decisao: decidida }).usarCache).toBe(false)
  })
})

describe('cache por salão', () => {
  it('separa os meses e não entrega número antigo como se fosse atual', () => {
    const agora = 10_000
    gravarCache(chaveFinanceiro('salao-a', 2026, 9), { livro: 'outubro' }, agora)
    gravarCache(chaveFinanceiro('salao-b', 2026, 9), { livro: 'outro' }, agora)
    expect(lerCache(chaveFinanceiro('salao-a', 2026, 9), agora).valor.livro).toBe('outubro')
    expect(lerCache(chaveFinanceiro('salao-a', 2026, 9), agora + CACHE_FINANCEIRO_MS).stale).toBe(true)
    invalidarFinanceiro('salao-a')
    expect(lerCache(chaveFinanceiro('salao-a', 2026, 9), agora)).toBeNull()
    expect(lerCache(chaveFinanceiro('salao-b', 2026, 9), agora).valor.livro).toBe('outro')
  })

  it('uma escrita concorrente não grava de novo por cima da invalidação', () => {
    const chave = chaveFinanceiro('salao-a', 2026, 9)
    const versao = versaoCache(chave)
    invalidarFinanceiro('salao-a')
    expect(gravarSeAtual(chave, { livro: 'velho' }, Date.now(), versao)).toBe(false)
    expect(lerCache(chave)).toBeNull()
  })

  it('limpa os números ao trocar de sessão', () => {
    gravarCache(chaveFinanceiro('salao-a', 2026, 9), { livro: 'sigiloso' }, Date.now())
    marcarSincronizado('salao-a', Date.now())
    limparCacheFinanceiro()
    expect(lerCache(chaveFinanceiro('salao-a', 2026, 9))).toBeNull()
    expect(decidirSincronizacao({ temTabela: true, workspaceId: 'salao-a' }).motivo).toBe('primeira')
  })
})

describe('consultas do financeiro', () => {
  it('não pede staff_id em transactions', async () => {
    const colunas = COLUNAS.transacao.split(',').map((coluna) => coluna.trim())
    expect(colunas).not.toContain('staff_id')
    const supabase = cliente(() => ({ data: [], error: null }))
    await buscarPrincipalFinanceiro(supabase, { dataAtual: outubro, temTabela: true })
    await buscarSecundarioFinanceiro(supabase, {
      dataAtual: outubro,
      temTabela: true,
      agenda: [],
      workspaceId: 'salao-a',
    })
    const selects = supabase.chamadas.filter((item) => item.table === 'transactions' && item.op === 'select')
    expect(selects.length).toBeGreaterThanOrEqual(2)
    expect(selects.every((item) => item.cols === COLUNAS.transacao)).toBe(true)
  })

  it('pede só as colunas usadas e separa a janela da agenda da janela do gráfico', async () => {
    const supabase = cliente((estado) => {
      if (estado.table === 'financial_charges') return { data: [cobranca()], error: null }
      if (estado.table === 'financial_payments') return { data: [pagamento()], error: null }
      if (estado.table === 'transactions') {
        return { data: [{ id: 't1', user_id: 'salao-a', type: 'DESPESA', amount: 20, date: '2026-10-11', description: 'Algodão', category: 'despesa' }], error: null }
      }
      if (estado.table === 'commission_entries') {
        return { data: [{ id: 'k1', user_id: 'salao-a', staff_id: 'ana', staff_name: 'Ana', percent_applied: 40, base_amount: 150, amount_due: 60, status: 'PENDENTE', recognized_at: '2026-10-10' }], error: null }
      }
      return { data: [], error: null }
    })
    const resultado = await buscarPrincipalFinanceiro(supabase, { dataAtual: outubro, temTabela: true })
    const janela = janelaFinanceira(outubro)
    expect(janela.comparacaoDia).toBe('2026-09-01')
    expect(janela.graficoDia).toBe('2026-05-01')
    expect(supabase.chamadas.find((item) => item.table === 'appointments' && item.op === 'gte').val).toBe(janela.comparacaoIso)
    expect(supabase.chamadas.find((item) => item.table === 'financial_payments' && item.op === 'gte').val).toBe(janela.graficoIso)
    expect(supabase.chamadas.filter((item) => item.table === 'clients')).toHaveLength(0)
    expect(supabase.chamadas.filter((item) => item.op === 'select').every((item) => item.cols && !item.cols.includes('*'))).toBe(true)
    expect(Object.values(COLUNAS).every((cols) => !cols.includes('*'))).toBe(true)
    expect(resultado.persistido).toBe(true)
    expect(resultado.livro.charges).toHaveLength(1)
    expect(resultado.livro.payments).toHaveLength(1)
    expect(resultado.erros.comissao).toBeUndefined()
    const ind = indicadoresFinanceiros({ ...resultado.livro, from: '2026-10-01', to: '2026-10-31' })
    expect(ind.faturamento).toBe(150)
    expect(ind.recebimentos).toBe(100)
    expect(ind.contasAReceber).toBe(50)
    expect(ind.despesasPagas).toBe(20)
    expect(ind.resultadoCaixa).toBe(80)
    expect(ind.contasAPagar).toBe(60)
    expect(ind.resultadoOperacional).toBe(70)
  })

  it('fatura os recebimentos ligados em lotes e não deixa a comissão derrubar o caixa', async () => {
    const muitas = Array.from({ length: 81 }, (_, index) => cobranca(`c${index}`))
    const supabase = cliente((estado) => {
      if (estado.table === 'financial_charges') return { data: muitas, error: null }
      if (estado.table === 'financial_payments') return { data: [], error: null }
      if (estado.table === 'commission_entries') return { data: null, error: { message: 'comissão indisponível' } }
      return { data: [], error: null }
    })
    const resultado = await buscarPrincipalFinanceiro(supabase, { dataAtual: outubro, temTabela: true })
    const lotes = supabase.chamadas.filter((item) => item.op === 'in' && item.table === 'financial_payments')
    expect(lotes.map((item) => item.tamanho)).toEqual([80, 1])
    expect(resultado.livro.charges).toHaveLength(81)
    expect(resultado.erros.comissao).toMatch(/comissões/i)
    expect(resultado.erroPrincipal).toBe('')
  })

  it('não publica recebimentos pela metade quando a consulta de pagamentos falha', async () => {
    const supabase = cliente((estado) => {
      if (estado.table === 'financial_charges') return { data: [cobranca()], error: null }
      if (estado.table === 'financial_payments' && estado.cols.includes('received_at')) {
        return { data: null, error: { message: 'pagamentos fora' } }
      }
      return { data: [], error: null }
    })
    const resultado = await buscarPrincipalFinanceiro(supabase, { dataAtual: outubro, temTabela: true })
    expect(resultado.livro).toBeNull()
    expect(resultado.erroPrincipal).toMatch(/recebimentos/i)
  })

  it('mantém estorno, cancelamento, despesa e comissão paga nos indicadores', () => {
    const livro = montarLivro({
      temTabela: true,
      cobrancas: [
        cobranca(),
        { ...cobranca('c2'), status: 'CANCELADO', original_amount: 80, description: 'Cancelada' },
        { ...cobranca('c3'), kind: 'MENSALIDADE', original_amount: 250, status: 'PARCIAL', service_name: 'Mensalidade', description: 'Mensalidade — 10/2026' },
      ],
      pagamentos: [
        pagamento(),
        pagamento({ id: 'p2', charge_id: 'c1', amount: 50, method: 'DINHEIRO', idempotency_key: 'k2' }),
        pagamento({ id: 'p3', charge_id: 'c1', amount: 50, method: 'DINHEIRO', entry_type: 'ESTORNO', reversal_of: 'p2', idempotency_key: 'e2', received_at: '2026-10-20T12:00:00-03:00' }),
        pagamento({ id: 'p4', charge_id: 'c3', amount: 100, method: 'PIX', idempotency_key: 'm1' }),
      ],
      transacoes: [
        { id: 'd1', user_id: 'salao-a', type: 'DESPESA', amount: 30, date: '2026-10-12', description: 'Esmalte', category: 'despesa' },
        { id: 'd2', user_id: 'salao-a', type: 'DESPESA', amount: 60, date: '2026-10-12', description: 'Comissão', category: 'comissao', commission_entry_id: 'k-paga' },
        { id: 'd3', user_id: 'salao-a', type: 'DESPESA', amount: 10, date: '2026-10-12', description: 'Estorno', category: 'estorno' },
      ],
      comissoes: [
        { id: 'k-pendente', user_id: 'salao-a', staff_id: 'ana', staff_name: 'Ana', percent_applied: 40, base_amount: 150, amount_due: 60, status: 'PENDENTE', recognized_at: '2026-10-10' },
        { id: 'k-paga', user_id: 'salao-a', staff_id: 'bia', staff_name: 'Bia', percent_applied: 40, base_amount: 150, amount_due: 60, status: 'PAGO', recognized_at: '2026-10-10' },
      ],
    })
    const ind = indicadoresFinanceiros({ ...livro, from: '2026-10-01', to: '2026-10-31' })
    expect(ind.faturamento).toBe(350)
    expect(ind.recebimentos).toBe(200)
    expect(ind.contasAReceber).toBe(200)
    expect(ind.despesasPagas).toBe(90)
    expect(ind.despesasOperacionais).toBe(30)
    expect(ind.contasAPagar).toBe(60)
    expect(ind.resultadoCaixa).toBe(110)
    expect(ind.resultadoOperacional).toBe(200)
    const painel = montarPainelFinanceiro({
      livroBruto: livro,
      agendaJanela: [],
      dataAtual: outubro,
      metaMes: 400,
    })
    expect(painel.aPagar).toHaveLength(1)
    expect(painel.comissoesMes).toHaveLength(2)
    expect(painel.mensalidades[0].pending).toBe(150)
    const soPix = filtrarMovimentos(painel.movimentosTodos, { from: '2026-10-01', to: '2026-10-31', pagamento: 'PIX' })
    expect(soPix.every((item) => item.payment_method === 'PIX')).toBe(true)
    expect(painel.indicadores.recebimentos).toBe(200)
    const deOutro = montarPainelFinanceiro({
      livroBruto: livro,
      dataAtual: outubro,
      isStaff: true,
      staffMemberId: 'bia',
    })
    expect(deOutro.indicadores.faturamento).toBe(0)
    expect(deOutro.comissoesMes).toHaveLength(1)
  })
})

describe('carregamento secundário', () => {
  it('isola erro de auditoria e ainda monta equipe, meta e caixa', async () => {
    const supabase = cliente((estado) => {
      if (estado.table === 'staff_members') return { data: [{ id: 'ana', name: 'Ana' }], error: null }
      if (estado.table === 'financial_goals') return { data: { target_amount: 500 }, error: null }
      if (estado.table === 'financial_audit_log') return { data: null, error: { message: 'audit' } }
      if (estado.table === 'financial_payments') {
        return { data: [pagamento({ amount: 40, received_at: `${toDateInputValue()}T15:00:00-03:00` })], error: null }
      }
      return { data: [], error: null }
    })
    const secundario = await buscarSecundarioFinanceiro(supabase, {
      dataAtual: outubro,
      temTabela: true,
      agenda: [{ id: 1, status: 'CONCLUIDO', start_time: '2026-10-10T15:00:00', client_id: 'cli-1' }],
      workspaceId: 'salao-a',
    })
    expect(secundario.staffList[0].name).toBe('Ana')
    expect(secundario.metaMes).toBe(500)
    expect(secundario.erros.auditoria).toMatch(/auditoria/i)
    expect(secundario.caixaHoje.entradas).toBe(40)
    const historico = supabase.chamadas.find((item) => item.op === 'in' && item.table === 'appointments')
    expect(historico.filtros).toEqual(expect.arrayContaining([
      expect.objectContaining({ op: 'eq', col: 'status', val: 'CONCLUIDO' }),
    ]))
  })
})
