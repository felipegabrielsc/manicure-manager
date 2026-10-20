import { Link } from 'react-router-dom'
import { resumoDoDia } from '../utils/salonReports'

export default function HomeDayStrip({ agendamentos, now = new Date() }) {
  const resumo = resumoDoDia({ appointments: agendamentos, now })
  const hora = resumo.proximo
    ? new Date(resumo.proximo.start_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div className="home-day-strip">
      <div className="home-day-card">
        <span>Caixa do dia</span>
        <strong>R$ {resumo.caixa.toFixed(2)}</strong>
      </div>
      <div className="home-day-card">
        <span>Na agenda</span>
        <strong>{resumo.total}</strong>
      </div>
      <div className="home-day-card">
        <span>Próximo</span>
        <strong>{hora ? `${hora}` : 'Livre'}</strong>
        {resumo.proximo?.clients?.name ? (
          <em>{resumo.proximo.clients.name}</em>
        ) : null}
      </div>
      <Link to="/novo" className="home-day-cta">Novo horário</Link>
    </div>
  )
}
