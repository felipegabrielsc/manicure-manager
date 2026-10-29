import { monthRangeLocal, toDateInputValue } from '../utils/dates.js'
import { civilDate, correcaoCobrancaAberta, derivarLivro, indicadoresFinanceiros } from '../domain/financeiro.js'
import {
  mapCharge,
  mapCommission,
  mapExpense,
  mapPayment,
  uniqById,
} from './financeiroService.js'

export const LOTE_IDS = 80

export const COLUNAS = {
  agenda: 'id, status, agreed_price, start_time, client_id, payment_method, staff_id, user_id, deposit_amount, deposit_status, discount_applied, staff_members(name, commission_percent), clients(id, name, type, phone, monthly_fee, monthly_due_day, monthly_due_offset), services(name, duration_minutes, default_price)',
  agendaSemSinal: 'id, status, agreed_price, start_time, client_id, payment_method, staff_id, user_id, staff_members(name, commission_percent), clients(id, name, type, phone, monthly_fee, monthly_due_day, monthly_due_offset), services(name, duration_minutes, default_price)',
  agendaHoje: 'id, status, agreed_price, start_time, payment_method, staff_id, client_id, clients(name), services(name, default_price), staff_members(name, commission_percent)',
  transacao: 'id, user_id, type, category, amount, date, description, commission_entry_id, payment_method, inventory_item_id, quantity, charge_id, payment_id, client_id',
  cliente: 'id, name, phone, type, monthly_fee, monthly_due_day, monthly_due_offset',
  cobranca: 'id, user_id, kind, source_key, appointment_id, client_id, staff_id, service_name, description, competence_date, due_date, original_amount, discount_amount, recognizes_revenue, status, cancelled_at, cancelled_manually, visit_count, clients(name, phone), staff_members(name)',
  pagamento: 'id, user_id, charge_id, amount, method, reference, entry_type, reversal_of, received_at, idempotency_key',
  comissao: 'id, user_id, appointment_id, staff_id, staff_name, percent_applied, base_amount, amount_due, status, recognized_at',
  auditoria: 'id, entity, action, created_at',
  estoque: 'id, name, quantity, unit, sale_price',
  equipe: 'id, name',
}

export function fatiarIds(ids, tamanho = LOTE_IDS) {
  const lotes = []
  const lista = [...new Set((ids || []).filter(Boolean))]
  for (let i = 0; i < lista.length; i += tamanho) lotes.push(lista.slice(i, i + tamanho))
  return lotes
}

export function janelaFinanceira(dataAtual) {
  const periodo = monthRangeLocal(dataAtual)
  const inicioComparacao = new Date(dataAtual.getFullYear(), dataAtual.getMonth() - 1, 1)
  const inicioGrafico = new Date(dataAtual.getFullYear(), dataAtual.getMonth() - 5, 1)
  return {
    periodo,
    comparacaoDia: toDateInputValue(inicioComparacao),
    graficoDia: toDateInputValue(inicioGrafico),
    comparacaoIso: inicioComparacao.toISOString(),
    graficoIso: inicioGrafico.toISOString(),
    fimIso: periodo.end.toISOString(),
    fimDia: `${periodo.endDay}T23:59:59`,
  }
}

function medidorMudo() {
  return { async etapa(_nome, fn) { return fn() } }
}

async function ler(medidor, nome, consulta) {
  return medidor.etapa(nome, async () => {
    try {
      const res = await consulta()
      if (res?.error) return { ok: false, error: res.error.message || 'falha', data: res.data || [] }
      return { ok: true, data: res.data || [] }
    } catch (error) {
      return { ok: false, error: error?.message || 'falha', data: [] }
    }
  })
}

async function porIds(supabase, tabela, colunas, coluna, ids, refinar) {
  const lotes = fatiarIds(ids)
  if (!lotes.length) return { data: [], error: null }
  const respostas = await Promise.all(lotes.map((lote) => {
    let query = supabase.from(tabela).select(colunas)
    if (refinar) query = refinar(query)
    return query.in(coluna, lote)
  }))
  const falha = respostas.find((item) => item.error)
  if (falha?.error) return { data: [], error: falha.error }
  return { data: respostas.flatMap((item) => item.data || []), error: null }
}

async function buscarAgenda(supabase, inicioIso, fimIso) {
  let resposta = await supabase.from('appointments').select(COLUNAS.agenda).gte('start_time', inicioIso).lte('start_time', fimIso)
  if (resposta.error?.message?.includes('deposit_')) {
    resposta = await supabase.from('appointments').select(COLUNAS.agendaSemSinal).gte('start_time', inicioIso).lte('start_time', fimIso)
  }
  return resposta
}

