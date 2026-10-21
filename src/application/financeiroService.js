import { civilDate } from '../domain/financeiro.js'

function ausente(error) {
  const message = error?.message || ''
  return /schema cache|could not find the function|PGRST202|404|financial_charges/i.test(message)
}

export function mapCharge(row) {
  return {
    id: row.id,
    userId: row.user_id,
    kind: row.kind,
    sourceKey: row.source_key,
    appointmentId: row.appointment_id,
    clientId: row.client_id,
    clientName: row.clients?.name || '',
    phone: row.clients?.phone || '',
    staffId: row.staff_id,
    staffName: row.staff_members?.name || '',
    serviceName: row.service_name || (row.kind === 'MENSALIDADE' ? 'Mensalidade' : ''),
    description: row.description || 'Cobrança',
    competenceDate: row.competence_date,
    dueDate: row.due_date,
    originalAmount: Number(row.original_amount) || 0,
    discountAmount: Number(row.discount_amount) || 0,
    countsAsRevenue: row.recognizes_revenue !== false,
    cancelled: row.status === 'CANCELADO' || !!row.cancelled_at,
    visits: row.visit_count || 0,
  }
}

export function mapPayment(row) {
  return {
    id: row.id,
    userId: row.user_id,
    chargeId: row.charge_id,
    amount: Number(row.amount) || 0,
    method: row.method || 'OUTRO',
    reference: row.reference || '',
    entryType: row.entry_type || 'RECEBIMENTO',
    reversalOf: row.reversal_of || null,
    cashDate: civilDate(row.received_at),
    idempotencyKey: row.idempotency_key,
  }
}

export function mapCommission(row) {
  return {
    id: row.id,
    userId: row.user_id,
    appointmentId: row.appointment_id,
    staffId: row.staff_id,
    staffName: row.staff_name || 'Profissional',
    percentApplied: Number(row.percent_applied) || 0,
    baseAmount: Number(row.base_amount) || 0,
    amountDue: Number(row.amount_due) || 0,
    status: row.status,
    recognizedAt: row.recognized_at,
    estimated: false,
  }
}

export function mapExpense(row) {
  if (!row || row.type !== 'DESPESA' || row.category === 'estorno') return null
  return {
    id: row.id,
    userId: row.user_id,
    amount: Number(row.amount) || 0,
    cashDate: civilDate(row.date),
    category: row.category || 'despesa',
    description: row.description || 'Despesa',
    commissionEntryId: row.commission_entry_id || null,
    paymentMethod: row.payment_method || null,
    inventoryItemId: row.inventory_item_id || null,
    quantity: row.quantity || null,
  }
}

export function uniqById(rows) {
  const map = new Map()
  for (const row of rows || []) {
    if (row?.id) map.set(row.id, row)
  }
  return [...map.values()]
}

export async function sincronizarExistente(supabase) {
  const { data, error } = await supabase.rpc('sincronizar_financeiro_existente')
  if (!error && data?.ok !== false) {
    return {
      ok: true,
      appointments: typeof data?.appointments === 'number' ? data.appointments : null,
      data,
    }
  }
  if (error) return { ok: false, missing: ausente(error), error: error.message }
  return { ok: false, error: data?.reason || 'Não foi possível conferir os lançamentos', data }
}

/** A função reprocessa atendimentos. Sem o contador, recarrega para não esconder um backfill. */
export function precisaRecarregarAposSync(result) {
  if (!result?.ok) return false
  if (typeof result.appointments === 'number') return result.appointments > 0
  return true
}

export async function receberCobranca(supabase, input) {
  const { data, error } = await supabase.rpc('registrar_recebimento', {
    p_charge_id: input.chargeId,
    p_amount: input.amount,
    p_method: input.method,
    p_reference: input.reference || null,
    p_received_on: input.receivedOn,
    p_idempotency_key: input.idempotencyKey,
  })
  if (error) return { ok: false, missing: ausente(error), error: error.message }
  if (data?.ok === false) return { ok: false, error: data.reason || 'Não foi possível receber' }
  return { ok: true, duplicated: !!data?.duplicated }
}

export async function estornarCobranca(supabase, input) {
  const { data, error } = await supabase.rpc('estornar_recebimento', {
    p_payment_id: input.paymentId,
    p_received_on: input.receivedOn,
    p_idempotency_key: input.idempotencyKey,
  })
  if (error) return { ok: false, missing: ausente(error), error: error.message }
  if (data?.ok === false) return { ok: false, error: data.reason || 'Não foi possível estornar' }
  return { ok: true, duplicated: !!data?.duplicated }
}

export async function cancelarCobrancaRemota(supabase, chargeId) {
  const { data, error } = await supabase.rpc('cancelar_cobranca', {
    p_charge_id: chargeId,
    p_reason: 'Cancelada no financeiro',
  })
  if (error) return { ok: false, missing: ausente(error), error: error.message }
  if (data?.ok === false) return { ok: false, error: data.reason || 'Não foi possível cancelar' }
  return { ok: true }
}

export async function quitarComissao(supabase, input) {
  const { data, error } = await supabase.rpc('quitar_comissao', {
    p_commission_id: input.commissionId,
    p_paid_on: input.paidOn,
    p_method: input.method || 'PIX',
    p_idempotency_key: input.idempotencyKey,
  })
  if (error) return { ok: false, missing: ausente(error), error: error.message }
  if (data?.ok === false) return { ok: false, error: data.reason || 'Não foi possível quitar' }
  return { ok: true, duplicated: !!data?.duplicated }
}

export async function definirDesconto(supabase, chargeId, discount) {
  const { data, error } = await supabase.rpc('definir_desconto_cobranca', {
    p_charge_id: chargeId,
    p_discount: discount,
  })
  if (error) return { ok: false, missing: ausente(error), error: error.message }
  if (data?.ok === false) return { ok: false, error: data.reason || 'Não foi possível aplicar o desconto' }
  return { ok: true }
}
