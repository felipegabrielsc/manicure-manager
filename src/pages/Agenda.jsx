// src/pages/Agenda.jsx
import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { ChevronLeft, ChevronRight, Calendar, Plus, CheckSquare, Square, MessageCircle, Trash2, Clock, X, HelpCircle, AlertTriangle, CheckCircle, Ban, Bell, LayoutGrid } from 'lucide-react'
import { Link } from 'react-router-dom'
import Modal from '../components/Modal'
import toast from 'react-hot-toast'
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import { getWeekDays, fetchWeekAppointments, fetchSchedulingContext, validateBookingSlot, getServiceDuration } from '../utils/scheduling'
import { incrementLoyaltyVisit } from '../utils/loyalty'
import { openSupportWhatsApp } from '../config/app'

export default function Agenda() {
  const [dataAtual, setDataAtual] = useState(new Date())
  const [agendamentos, setAgendamentos] = useState([])
  const [agendamentosSemana, setAgendamentosSemana] = useState([])
  const [lembretesPendentes, setLembretesPendentes] = useState([])
  const [modoSemana, setModoSemana] = useState(false)
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState(null)
  const [staffList, setStaffList] = useState([])
  const [staffFiltro, setStaffFiltro] = useState('')
  const [staffEditId, setStaffEditId] = useState('')

  // Estados dos Modais
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [agendamentoSelecionado, setAgendamentoSelecionado] = useState(null)
  const [novaDataHora, setNovaDataHora] = useState('')
  const [pagamentoModalOpen, setPagamentoModalOpen] = useState(false)
  const [idParaConcluir, setIdParaConcluir] = useState(null)

  const [alertModal, setAlertModal] = useState({ isOpen: false, type: 'info', title: '', message: '' })
  const [acaoConfirmacao, setAcaoConfirmacao] = useState(null)

  const dataFormatada = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long'
  }).format(dataAtual)

  // Busca agendamentos quando muda a data
  useEffect(() => { buscarAgendamentos() }, [dataAtual])
  useEffect(() => { carregarSemana() }, [dataAtual])
  useEffect(() => { carregarLembretes() }, [])

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      setUserId(user.id)
      const { data } = await supabase.from('staff_members').select('id, name').eq('active', true).order('name')
      setStaffList(data || [])
    })
  }, [])

  async function carregarSemana() {
    const data = await fetchWeekAppointments(supabase, dataAtual)
    setAgendamentosSemana(data)
  }

  async function carregarLembretes() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: perfil } = await supabase.from('profiles').select('reminders_enabled, reminder_hours_before').eq('id', user.id).single()
    if (perfil?.reminders_enabled === false) return

    const horas = perfil?.reminder_hours_before ?? 24
    const agora = new Date()
    const limite = new Date(agora.getTime() + horas * 60 * 60 * 1000)

    const { data } = await supabase
      .from('appointments')
      .select('*, clients(name, phone), services(name, duration_minutes)')
      .eq('status', 'AGENDADO')
      .is('reminder_sent_at', null)
      .gte('start_time', agora.toISOString())
      .lte('start_time', limite.toISOString())
      .order('start_time')

    setLembretesPendentes(data || [])
  }

  async function enviarLembrete(agendamento) {
    const tel = agendamento.clients?.phone?.replace(/\D/g, '')
    if (!tel) return toast.error('Cliente sem telefone')

    const hora = new Date(agendamento.start_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    const data = new Date(agendamento.start_time).toLocaleDateString('pt-BR')
    const link = `${window.location.origin}/resumo/${agendamento.id}`
    const msg = `Olá ${agendamento.clients?.name}! Lembrete do seu horário: ${data} às ${hora}.\nServiço: ${agendamento.services?.name}\nDetalhes: ${link}`

    window.open(`https://wa.me/${tel.startsWith('55') ? tel : `55${tel}`}?text=${encodeURIComponent(msg)}`, '_blank')

    await supabase.from('appointments').update({ reminder_sent_at: new Date().toISOString() }).eq('id', agendamento.id)
    toast.success('Lembrete enviado!')
    carregarLembretes()
  }

  const iniciarTutorialGeral = () => {
    const driverObj = driver({
      showProgress: true, nextBtnText: 'Próximo', prevBtnText: 'Anterior', doneBtnText: 'Entendi!',
      steps: [
        { element: '#nav-clientes', popover: { title: 'Menu', description: 'Clientes, serviços e o resto do sistema ficam na barra lateral (ou no menu no celular).' } },
        { element: '#nav-financeiro', popover: { title: 'Financeiro', description: 'Acompanhe entradas, saídas e o lucro.' } },
        { element: '#nav-datas', popover: { title: 'Navegação', description: 'Mude os dias para ver a agenda.' } },
        { element: '#btn-novo', popover: { title: 'Agendar', description: 'Clique no + para marcar um horário.' } }
      ]
    });
    driverObj.drive();
  }

  const iniciarTutorialCard = (agendamento) => {
    const driverObj = driver({
      showProgress: true, nextBtnText: 'Próximo', prevBtnText: 'Voltar', doneBtnText: 'Entendi!',
      steps: [
        { element: `#check-${agendamento.id}`, popover: { title: 'Concluir', description: 'Clique aqui para finalizar e lançar no caixa.' } },
        { element: `#zap-${agendamento.id}`, popover: { title: 'WhatsApp', description: 'Envie confirmação automática.' } },
        { element: `#card-content-${agendamento.id}`, popover: { title: 'Detalhes', description: 'Toque no nome para editar ou excluir.' } }
      ]
    });
    driverObj.drive();
  }

  async function buscarAgendamentos() {
    setLoading(true)
    const inicioDia = new Date(dataAtual); inicioDia.setHours(0, 0, 0, 0)
    const fimDia = new Date(dataAtual); fimDia.setHours(23, 59, 59, 999)
    const { data } = await supabase.from('appointments').select(`*, clients (name, type, phone), services (name), staff_members (name)`).gte('start_time', inicioDia.toISOString()).lte('start_time', fimDia.toISOString()).order('start_time', { ascending: true })
    if (data) setAgendamentos(data)
    setLoading(false)
  }

  const handleToggleClick = (agendamento) => {
    if (agendamento.status === 'CONCLUIDO') {
      toggleStatus(agendamento.id, 'CONCLUIDO', null)
    } else {
      setIdParaConcluir(agendamento.id)
      setPagamentoModalOpen(true)
    }
  }

  const confirmarPagamento = async (metodo) => {
    await toggleStatus(idParaConcluir, 'AGENDADO', metodo)
    if (metodo === 'MENSALIDADE') {
      const apt = agendamentos.find(a => a.id === idParaConcluir)
      if (apt?.client_id) {
        const { data: cli } = await supabase.from('clients').select('monthly_due_day, monthly_due_offset, type').eq('id', apt.client_id).single()
        await supabase.from('clients').update({ type: 'MENSALISTA' }).eq('id', apt.client_id)
        const extra = {}
        if (cli?.monthly_due_day == null) extra.monthly_due_day = 10
        if (cli?.monthly_due_offset == null) extra.monthly_due_offset = 1
        if (Object.keys(extra).length) {
          await supabase.from('clients').update(extra).eq('id', apt.client_id)
        }
        toast('Essa visita vai para a mensalidade. Cobra no vencimento (padrão: dia 10 do mês seguinte).', { icon: '📅' })
      }
    }
    setPagamentoModalOpen(false)
    setIdParaConcluir(null)
  }

  async function toggleStatus(id, currentStatus, metodoPagamento) {
    const novoStatus = currentStatus === 'CONCLUIDO' ? 'AGENDADO' : 'CONCLUIDO'
    const updateData = { status: novoStatus, payment_method: novoStatus === 'CONCLUIDO' ? metodoPagamento : null }
    const { error } = await supabase.from('appointments').update(updateData).eq('id', id)
    if (!error) {
      if (novoStatus === 'CONCLUIDO') {
        const apt = agendamentos.find(a => a.id === id)
        await incrementLoyaltyVisit(supabase, apt?.client_id)
      }
      setAgendamentos(prev => prev.map(item => item.id === id ? { ...item, status: novoStatus, payment_method: updateData.payment_method } : item))
      if (novoStatus === 'CONCLUIDO') toast.success(`Recebido!`, { icon: '💰' })
      else toast('Reaberto', { icon: '↩️' })
    }
  }

  const abrirOpcoes = (agendamento) => {
    if (agendamento.status === 'PENDENTE') return;
    setAgendamentoSelecionado(agendamento)
    setStaffEditId(agendamento.staff_id || '')
    const d = new Date(agendamento.start_time); d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
    setNovaDataHora(d.toISOString().slice(0, 16)); setEditModalOpen(true)
  }

  const fecharOpcoes = () => { setEditModalOpen(false); setAgendamentoSelecionado(null) }

  const deletarAgendamento = async () => {
    if (!agendamentoSelecionado) return
    const { error } = await supabase.from('appointments').delete().eq('id', agendamentoSelecionado.id)
    if (!error) { buscarAgendamentos(); fecharOpcoes(); setAlertModal({ isOpen: false }); toast.success('Excluído') }
    else { toast.error('Erro ao excluir') }
  }

  const salvarNovaData = async () => {
    if (!agendamentoSelecionado || !novaDataHora || !userId) return
    const startTime = new Date(novaDataHora)
    const durationMinutes = getServiceDuration(agendamentoSelecionado.services)

    const ctx = await fetchSchedulingContext(supabase, userId, startTime, agendamentoSelecionado.id)
    const validation = validateBookingSlot({
      startTime,
      durationMinutes,
      businessHours: ctx.businessHours,
      appointments: ctx.appointments,
      blockedSlots: ctx.blockedSlots,
      excludeAppointmentId: agendamentoSelecionado.id,
      staffId: staffEditId || null,
    })

    if (!validation.valid) return toast.error(validation.reason)

    const { error } = await supabase.from('appointments').update({
      start_time: startTime.toISOString(),
      staff_id: staffEditId || null,
    }).eq('id', agendamentoSelecionado.id)
    if (!error) { buscarAgendamentos(); carregarSemana(); fecharOpcoes(); toast.success('Remarcado!') }
    else { toast.error('Erro ao remarcar') }
  }

  const marcarFalta = async () => {
    if (!agendamentoSelecionado) return
    const { error } = await supabase.from('appointments').update({ status: 'FALTOU' }).eq('id', agendamentoSelecionado.id)
    if (!error) {
      toast('Falta registrada!', { icon: '🚫' });
      buscarAgendamentos();
      fecharOpcoes();
      setAlertModal({ isOpen: false });
    } else {
      toast.error('Erro ao marcar falta');
    }
  }

  const mudarDia = (d) => { const n = new Date(dataAtual); n.setDate(n.getDate() + d); setDataAtual(n) }
  const mudarSemana = (d) => { const n = new Date(dataAtual); n.setDate(n.getDate() + d * 7); setDataAtual(n) }
  const irParaDia = (dia) => { setDataAtual(new Date(dia)); setModoSemana(false) }
  const handleModalConfirm = () => { if (acaoConfirmacao) acaoConfirmacao() }
  const abrirSuporte = () => openSupportWhatsApp('Oi, preciso de ajuda!')
  const diasSemana = getWeekDays(dataAtual)
  const hojeStr = new Date().toDateString()
  const agendaDoDia = staffFiltro
    ? agendamentos.filter(a => a.staff_id === staffFiltro)
    : agendamentos
  const semanaFiltrada = staffFiltro
    ? agendamentosSemana.filter(a => a.staff_id === staffFiltro)
    : agendamentosSemana

  return (
    <div style={{ paddingBottom: '90px', width: '100%', overflowX: 'hidden' }}>

      {/* CSS RESPONSIVO INJETADO */}
      <style>{`
        /* Ajuste fino para telas muito pequenas */
        @media (max-width: 380px) {
            .data-titulo { font-size: 16px !important; }
            .btn-nav-top { width: 35px !important; height: 35px !important; padding: 5px !important; }
            .hora-grande { font-size: 18px !important; }
        }
        /* Animação suave */
        .fade-in { animation: fadeIn 0.3s ease-in; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>

      <Modal isOpen={alertModal.isOpen} onClose={() => setAlertModal({ ...alertModal, isOpen: false })} type={alertModal.type} title={alertModal.title} message={alertModal.message} onConfirm={handleModalConfirm} />

      {/* MODAL PAGAMENTO */}
      {pagamentoModalOpen && (
        <div style={overlayStyle}>
          <div style={modalBoxStyle}>
            <h3 style={{ textAlign: 'center', marginTop: 0 }}>Pagamento</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '20px' }}>
              <button onClick={() => confirmarPagamento('PIX')} style={btnPagamento}>💠 PIX</button>
              <button onClick={() => confirmarPagamento('DINHEIRO')} style={btnPagamento}>💵 Dinheiro</button>
              <button onClick={() => confirmarPagamento('CARTAO')} style={btnPagamento}>💳 Cartão</button>
              <button onClick={() => confirmarPagamento('MENSALIDADE')} style={{ ...btnPagamento, background: '#fee2e2', color: '#dc2626' }}>Mensalidade (cobra no vencimento)</button>
            </div>
            <button onClick={() => setPagamentoModalOpen(false)} style={{ width: '100%', padding: '15px', marginTop: '15px', background: 'white', border: '1px solid #ccc', borderRadius: '8px' }}>Cancelar</button>
          </div>
        </div>
      )}

      {/* MODAL GERENCIAMENTO */}
      {editModalOpen && agendamentoSelecionado && (
        <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) fecharOpcoes() }}>
          <div style={modalBoxStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h3>Gerenciar</h3>
              <button onClick={fecharOpcoes} style={{ background: 'none', border: 'none' }}><X size={24} /></button>
            </div>
            <p><strong>{agendamentoSelecionado.clients?.name}</strong></p>

            <div style={{ background: '#eff6ff', padding: '15px', borderRadius: '8px', margin: '15px 0' }}>
              <label style={{ fontWeight: 'bold', color: '#1e40af', display: 'flex', gap: '5px', marginBottom: '5px' }}><Clock size={18} /> Remarcar:</label>
              <input type="datetime-local" value={novaDataHora} onChange={e => setNovaDataHora(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ccc' }} />
              <button onClick={salvarNovaData} style={{ ...btnFull, background: '#2563eb', marginTop: '10px' }}>Salvar Data</button>
            </div>

            {staffList.length > 0 && (
              <div style={{ marginBottom: '10px' }}>
                <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>Profissional</label>
                <select value={staffEditId} onChange={e => setStaffEditId(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ccc', marginTop: '6px' }}>
                  <option value="">Sem profissional</option>
                  {staffList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
              <button onClick={() => { setAcaoConfirmacao(() => marcarFalta); setAlertModal({ isOpen: true, type: 'confirm', title: 'Falta?', message: 'Registrar falta?' }) }} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', background: '#fef2f2', color: '#b91c1c', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                <AlertTriangle size={18} /> Faltou
              </button>
              <button onClick={() => { setAcaoConfirmacao(() => deletarAgendamento); setAlertModal({ isOpen: true, type: 'confirm', title: 'Excluir?', message: 'Tem certeza?' }) }} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #dc2626', background: 'white', color: '#dc2626', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                <Trash2 size={18} /> Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ background: 'white', padding: '10px 15px', position: 'sticky', top: 0, zIndex: 10, borderBottom: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', gap: '10px' }}>

        {/* Navegação de Data */}
        <div id="nav-datas" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f9fafb', padding: '5px', borderRadius: '12px' }}>
          <button onClick={() => modoSemana ? mudarSemana(-1) : mudarDia(-1)} style={{ ...btnNavStyle, width: '36px', height: '36px', border: 'none', background: 'transparent' }}><ChevronLeft size={24} color="#666" /></button>

          <div style={{ textAlign: 'center', flex: 1, overflow: 'hidden' }}>
            <span style={{ display: 'block', fontSize: '10px', color: '#999', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>
              {modoSemana ? 'SEMANA' : 'VISUALIZANDO'}
            </span>
            <h2 className="data-titulo" style={{ margin: 0, fontSize: '18px', color: '#000', textTransform: 'capitalize', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {modoSemana
                ? `${diasSemana[0].toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} - ${diasSemana[6].toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`
                : dataFormatada}
            </h2>
          </div>

          <button onClick={() => modoSemana ? mudarSemana(1) : mudarDia(1)} style={{ ...btnNavStyle, width: '36px', height: '36px', border: 'none', background: 'transparent' }}><ChevronRight size={24} color="#666" /></button>
        </div>

        {/* Faixa semanal + toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
            {diasSemana.map(dia => {
              const count = semanaFiltrada.filter(a => new Date(a.start_time).toDateString() === dia.toDateString() && a.status !== 'FALTOU').length
              const isSelected = dia.toDateString() === dataAtual.toDateString()
              const isToday = dia.toDateString() === hojeStr
              return (
                <button
                  key={dia.toISOString()}
                  onClick={() => irParaDia(dia)}
                  style={{
                    padding: '6px 2px', borderRadius: '10px', border: isSelected ? '2px solid #2563eb' : '1px solid #e5e7eb',
                    background: isSelected ? '#eff6ff' : 'white', cursor: 'pointer', textAlign: 'center',
                  }}
                >
                  <span style={{ display: 'block', fontSize: '9px', color: '#64748b', textTransform: 'uppercase' }}>
                    {dia.toLocaleDateString('pt-BR', { weekday: 'narrow' })}
                  </span>
                  <strong style={{ fontSize: '14px', color: isToday ? '#2563eb' : '#1f2937' }}>{dia.getDate()}</strong>
                  {count > 0 && <span style={{ display: 'block', width: '6px', height: '6px', borderRadius: '50%', background: '#16a34a', margin: '2px auto 0' }} />}
                </button>
              )
            })}
          </div>
          <button
            onClick={() => setModoSemana(!modoSemana)}
            title={modoSemana ? 'Ver dia' : 'Ver semana'}
            style={{ ...btnNavStyle, borderColor: modoSemana ? '#2563eb' : '#e5e7eb', color: modoSemana ? '#2563eb' : '#64748b' }}
          >
            <LayoutGrid size={18} />
          </button>
        </div>
        {staffList.length > 0 && (
          <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '2px' }}>
            <button type="button" onClick={() => setStaffFiltro('')} style={chipStyle(!staffFiltro)}>Todas</button>
            {staffList.map(s => (
              <button key={s.id} type="button" onClick={() => setStaffFiltro(s.id)} style={chipStyle(staffFiltro === s.id)}>
                {s.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* LEMBRETES PENDENTES */}
      {lembretesPendentes.length > 0 && (
        <div className="page-inner" style={{ padding: '12px 15px' }}>
          <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '12px', padding: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', color: '#b45309', fontWeight: 'bold', fontSize: '14px' }}>
              <Bell size={16} /> {lembretesPendentes.length} lembrete(s) pendente(s)
            </div>
            {lembretesPendentes.slice(0, 3).map(l => (
              <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: '1px solid #fde68a', fontSize: '13px' }}>
                <span>{l.clients?.name} · {new Date(l.start_time).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                <button onClick={() => enviarLembrete(l)} style={{ background: '#25D366', color: 'white', border: 'none', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>WhatsApp</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* LISTA */}
      <div className="page-inner" style={{ padding: '15px' }}>
        {loading ? <div style={{ textAlign: 'center', marginTop: '40px', color: '#999' }}>Carregando agenda...</div> :
          modoSemana ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {diasSemana.map(dia => {
                const items = semanaFiltrada.filter(a => new Date(a.start_time).toDateString() === dia.toDateString())
                return (
                  <div key={dia.toISOString()}>
                    <h3 style={{ fontSize: '14px', color: '#64748b', textTransform: 'capitalize', margin: '0 0 8px', cursor: 'pointer' }} onClick={() => irParaDia(dia)}>
                      {dia.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' })}
                    </h3>
                    {items.length === 0 ? (
                      <p style={{ fontSize: '13px', color: '#cbd5e1', margin: 0 }}>Sem agendamentos</p>
                    ) : (
                      items.map(item => (
                        <div key={item.id} onClick={() => irParaDia(dia)} style={{ padding: '10px', background: 'white', borderRadius: '8px', marginBottom: '6px', border: '1px solid #e5e7eb', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}>
                          <span><strong>{new Date(item.start_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</strong> · {item.clients?.name}</span>
                          <span style={{ fontSize: '12px', color: '#64748b' }}>{item.staff_members?.name ? `${item.staff_members.name} · ` : ''}{item.services?.name}</span>
                        </div>
                      ))
                    )}
                  </div>
                )
              })}
            </div>
          ) :
          agendamentos.length === 0 && !staffFiltro ? (
            <div style={{ textAlign: 'center', marginTop: '60px' }}>
              <Calendar size={64} color="#e5e7eb" />
              <h3 style={{ color: '#9ca3af' }}>Dia Livre</h3>
              <Link to="/novo" style={{ background: '#2563eb', color: 'white', padding: '12px 25px', borderRadius: '30px', textDecoration: 'none', fontWeight: 'bold', fontSize: '14px', boxShadow: '0 4px 10px rgba(37,99,235,0.3)' }}>+ Novo Agendamento</Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {agendaDoDia.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#94a3b8' }}>Nenhum horário desta profissional neste dia.</p>
              ) : agendaDoDia.map(item => (
                <CardAgendamento
                  key={item.id}
                  agendamento={item}
                  onToggle={() => handleToggleClick(item)}
                  onOpenOptions={() => abrirOpcoes(item)}
                  onTutorial={() => iniciarTutorialCard(item)}
                  onRefresh={() => { buscarAgendamentos(); carregarSemana() }}
                />
              ))}
            </div>
          )}

        <div style={{ textAlign: 'center', marginTop: '40px', marginBottom: '100px', color: '#999', fontSize: '12px' }}>
          <span style={{ textAlign: 'center', marginTop: '40px', marginBottom: '100px', color: '#999', fontSize: '14px' }}>Os botões de interrogção mostram informações importantes</span><p />
          <button onClick={abrirSuporte} style={{ background: 'none', border: 'none', color: '#2563eb', textDecoration: 'underline', cursor: 'pointer', fontSize: '14px', padding: '10px' }}>Precisa de suporte técnico? Clique aqui.</button>
        </div>
      </div>

      <div className="fab-safe-area" style={{ position: 'fixed', bottom: '20px', right: '20px', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center', zIndex: 20 }}>
          <button id="btn-tutorial" onClick={iniciarTutorialGeral} style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'white', color: '#d97706', border: '1px solid #d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', cursor: 'pointer' }}>
            <HelpCircle size={20} />
          </button>
          <Link id="btn-novo" to="/novo" style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#2563eb', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 15px rgba(37, 99, 235, 0.4)', textDecoration: 'none' }}>
            <Plus size={28} strokeWidth={3} />
          </Link>
      </div>

    </div>
  )
}

function CardAgendamento({ agendamento, onToggle, onOpenOptions, onTutorial, onRefresh }) {
  const hora = new Date(agendamento.start_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const isMensalista = agendamento.clients?.type === 'MENSALISTA'
  const isConcluido = agendamento.status === 'CONCLUIDO'
  const isPendente = agendamento.status === 'PENDENTE'
  const isFaltou = agendamento.status === 'FALTOU'

  const aprovarAgendamento = async (e) => {
    e.stopPropagation()
    const { error } = await supabase.from('appointments').update({ status: 'AGENDADO' }).eq('id', agendamento.id)
    if (!error) { toast.success('Confirmado!', { icon: '✅' }); onRefresh?.() }
  }

  const recusarAgendamento = async (e) => {
    e.stopPropagation()
    if (!window.confirm("Recusar solicitação?")) return;
    const { error } = await supabase.from('appointments').delete().eq('id', agendamento.id)
    if (!error) { toast('Recusado', { icon: '🗑️' }); onRefresh?.() }
  }

  const abrirWhatsapp = (e) => {
    e.stopPropagation()
    const tel = agendamento.clients?.phone?.replace(/\D/g, '')
    if (!tel) return toast.error("Sem telefone!")

    // 1. GERA O LINK DO CARTÃO DIGITAL
    const linkCartao = `${window.location.origin}/resumo/${agendamento.id}`

    // 2. MONTA O TEXTO COM O LINK NO FINAL
    const textoBase = isPendente
      ? `Olá ${agendamento.clients?.name}, vi sua solicitação de horário para às ${hora}. Podemos confirmar?\n\nConfira os detalhes aqui: ${linkCartao}`
      : `Olá ${agendamento.clients?.name}, passando para confirmar seu horário hoje às ${hora}.\n\nCartão de confirmação: ${linkCartao}`

    window.open(`https://wa.me/${tel.startsWith('55') ? tel : `55${tel}`}?text=${encodeURIComponent(textoBase)}`, '_blank')
  }

  // CARD PENDENTE
  if (isPendente) {
    return (
      <div style={{ background: '#fffbeb', borderRadius: '12px', padding: '12px', boxShadow: '0 2px 5px rgba(0,0,0,0.05)', border: '1px solid #fcd34d', borderLeft: '6px solid #f59e0b' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
          <div>
            <span style={{ background: '#f59e0b', color: 'white', fontSize: '9px', fontWeight: 'bold', padding: '2px 6px', borderRadius: '4px', letterSpacing: '0.5px' }}>SOLICITAÇÃO</span>
            <h3 style={{ margin: '4px 0 0 0', color: '#b45309', fontSize: '16px' }}>{agendamento.clients?.name}</h3>
            <span className="hora-grande" style={{ fontSize: '20px', fontWeight: 'bold', color: '#000', display: 'block', marginTop: '-2px' }}>{hora}</span>
            <p style={{ margin: 0, fontSize: '13px', color: '#666' }}>{agendamento.services?.name}{agendamento.staff_members?.name ? ` · ${agendamento.staff_members.name}` : ''}</p>
          </div>
          <button onClick={abrirWhatsapp} style={{ background: '#25D366', border: 'none', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <MessageCircle size={18} color="white" fill="white" />
          </button>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={aprovarAgendamento} style={{ flex: 1, background: '#16a34a', color: 'white', border: 'none', padding: '8px', borderRadius: '6px', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
            <CheckCircle size={16} /> Aceitar
          </button>
          <button onClick={recusarAgendamento} style={{ flex: 1, background: 'white', color: '#dc2626', border: '1px solid #dc2626', padding: '8px', borderRadius: '6px', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
            <Ban size={16} /> Recusar
          </button>
        </div>
      </div>
    )
  }

  // CARD PADRÃO
  let borderLeftColor = '#16a34a'
  if (isMensalista) borderLeftColor = '#7e22ce'
  else if (isFaltou) borderLeftColor = '#ef4444'

  return (
    <div className="fade-in" style={{ background: 'white', borderRadius: '12px', padding: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb', borderLeft: `6px solid ${borderLeftColor}`, display: 'flex', alignItems: 'center', opacity: isConcluido ? 0.6 : 1, position: 'relative' }}>

      {/* CHECKBOX FIXO */}
      <div id={`check-${agendamento.id}`} onClick={(e) => { e.stopPropagation(); onToggle(); }} style={{ marginRight: '10px', padding: '5px', cursor: 'pointer', minWidth: '40px', display: 'flex', justifyContent: 'center' }}>
        {isConcluido ? <CheckSquare size={32} color="#16a34a" fill="#dcfce7" /> : <Square size={32} color="#9ca3af" />}
      </div>

      {/* HORA FIXA */}
      <div style={{ paddingRight: '12px', borderRight: '1px solid #f3f4f6', marginRight: '12px', minWidth: '55px', textAlign: 'center' }}>
        <span className="hora-grande" style={{ fontSize: '20px', fontWeight: 'bold', color: '#1f2937' }}>{hora}</span>
      </div>

      {/* CONTEÚDO FLEXÍVEL */}
      <div id={`card-content-${agendamento.id}`} onClick={onOpenOptions} style={{ flex: 1, cursor: 'pointer', overflow: 'hidden' }}>
        <h3 style={{ margin: '0 0 2px 0', fontSize: '16px', textDecoration: isConcluido ? 'line-through' : 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {agendamento.clients?.name}
        </h3>
        {isFaltou && <span style={{ fontSize: '10px', background: '#ef4444', color: 'white', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>FALTOU</span>}
        <p style={{ margin: 0, color: '#6b7280', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {agendamento.services?.name}{agendamento.staff_members?.name ? ` · ${agendamento.staff_members.name}` : ''}
        </p>

        {!isPendente && (
          <div style={{ marginTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
            <span style={{ background: isMensalista ? '#f3e8ff' : '#dcfce7', color: isMensalista ? '#581c87' : '#14532d', padding: '2px 8px', borderRadius: '10px', fontWeight: 'bold', fontSize: '11px' }}>
              {isMensalista ? 'MENSAL' : `R$ ${agendamento.agreed_price}`}
            </span>
            {isConcluido && agendamento.payment_method && (
              <span style={{ fontSize: '10px', color: '#666', border: '1px solid #e5e7eb', padding: '2px 6px', borderRadius: '4px' }}>{agendamento.payment_method}</span>
            )}
          </div>
        )}
      </div>

      {/* BOTÕES LATERAIS */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginLeft: '5px' }}>
        <button id={`zap-${agendamento.id}`} onClick={abrirWhatsapp} style={{ background: '#25D366', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><MessageCircle size={16} color="white" fill="white" /></button>
        <button onClick={(e) => { e.stopPropagation(); onTutorial(); }} style={{ background: '#fef3c7', border: '1px solid #d97706', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <HelpCircle size={16} color="#d97706" />
        </button>
      </div>
    </div>
  )
}

const chipStyle = (active) => ({
  border: active ? '2px solid #2563eb' : '1px solid #e5e7eb',
  background: active ? '#eff6ff' : 'white',
  color: active ? '#1d4ed8' : '#475569',
  borderRadius: '999px',
  padding: '6px 12px',
  fontSize: '12px',
  fontWeight: 700,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
})
const btnNavStyle = { background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', cursor: 'pointer', padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '40px', minHeight: '40px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }
const btnFull = { width: '100%', padding: '15px', borderRadius: '8px', border: 'none', color: 'white', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }
const btnPagamento = { padding: '15px', borderRadius: '8px', border: '1px solid #2563eb', background: '#eff6ff', color: '#2563eb', fontWeight: 'bold', cursor: 'pointer' }
const overlayStyle = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }
const modalBoxStyle = { background: 'white', width: '100%', maxWidth: '600px', borderRadius: '20px 20px 0 0', padding: '25px', animation: 'slideUp 0.3s ease-out' }