export function montarLivro({ temTabela, agenda, transacoes, clientes, cobrancas, pagamentos, comissoes, viewDate }) {
  if (!temTabela) {
    return derivarLivro({
      appointments: agenda || [],
      transactions: transacoes || [],
      clients: clientes || [],
      viewDate,
    })
  }
  return {
    charges: (cobrancas || []).map(mapCharge),
    payments: (pagamentos || []).map(mapPayment),
    expenses: (transacoes || []).map(mapExpense).filter(Boolean),
    commissions: (comissoes || []).map(mapCommission),
  }
}

export async function sanarCobrancasAbertas(supabase, cobrancas, agenda, pagamentos) {
  const correcoes = []
  for (const row of cobrancas || []) {
    const patch = correcaoCobrancaAberta(row, agenda, pagamentos)
    if (patch) correcoes.push({ id: row.id, patch })
  }
  if (!correcoes.length) return cobrancas || []

  const gravadas = await Promise.all(correcoes.map(async (item) => {
    const { error } = await supabase.from('financial_charges').update(item.patch).eq('id', item.id)
    return error ? null : item
  }))
  const porId = new Map(gravadas.filter(Boolean).map((item) => [item.id, item.patch]))
  return (cobrancas || []).map((row) => (porId.has(row.id) ? { ...row, ...porId.get(row.id) } : row))
}

export async function sanarCobrancaDaConclusao(supabase, agendamento, metodo) {
  if (!agendamento?.id || (metodo !== 'MENSALIDADE' && metodo !== 'PENDENTE')) return
  const mes = civilDate(agendamento.start_time).slice(0, 7)
  let consulta = supabase.from('financial_charges').select('id, kind, status, original_amount, recognizes_revenue, cancelled_at, cancelled_manually, client_id, appointment_id, competence_date')
  consulta = metodo === 'MENSALIDADE'
    ? consulta.eq('source_key', `mensalidade:${agendamento.client_id}:${mes}`)
    : consulta.eq('appointment_id', agendamento.id)
  const { data, error } = await consulta.maybeSingle()
  if (error || !data) return
  const pagamentos = await supabase.from('financial_payments').select('id, charge_id, amount, entry_type').eq('charge_id', data.id)
  const visita = {
    ...agendamento,
    status: 'CONCLUIDO',
    payment_method: metodo,
  }
  const patch = correcaoCobrancaAberta(data, [visita], pagamentos.data || [])
  if (!patch) return
  await supabase.from('financial_charges').update(patch).eq('id', data.id)
}

