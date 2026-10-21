import { lazy, Suspense } from 'react'
import { money } from '../utils/dates'

const FinanceGraficos = lazy(() => import('./FinanceGraficos'))

export default function FinanceResumo({ mesLabel, indicadores, serieMensal, diario }) {
  const cards = [
    ['Recebido', indicadores.recebimentos, '#166534'],
    ['A receber', indicadores.contasAReceber, '#9a3412'],
    ['Despesas pagas', indicadores.despesasPagas, '#991b1b'],
    ['Resultado de caixa', indicadores.resultadoCaixa, indicadores.resultadoCaixa >= 0 ? '#1e293b' : '#991b1b'],
  ]

  return (
    <section>
      <p style={{ margin: '0 0 12px', color: '#64748b', fontSize: 13 }}>
        Visão geral · <strong style={{ color: '#0f172a', textTransform: 'capitalize' }}>{mesLabel}</strong>
      </p>
      <div className="fin-kpis">
        {cards.map(([label, value, color]) => (
          <article key={label} className="fin-kpi">
            <span>{label}</span>
            <strong style={{ color }}>R$ {money(value)}</strong>
          </article>
        ))}
      </div>
      <div className="fin-kpis">
        <article className="fin-kpi">
          <span>Faturamento</span>
          <strong>R$ {money(indicadores.faturamento)}</strong>
        </article>
        <article className="fin-kpi">
          <span>Resultado operacional</span>
          <strong>R$ {money(indicadores.resultadoOperacional)}</strong>
        </article>
      </div>
      <p style={{ margin: '0 0 14px', color: '#64748b', fontSize: 12 }}>
        Faturamento é o serviço feito no mês. Recebido é o dinheiro que entrou, mesmo que a visita tenha sido em outro mês.
      </p>
      <Suspense fallback={<div className="fin-skeleton" style={{ height: 180 }} />}>
        <FinanceGraficos serieMensal={serieMensal} diario={diario} />
      </Suspense>
    </section>
  )
}
