import { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend } from 'recharts'
import { ChevronDown, ChevronUp, BarChart3 } from 'lucide-react'
import { money } from '../utils/dates'
import { trendPct, labelPagamentoCurto } from '../utils/financeInsights'

const COLORS = ['#2563eb', '#16a34a', '#db2777', '#f59e0b', '#0f766e', '#64748b']

export default function FinanceOverview({
  mesLabel,
  mesAnteriorLabel,
  kpis,
  daily,
  comparacao,
  projecao,
  clientes,
  pagamentos,
}) {
  const [aberto, setAberto] = useState(false)
  const fatTrend = trendPct(kpis.faturamento, kpis.prevFaturamento)
  const lucroTrend = trendPct(kpis.lucro, kpis.prevLucro)
  const aptTrend = trendPct(kpis.atendimentos, kpis.prevAtendimentos)
  const ticketTrend = trendPct(kpis.ticket, kpis.prevTicket)
  const fatAteTrend = trendPct(comparacao.faturamento, comparacao.faturamentoAnt)
  const aptAteTrend = trendPct(comparacao.atendimentos, comparacao.atendimentosAnt)

  const pieClientes = [
    { name: 'Novas', value: clientes.novas },
    { name: 'Recorrentes', value: clientes.recorrentes },
  ].filter(x => x.value > 0)

  const piePagto = pagamentos.map(p => ({ name: labelPagamentoCurto(p.metodo), value: p.total, qtd: p.qtd, pct: p.pct }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '22px' }}>
      <section style={card}>
        <h3 style={title}>Comparativo · {mesLabel} vs {mesAnteriorLabel}</h3>
        <div style={{ width: '100%', height: 180 }}>
          <ResponsiveContainer>
            <LineChart data={daily} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => `R$ ${money(v)}`} />
              <Legend />
              <Line type="monotone" dataKey="atual" name="Este mês" stroke="#7c3aed" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="anterior" name="Mês anterior" stroke="#94a3b8" strokeDasharray="4 4" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div style={{ width: '100%', height: 140, marginTop: 8 }}>
          <ResponsiveContainer>
            <LineChart data={daily} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="qtdAtual" name="Atendimentos" stroke="#db2777" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="qtdAnterior" name="Mês anterior" stroke="#cbd5e1" strokeDasharray="4 4" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section style={card}>
        <h3 style={title}>Até o dia {comparacao.dia}: {mesLabel.split(' ')[0]} vs {mesAnteriorLabel.split(' ')[0]}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <div style={muted}>Atendimentos</div>
            <div style={big}>{comparacao.atendimentos}</div>
            <Trend n={aptAteTrend} extra={`${mesAnteriorLabel.split(' ')[0]}: ${comparacao.atendimentosAnt}`} />
          </div>
          <div>
            <div style={muted}>Faturamento</div>
            <div style={big}>R$ {money(comparacao.faturamento)}</div>
            <Trend n={fatAteTrend} extra={`${mesAnteriorLabel.split(' ')[0]}: R$ ${money(comparacao.faturamentoAnt)}`} />
          </div>
        </div>
      </section>

      {projecao.pendente > 0 && (
        <section style={{ ...card, borderColor: '#fed7aa' }}>
          <p style={{ margin: '0 0 10px', fontSize: '13px', color: '#9a3412' }}>
            Há R$ {money(projecao.pendente)} em horários ainda não concluídos neste mês.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={muted}>Confirmado</div>
              <div style={big}>R$ {money(projecao.confirmado)}</div>
            </div>
            <div>
              <div style={muted}>Se concluir o pendente</div>
              <div style={big}>R$ {money(projecao.confirmado + projecao.pendente)}</div>
            </div>
          </div>
        </section>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
        <MiniKpi label="Faturamento" value={`R$ ${money(kpis.faturamento)}`} trend={fatTrend} />
        <MiniKpi label="Despesas" value={`R$ ${money(kpis.despesas)}`} />
        <MiniKpi label="Lucro" value={`R$ ${money(kpis.lucro)}`} trend={lucroTrend} />
        <MiniKpi label="Atendimentos" value={String(kpis.atendimentos)} trend={aptTrend} />
        <MiniKpi label="Ticket médio" value={`R$ ${money(kpis.ticket)}`} trend={ticketTrend} wide />
      </div>

      <button type="button" onClick={() => setAberto(v => !v)} style={toggle}>
        <BarChart3 size={18} />
        <span>
          <strong style={{ display: 'block' }}>Clientes e formas de pagamento</strong>
          <small style={{ color: '#64748b' }}>Novas vs recorrentes, top visitas e PIX/dinheiro</small>
        </span>
        {aberto ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>

      {aberto && (
        <>
          <section style={card}>
            <h3 style={title}>Clientes: novas vs recorrentes</h3>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <Pill label="Total" value={clientes.total} bg="#eff6ff" />
              <Pill label="Novas" value={clientes.novas} bg="#dbeafe" />
              <Pill label="Recorrentes" value={clientes.recorrentes} bg="#dcfce7" />
            </div>
            {pieClientes.length > 0 ? (
              <div style={{ width: '100%', height: 200 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={pieClientes} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                      {pieClientes.map((e, i) => <Cell key={e.name} fill={i === 0 ? '#2563eb' : '#16a34a'} />)}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p style={{ color: '#94a3b8', fontSize: 13 }}>Sem atendimentos concluídos neste mês.</p>
            )}
          </section>

          <section style={card}>
            <h3 style={title}>Top 5 clientes (visitas no mês)</h3>
            {clientes.top5.length === 0 ? (
              <p style={{ color: '#94a3b8', fontSize: 13 }}>Ainda não há visitas neste mês.</p>
            ) : (
              <div style={{ width: '100%', height: 220 }}>
                <ResponsiveContainer>
                  <BarChart data={clientes.top5} margin={{ top: 8, right: 8, left: -20, bottom: 40 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={60} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="visitas" fill="#16a34a" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <section style={card}>
            <h3 style={title}>Formas de pagamento</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              {pagamentos.map(p => (
                <div key={p.metodo} style={{ display: 'flex', justifyContent: 'space-between', background: '#f8fafc', borderRadius: 10, padding: '10px 12px', borderLeft: `4px solid ${p.metodo === 'PIX' ? '#2563eb' : '#16a34a'}` }}>
                  <span><strong>{p.qtd}</strong> · {labelPagamentoCurto(p.metodo)}</span>
                  <strong>R$ {money(p.total)}</strong>
                </div>
              ))}
            </div>
            {piePagto.length > 0 && (
              <div style={{ width: '100%', height: 200 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={piePagto} dataKey="value" nameKey="name" outerRadius={80}>
                      {piePagto.map((e, i) => <Cell key={e.name} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => `R$ ${money(v)}`} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

function Trend({ n, extra }) {
  const ok = n >= 0
  return (
    <div style={{ fontSize: 12, color: ok ? '#16a34a' : '#dc2626', marginTop: 4 }}>
      {ok ? '↗' : '↘'} {ok ? '+' : ''}{n}%
      {extra ? <span style={{ display: 'block', color: '#64748b' }}>{extra}</span> : null}
    </div>
  )
}

function MiniKpi({ label, value, trend, wide }) {
  return (
    <div style={{ ...card, margin: 0, gridColumn: wide ? '1 / -1' : undefined, padding: '12px' }}>
      <div style={muted}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{value}</div>
      {trend != null && <Trend n={trend} />}
    </div>
  )
}

function Pill({ label, value, bg }) {
  return (
    <div style={{ flex: 1, background: bg, borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
      <div style={{ fontSize: 18, fontWeight: 800 }}>{value}</div>
      <div style={{ fontSize: 11, color: '#475569' }}>{label}</div>
    </div>
  )
}

const card = { background: 'white', border: '1px solid #e2e8f0', borderRadius: 16, padding: 16 }
const title = { margin: '0 0 12px', fontSize: 14, color: '#334155' }
const muted = { fontSize: 12, color: '#64748b', fontWeight: 600 }
const big = { fontSize: 22, fontWeight: 800, color: '#0f172a' }
const toggle = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  textAlign: 'left',
  background: 'white',
  border: '1px solid #e2e8f0',
  borderRadius: 16,
  padding: '14px 16px',
  cursor: 'pointer',
}
