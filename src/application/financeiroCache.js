import { limparMemoriaSincronizacao } from './financeiroSync.js'

export const CACHE_FINANCEIRO_MS = 60_000

const cache = new Map()
const geracoes = new Map()

export function chaveFinanceiro(workspaceId, ano, mes) {
  return `${workspaceId || 'atual'}:${ano}-${mes}`
}

function salaoDaChave(chave) {
  return String(chave || '').split(':')[0] || 'atual'
}

export function versaoCache(chave) {
  return geracoes.get(salaoDaChave(chave)) || 0
}

export function lerCache(chave, agora = Date.now()) {
  const item = cache.get(chave)
  if (!item) return null
  return { ...item, stale: agora - item.em >= CACHE_FINANCEIRO_MS }
}

export function gravarCache(chave, valor, agora = Date.now()) {
  cache.set(chave, { valor, em: agora })
}

export function gravarSeAtual(chave, valor, agora, versao) {
  if ((geracoes.get(salaoDaChave(chave)) || 0) !== versao) return false
  gravarCache(chave, valor, agora)
  return true
}

export function invalidarFinanceiro(workspaceId) {
  const prefixo = `${workspaceId || 'atual'}:`
  for (const chave of cache.keys()) {
    if (workspaceId && !chave.startsWith(prefixo)) continue
    cache.delete(chave)
  }
  if (!workspaceId) {
    for (const salao of geracoes.keys()) geracoes.set(salao, (geracoes.get(salao) || 0) + 1)
    geracoes.set('atual', (geracoes.get('atual') || 0) + 1)
    return
  }
  geracoes.set(workspaceId, (geracoes.get(workspaceId) || 0) + 1)
}

export function limparCacheFinanceiro() {
  cache.clear()
  geracoes.clear()
  limparMemoriaSincronizacao()
}
