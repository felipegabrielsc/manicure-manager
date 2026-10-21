/**
 * Medição inicial, antes da correção: carregarFinanceiro esperava cada etapa
 * terminar para começar a próxima. A sincronização regrava concluídos e vinha
 * antes de qualquer número. Estas marcas servem para comparar com a aba Network.
 */
export const MEDICAO_INICIAL = {
  etapasSeriais: [
    'tabela',
    'sincronizacao',
    'agenda',
    'transacoes',
    'clientes',
    'estoque',
    'equipe',
    'cobrancas-competencia',
    'cobrancas-vencimento',
    'pagamentos',
    'pagamentos-ligados',
    'cobrancas-faltantes',
    'comissoes',
    'auditoria',
    'clientes-anteriores',
    'caixa',
    'meta',
  ],
  caminhoAteInteragir: ['tabela', 'consultas em paralelo'],
}

export function criarMedidor(rotulo = 'financeiro') {
  const marcas = []
  const inicio = performance.now()
  console.time(`${rotulo}:total`)
  return {
    async etapa(nome, fn) {
      const label = `${rotulo}:${nome}`
      console.time(label)
      const t0 = performance.now()
      try {
        return await fn()
      } finally {
        marcas.push({ nome, ms: Math.round(performance.now() - t0) })
        console.timeEnd(label)
      }
    },
    fim(extra = {}) {
      const total = Math.round(performance.now() - inicio)
      console.timeEnd(`${rotulo}:total`)
      const resultado = {
        total,
        etapas: marcas.map((marca) => ({ ...marca })),
        baselineSerial: MEDICAO_INICIAL.etapasSeriais.length,
        ...extra,
      }
      console.info('[financeiro] medição', resultado)
      return resultado
    },
  }
}
