import { useState } from 'react'
import { CheckCircle2, DollarSign, TrendingUp, Clock, Gift, X, Edit2, Trash2, ChevronDown } from 'lucide-react'
import { money } from '../utils/dates'
import { formatLongPt, summarizeClient } from '../utils/clientInsights'
import { labelPagamento } from './pagamentoLabels'

export default function ClientDetailSheet({
  cliente,
  historico,
  filtroPeriodo,
  filtroTipo,
  filtroPagamento,
  onFiltroTipo,
  onFiltroPagamento,
  loyaltySettings,
  onClose,
  onEdit,
  onDelete,
}) {
  const [mostrarTudo, setMostrarTudo] = useState(false)
  const summary = summarizeClient({
    historico,
    aReceber: cliente.aReceber || 0,
    loyaltyVisits: cliente.loyalty_visits,
    visitsRequired: loyaltySettings?.visits_required,
    rewardDescription: loyaltySettings?.reward_description,
    firstSeen: cliente.created_at,
  })
  const visiveis = mostrarTudo ? historico : historico.slice(0, 6)
  const restantes = Math.max(0, historico.length - 6)
  const loyaltyOn = loyaltySettings?.active !== false

  return (
    <div
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.45)', zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: '#f8fafc', width: '100%', maxWidth: '600px', borderRadius: '20px 20px 0 0', padding: '20px 18px 28px', maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '22px', color: '#0f172a' }}>{cliente.name}</h2>
            <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '13px' }}>
              {filtroPeriodo === 'MES' ? 'Resumo deste mês' : 'Resumo completo'}
            </p>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', width: 36, height: 36, cursor: 'pointer' }}><X size={18} /></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
          <Kpi icon={<CheckCircle2 size={16} color="#16a34a" />} label="Atendimentos" value={String(summary.atendimentos)} />
          <Kpi icon={<DollarSign size={16} color="#16a34a" />} label="Faturado" value={`R$ ${money(summary.faturado)}`} accent="#166534" />
          <Kpi icon={<TrendingUp size={16} color="#db2777" />} label="Ticket médio" value={`R$ ${money(summary.ticket)}`} />
          <Kpi icon={<Clock size={16} color="#d97706" />} label="A receber" value={`R$ ${money(summary.aReceber)}`} accent={summary.aReceber ? '#b45309' : undefined} />
        </div>

        {summary.favorito && (
          <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#475569' }}>
            Favorito: <strong>{summary.favorito.nome}</strong> ({summary.favorito.qtd}x)
            {summary.firstSeen ? ` · desde ${formatLongPt(summary.firstSeen)}` : ''}
          </p>
        )}

        {loyaltyOn && (
          <section style={card}>
            <h3 style={h3}><Gift size={18} color="#db2777" /> Fidelidade</h3>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '8px', color: '#334155' }}>
              <span>{loyaltySettings?.reward_description || 'Prêmio'}</span>
              <strong>{summary.loyalty.ciclo}/{summary.loyalty.required}</strong>
            </div>
            <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
              {Array.from({ length: summary.loyalty.required }, (_, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: 10,
                    borderRadius: 4,
                    background: i < summary.loyalty.ciclo ? '#ec4899' : '#fce7f3',
                  }}
                />
              ))}
            </div>
            {summary.loyalty.podeResgatar ? (
              <p style={{ margin: 0, fontSize: '13px', color: '#166534', background: '#dcfce7', padding: '8px 10px', borderRadius: '8px' }}>
                Prêmio disponível: {summary.loyalty.rewardDescription}. Resgate em Fidelidade.
              </p>
            ) : (
              <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                Faltam {summary.loyalty.faltam} visita(s) para {summary.loyalty.rewardDescription}.
              </p>
            )}
          </section>
        )}

        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', margin: '16px 0 8px' }}>
          {[['TODOS', 'Tudo'], ['SERVICOS', 'Serviços'], ['COMPRAS', 'Compras']].map(([id, label]) => (
            <button key={id} type="button" onClick={() => onFiltroTipo(id)} style={chip(filtroTipo === id)}>{label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', marginBottom: '14px' }}>
          {[['TODOS', 'Pagamento'], ['PIX', 'PIX'], ['DINHEIRO', 'Dinheiro'], ['CARTAO', 'Cartão'], ['MENSALIDADE', 'Mensalidade']].map(([id, label]) => (
            <button key={id} type="button" onClick={() => onFiltroPagamento(id)} style={chip(filtroPagamento === id)}>{label}</button>
          ))}
        </div>

        <section style={card}>
          <h3 style={{ ...h3, marginBottom: '12px' }}>Histórico</h3>
          {historico.length === 0 ? (
            <p style={{ color: '#94a3b8', textAlign: 'center', margin: 0 }}>Nada neste filtro.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {visiveis.map(item => (
                <div key={item.id} style={{ background: 'white', border: '1px solid #dcfce7', borderRadius: '12px', padding: '12px 14px', display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                  <div>
                    <strong style={{ display: 'block', color: '#0f172a', fontSize: '14px' }}>{item.titulo}</strong>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>{formatLongPt(item.date)}</span>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <strong style={{ color: '#16a34a' }}>R$ {money(item.amount)}</strong>
                    {item.payment_method && (
                      <span style={{ display: 'block', fontSize: '11px', color: '#94a3b8' }}>{labelPagamento(item.payment_method)}</span>
                    )}
                  </div>
                </div>
              ))}
              {restantes > 0 && !mostrarTudo && (
                <button type="button" onClick={() => setMostrarTudo(true)} style={{ background: 'none', border: 'none', color: '#2563eb', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '8px' }}>
                  Ver mais ({restantes}) <ChevronDown size={16} />
                </button>
              )}
            </div>
          )}
        </section>

        <div style={{ display: 'flex', gap: '10px', marginTop: '18px' }}>
          <button type="button" onClick={onEdit} style={{ flex: 1, padding: '12px', background: 'white', border: '1px solid #2563eb', color: '#2563eb', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Edit2 size={16} /> Editar
          </button>
          <button type="button" onClick={onDelete} style={{ flex: 1, padding: '12px', background: '#fee2e2', border: 'none', color: '#dc2626', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Trash2 size={16} /> Excluir
          </button>
        </div>
      </div>
    </div>
  )
}

function Kpi({ icon, label, value, accent }) {
  return (
    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#64748b', fontSize: '12px', fontWeight: 600, marginBottom: 6 }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: '18px', fontWeight: 800, color: accent || '#0f172a' }}>{value}</div>
    </div>
  )
}

const card = { background: 'white', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '16px', marginBottom: '4px' }
const h3 = { margin: '0 0 10px', fontSize: '15px', color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }

function chip(ativo) {
  return {
    flexShrink: 0,
    padding: '8px 12px',
    borderRadius: '8px',
    border: ativo ? '1px solid #2563eb' : '1px solid #e2e8f0',
    background: ativo ? '#eff6ff' : 'white',
    color: ativo ? '#2563eb' : '#64748b',
    fontWeight: 'bold',
    fontSize: '13px',
    cursor: 'pointer',
  }
}
