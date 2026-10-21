import { precisaRecarregarAposSync, sincronizarExistente } from './financeiroService.js'

/** A conferência grava no banco. Não precisa repetir a cada troca de mês. */
export const SYNC_FINANCEIRO_MS = 10 * 60 * 1000

const memoriaPadrao = new Map()
const emCurso = new Map()

export function decidirSincronizacao({
  temTabela,
  workspaceId,
  agora = Date.now(),
  forcar = false,
  memoria = memoriaPadrao,
}) {
  if (!temTabela) return { executar: false, motivo: 'sem-tabela', bloquearLeitura: false }
  const chave = workspaceId || 'atual'
  if (forcar) return { executar: true, motivo: 'forcada', bloquearLeitura: true }
  const estado = memoria.get(chave)
  if (!estado?.okEm) return { executar: true, motivo: 'primeira', bloquearLeitura: false }
  if (estado.sujo) return { executar: true, motivo: 'alteracao', bloquearLeitura: true }
  if (agora - estado.okEm >= SYNC_FINANCEIRO_MS) {
    return { executar: true, motivo: 'expirada', bloquearLeitura: false }
  }
  return { executar: false, motivo: 'recente', bloquearLeitura: false }
}

export function marcarSincronizado(workspaceId, agora = Date.now(), memoria = memoriaPadrao) {
  memoria.set(workspaceId || 'atual', { okEm: agora, sujo: false })
}

export function marcarFinanceiroSujo(workspaceId, memoria = memoriaPadrao) {
  const chave = workspaceId || 'atual'
  const atual = memoria.get(chave) || {}
  memoria.set(chave, { ...atual, sujo: true })
}

export function limparMemoriaSincronizacao() {
  memoriaPadrao.clear()
  emCurso.clear()
}

export function sincronizacaoEmCurso(workspaceId) {
  return emCurso.get(workspaceId || 'atual') || null
}

export function sincronizarControlada(supabase, workspaceId) {
  const chave = workspaceId || 'atual'
  const atual = emCurso.get(chave)
  if (atual) return atual
  const promessa = sincronizarExistente(supabase).finally(() => {
    if (emCurso.get(chave) === promessa) emCurso.delete(chave)
  })
  emCurso.set(chave, promessa)
  return promessa
}

export function planejarCarregamento({ cacheItem, decisao, sincronizando = false }) {
  const cachePronto = !!(cacheItem && !cacheItem.stale)
  if (cachePronto && !decisao?.bloquearLeitura && (!decisao?.executar || sincronizando)) {
    return {
      usarCache: true,
      buscar: false,
      dispararSync: false,
      acompanharSync: !!(sincronizando && decisao?.executar),
      bloquear: false,
    }
  }
  return {
    usarCache: false,
    buscar: true,
    dispararSync: !!decisao?.executar,
    acompanharSync: false,
    bloquear: !!decisao?.bloquearLeitura,
  }
}

export { precisaRecarregarAposSync }
