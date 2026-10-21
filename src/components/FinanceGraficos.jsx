import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { money } from '../utils/dates'

export default function FinanceGraficos({ serieMensal, diario }) {
  return (
    <>
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
    </>
  )
}
