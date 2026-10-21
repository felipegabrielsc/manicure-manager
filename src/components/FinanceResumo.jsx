import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { money } from '../utils/dates'

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
      {serieMensal?.length > 0 && (
        <div className="ui-card" style={{ padding: 16, marginBottom: 14 }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 14, color: '#334155' }}>Recebimentos mensais</h3>
          <div style={{ width: '100%', height: 180 }}>
            <ResponsiveContainer>
              <BarChart data={serieMensal} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value) => `R$ ${money(value)}`} />
                <Bar dataKey="total" name="Recebido" fill="#2563eb" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      {diario?.some((row) => row.total) && (
        <div className="ui-card" style={{ padding: 16 }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 14, color: '#334155' }}>Recebimentos do mês</h3>
          <div style={{ width: '100%', height: 160 }}>
            <ResponsiveContainer>
              <BarChart data={diario} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value) => `R$ ${money(value)}`} />
                <Bar dataKey="total" name="Recebido" fill="#16a34a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </section>
  )
}