export async function buscarPrincipalFinanceiro(supabase, { dataAtual, temTabela, medidor = medidorMudo() }) {
  const janela = janelaFinanceira(dataAtual)
  const inicioAgenda = temTabela ? janela.comparacaoIso : janela.graficoIso
  const inicioTransacao = temTabela ? janela.comparacaoDia : janela.graficoDia
  const erros = {}

  const tarefas = [
    ler(medidor, 'agenda', () => buscarAgenda(supabase, inicioAgenda, janela.fimIso)),
    ler(medidor, 'transacoes', () => supabase.from('transactions').select(COLUNAS.transacao).gte('date', inicioTransacao).lte('date', janela.fimDia)),
  ]
  if (temTabela) {
    tarefas.push(
      ler(medidor, 'cobrancas-competencia', () => supabase.from('financial_charges').select(COLUNAS.cobranca).gte('competence_date', janela.comparacaoDia).lte('competence_date', janela.periodo.endDay)),
      ler(medidor, 'cobrancas-vencimento', () => supabase.from('financial_charges').select(COLUNAS.cobranca).gte('due_date', janela.periodo.startDay).lte('due_date', janela.periodo.endDay)),
      ler(medidor, 'pagamentos', () => supabase.from('financial_payments').select(COLUNAS.pagamento).gte('received_at', janela.graficoIso).lte('received_at', janela.fimIso)),
      ler(medidor, 'comissoes', () => supabase.from('commission_entries').select(COLUNAS.comissao).gte('recognized_at', janela.periodo.startDay).lte('recognized_at', janela.periodo.endDay)),
    )
  } else {
    tarefas.push(ler(medidor, 'clientes', () => supabase.from('clients').select(COLUNAS.cliente).eq('type', 'MENSALISTA')))
  }

  const respostas = await Promise.all(tarefas)
  const porNome = Object.fromEntries(respostas.map((item, index) => {
    const nome = [
      'agenda',
      'transacoes',
      temTabela ? 'cobrancas-competencia' : 'clientes',
      'cobrancas-vencimento',
      'pagamentos',
      'comissoes',
    ][index]
    return [nome, item]
  }))

  const agenda = (porNome.agenda?.ok && porNome.agenda.data) || []
  const transacoes = (porNome.transacoes?.ok && porNome.transacoes.data) || []
  if (!porNome.agenda?.ok) erros.agenda = 'Não consegui ler a agenda do período.'
  if (!porNome.transacoes?.ok) erros.despesas = 'Não consegui ler as despesas. O resultado de caixa pode estar incompleto.'

  if (!temTabela) {
    return {
      livro: montarLivro({
        temTabela: false,
        agenda,
        transacoes,
        clientes: porNome.clientes?.data || [],
        viewDate: dataAtual,
      }),
      agenda,
      persistido: false,
      erroPrincipal: erros.agenda || '',
      erros,
    }
  }

  const competencia = porNome['cobrancas-competencia']
  const vencimento = porNome['cobrancas-vencimento']
  const pagamentos = porNome.pagamentos
  if (!competencia?.ok || !vencimento?.ok) {
    return {
      livro: montarLivro({ temTabela: false, agenda, transacoes, clientes: [], viewDate: dataAtual }),
      agenda,
      persistido: false,
      erroPrincipal: 'Não consegui ler as cobranças novas. Os números seguem o cálculo da agenda.',
      erros,
    }
  }
  if (!pagamentos?.ok) {
    return {
      livro: null,
      agenda,
      persistido: true,
      erroPrincipal: 'Não consegui ler os recebimentos.',
      erros,
    }
  }
  if (!porNome.comissoes?.ok) {
    erros.comissao = 'Não consegui ler as comissões. O resultado operacional pode estar incompleto.'
  }

  let cobrancas = uniqById([...(competencia.data || []), ...(vencimento.data || [])])
  let linhasPagamento = pagamentos.data || []
  const ligados = await ler(medidor, 'pagamentos-ligados', () => porIds(
    supabase,
    'financial_payments',
    COLUNAS.pagamento,
    'charge_id',
    cobrancas.map((charge) => charge.id),
  ))
  if (!ligados.ok) {
    return {
      livro: null,
      agenda,
      persistido: true,
      erroPrincipal: 'Não consegui ler os recebimentos das cobranças.',
      erros,
    }
  }
  linhasPagamento = uniqById([...linhasPagamento, ...ligados.data])
  const presentes = new Set(cobrancas.map((charge) => charge.id))
  const faltantes = linhasPagamento.map((payment) => payment.charge_id).filter((id) => id && !presentes.has(id))
  if (faltantes.length) {
    const extra = await ler(medidor, 'cobrancas-faltantes', () => porIds(
      supabase,
      'financial_charges',
      COLUNAS.cobranca,
      'id',
      faltantes,
    ))
    if (!extra.ok) {
      return {
        livro: null,
        agenda,
        persistido: true,
        erroPrincipal: 'Não consegui completar as cobranças dos recebimentos.',
        erros,
      }
    }
    cobrancas = uniqById([...cobrancas, ...extra.data])
  }

  cobrancas = await sanarCobrancasAbertas(supabase, cobrancas, agenda, linhasPagamento)

  return {
    livro: montarLivro({
      temTabela: true,
      transacoes,
      cobrancas,
      pagamentos: linhasPagamento,
      comissoes: porNome.comissoes?.data || [],
    }),
    agenda,
    persistido: true,
    erroPrincipal: '',
    erros,
  }
}

export async function buscarSecundarioFinanceiro(supabase, {
  dataAtual,
  temTabela,
  agenda = [],
  workspaceId,
  medidor = medidorMudo(),
}) {
  const janela = janelaFinanceira(dataAtual)
  const erros = {}
  const hoje = toDateInputValue()
  const hojeIni = new Date()
  hojeIni.setHours(0, 0, 0, 0)
  const hojeFim = new Date()
  hojeFim.setHours(23, 59, 59, 999)
  const doMes = (agenda || []).filter((item) => {
    const dia = new Date(item.start_time)
    return dia >= janela.periodo.start && dia <= janela.periodo.end && item.status === 'CONCLUIDO'
  })
  const idsClientes = [...new Set(doMes.map((item) => item.client_id).filter(Boolean))]

  const tarefas = [
    ler(medidor, 'equipe', () => supabase.from('staff_members').select(COLUNAS.equipe).eq('active', true).order('name')),
    ler(medidor, 'estoque', () => supabase.from('inventory_items').select(COLUNAS.estoque).order('name')),
    ler(medidor, 'agenda-hoje', () => supabase.from('appointments').select(COLUNAS.agendaHoje).gte('start_time', hojeIni.toISOString()).lte('start_time', hojeFim.toISOString())),
    ler(medidor, 'transacoes-hoje', () => supabase.from('transactions').select(COLUNAS.transacao).gte('date', hoje).lte('date', `${hoje}T23:59:59`)),
    ler(medidor, 'meta', async () => {
      const { data: auth } = await supabase.auth.getUser()
      const user = auth?.user
      if (!user) return { data: null, error: null }
      return supabase.from('financial_goals').select('target_amount')
        .eq('user_id', workspaceId || user.id)
        .eq('year', dataAtual.getFullYear())
        .eq('month', dataAtual.getMonth() + 1)
        .maybeSingle()
    }),
  ]
  if (temTabela) {
    tarefas.push(
      ler(medidor, 'auditoria', () => supabase.from('financial_audit_log').select(COLUNAS.auditoria).order('created_at', { ascending: false }).limit(12)),
      ler(medidor, 'pagamentos-hoje', () => supabase.from('financial_payments').select(COLUNAS.pagamento).gte('received_at', hojeIni.toISOString()).lte('received_at', hojeFim.toISOString())),
    )
  }
  if (idsClientes.length) {
    tarefas.push(ler(medidor, 'clientes-anteriores', () => porIds(
      supabase,
      'appointments',
      'client_id',
      'client_id',
      idsClientes,
      (query) => query.eq('status', 'CONCLUIDO').lt('start_time', janela.periodo.start.toISOString()),
    )))
  }

  const blocos = await Promise.all(tarefas)
  const nomes = ['equipe', 'estoque', 'agenda-hoje', 'transacoes-hoje', 'meta']
  if (temTabela) nomes.push('auditoria', 'pagamentos-hoje')
  if (idsClientes.length) nomes.push('clientes-anteriores')
  const porNome = Object.fromEntries(blocos.map((bloco, index) => [nomes[index], bloco]))

  if (!porNome.equipe?.ok) erros.equipe = 'Não consegui carregar a equipe.'
  if (!porNome.estoque?.ok) erros.estoque = 'Não consegui carregar o estoque para venda.'
  if (!porNome.auditoria?.ok && temTabela) erros.auditoria = 'Não consegui carregar a auditoria.'
  if (!porNome['agenda-hoje']?.ok || !porNome['transacoes-hoje']?.ok || (temTabela && !porNome['pagamentos-hoje']?.ok)) {
    erros.caixa = 'Não consegui calcular o caixa de hoje.'
  }

  let caixaHoje = null
  if (!erros.caixa) {
    let livroHoje
    if (temTabela) {
      livroHoje = {
        charges: [],
        payments: (porNome['pagamentos-hoje']?.data || []).map(mapPayment),
        expenses: (porNome['transacoes-hoje']?.data || []).map(mapExpense).filter(Boolean),
        commissions: [],
      }
    } else {
      livroHoje = derivarLivro({
        appointments: porNome['agenda-hoje']?.data || [],
        transactions: porNome['transacoes-hoje']?.data || [],
      })
    }
    const indHoje = indicadoresFinanceiros({ ...livroHoje, from: hoje, to: hoje })
    caixaHoje = {
      entradas: indHoje.recebimentos,
      saidas: indHoje.despesasPagas,
      atendimentos: (porNome['agenda-hoje']?.data || []).filter((item) => item.status === 'CONCLUIDO').length,
    }
  }

  const prior = porNome['clientes-anteriores']?.ok
    ? (porNome['clientes-anteriores'].data || []).map((item) => item.client_id)
    : []
  if (idsClientes.length && !porNome['clientes-anteriores']?.ok) {
    erros.clientes = 'Não consegui separar clientes novos e recorrentes.'
  }

  const meta = porNome.meta?.ok ? porNome.meta.data : null
  if (!porNome.meta?.ok) erros.meta = 'Não consegui ler a meta do mês.'

  return {
    staffList: porNome.equipe?.data || [],
    estoque: porNome.estoque?.data || [],
    auditoria: porNome.auditoria?.data || [],
    clientesNovos: { monthIds: doMes.map((item) => item.client_id).filter(Boolean), prior },
    caixaHoje,
    metaMes: meta?.target_amount || 0,
    erros,
  }
}
