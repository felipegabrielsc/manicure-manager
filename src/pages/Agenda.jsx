// src/pages/Agenda.jsx
import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { ChevronLeft, ChevronRight, Calendar, User, Plus, Scissors, DollarSign, CheckSquare, Square, MessageCircle, Trash2, Clock, X, LogOut, CreditCard, HelpCircle, AlertTriangle, Settings, CheckCircle, Ban } from 'lucide-react'
import { Link } from 'react-router-dom'
import Modal from '../components/Modal'
import toast from 'react-hot-toast'
import { driver } from "driver.js";
import "driver.js/dist/driver.css";

export default function Agenda() {
  const [dataAtual, setDataAtual] = useState(new Date())
  const [agendamentos, setAgendamentos] = useState([])
  const [loading, setLoading] = useState(true)

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

  useEffect(() => { buscarAgendamentos() }, [dataAtual])

  const iniciarTutorialGeral = () => {
    const driverObj = driver({
      showProgress: true, nextBtnText: 'Próximo', prevBtnText: 'Anterior', doneBtnText: 'Entendi!',
      steps: [
        { element: '#menu-gestao', popover: { title: 'Gestão', description: 'Cadastre Clientes e Serviços aqui.' } },
        { element: '#menu-financeiro', popover: { title: 'Financeiro & Config', description: 'Acesse seu financeiro e configure seus horários.' } },
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
    const { data } = await supabase.from('appointments').select(`*, clients (name, type, phone), services (name)`).gte('start_time', inicioDia.toISOString()).lte('start_time', fimDia.toISOString()).order('start_time', { ascending: true })
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
    setPagamentoModalOpen(false)
    setIdParaConcluir(null)
  }

  async function toggleStatus(id, currentStatus, metodoPagamento) {
    const novoStatus = currentStatus === 'CONCLUIDO' ? 'AGENDADO' : 'CONCLUIDO'
    const updateData = { status: novoStatus, payment_method: novoStatus === 'CONCLUIDO' ? metodoPagamento : null }
    const { error } = await supabase.from('appointments').update(updateData).eq('id', id)
    if (!error) {
      setAgendamentos(prev => prev.map(item => item.id === id ? { ...item, status: novoStatus, payment_method: updateData.payment_method } : item))
      if (novoStatus === 'CONCLUIDO') toast.success(`Recebido!`, { icon: '💰' })
      else toast('Reaberto', { icon: '↩️' })
    }
  }

  const abrirOpcoes = (agendamento) => {
    if (agendamento.status === 'PENDENTE') return;
    setAgendamentoSelecionado(agendamento)
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
    if (!agendamentoSelecionado || !novaDataHora) return
    const { error } = await supabase.from('appointments').update({ start_time: new Date(novaDataHora).toISOString() }).eq('id', agendamentoSelecionado.id)
    if (!error) { buscarAgendamentos(); fecharOpcoes(); toast.success('Remarcado!') }
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

  const handleLogout = async () => {
    setAcaoConfirmacao(() => async () => { await supabase.auth.signOut(); window.location.reload() })
    setAlertModal({ isOpen: true, type: 'confirm', title: 'Sair?', message: 'Você terá que fazer login novamente.' })
  }
  const mudarDia = (d) => { const n = new Date(dataAtual); n.setDate(n.getDate() + d); setDataAtual(n) }
  const handleModalConfirm = () => { if (acaoConfirmacao) acaoConfirmacao() }
  const abrirSuporte = () => { window.open(`https://wa.me/5516996097901?text=${encodeURIComponent("Oi, preciso de ajuda!")}`, '_blank') }

  return (
    <div style={{ paddingBottom: '100px', maxWidth: '100vw', overflowX: 'hidden' }}>

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
              <button onClick={() => confirmarPagamento('MENSALIDADE')} style={{ ...btnPagamento, background: '#fee2e2', color: '#dc2626' }}>Mensalidade</button>
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

      {/* CABEÇALHO FIXO RESPONSIVO */}
      <div className="header-safe-area" style={{ background: 'white', padding: '10px 15px', position: 'sticky', top: 0, zIndex: 10, boxShadow: '0 4px 6px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: '10px' }}>

        {/* Linha de Ícones */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div id="menu-gestao" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Link to="/clientes" className="btn-nav-top" style={btnNavStyle} title="Clientes"><User size={20} color="#000" /></Link>
            <Link to="/servicos" className="btn-nav-top" style={btnNavStyle} title="Serviços"><Scissors size={20} color="#000" /></Link>
          </div>
          <div id="menu-financeiro" style={{ display: 'flex', gap: '8px' }}>
            <Link id="menu-config" to="/configuracoes" className="btn-nav-top" style={{ ...btnNavStyle, borderColor: '#64748b', color: '#64748b', background: '#f8fafc' }} title="Configurações"><Settings size={20} /></Link>
            <Link to="/financeiro" className="btn-nav-top" style={{ ...btnNavStyle, borderColor: '#16a34a', color: '#16a34a', background: '#f0fdf4' }} title="Financeiro"><DollarSign size={20} /></Link>
          </div>
        </div>

        {/* Navegação de Data */}
        <div id="nav-datas" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f9fafb', padding: '5px', borderRadius: '12px' }}>
          <button onClick={() => mudarDia(-1)} style={{ ...btnNavStyle, width: '36px', height: '36px', border: 'none', background: 'transparent' }}><ChevronLeft size={24} color="#666" /></button>

          <div style={{ textAlign: 'center', flex: 1, overflow: 'hidden' }}>
            <span style={{ display: 'block', fontSize: '10px', color: '#999', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>VISUALIZANDO</span>
            {/* White-space nowrap impede a quebra de linha */}
            <h2 className="data-titulo" style={{ margin: 0, fontSize: '18px', color: '#000', textTransform: 'capitalize', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {dataFormatada}
            </h2>
          </div>

          <button onClick={() => mudarDia(1)} style={{ ...btnNavStyle, width: '36px', height: '36px', border: 'none', background: 'transparent' }}><ChevronRight size={24} color="#666" /></button>
        </div>
      </div>

      {/* LISTA */}
      <div style={{ padding: '15px', maxWidth: '600px', margin: '0 auto' }}>
        {loading ? <div style={{ textAlign: 'center', marginTop: '40px', color: '#999' }}>Carregando agenda...</div> :
          agendamentos.length === 0 ? (
            <div style={{ textAlign: 'center', marginTop: '60px' }}>
              <Calendar size={64} color="#e5e7eb" />
              <h3 style={{ color: '#9ca3af' }}>Dia Livre</h3>
              <Link id="btn-novo" to="/novo" style={{ background: '#2563eb', color: 'white', padding: '12px 25px', borderRadius: '30px', textDecoration: 'none', fontWeight: 'bold', fontSize: '14px', boxShadow: '0 4px 10px rgba(37,99,235,0.3)' }}>+ Novo Agendamento</Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {agendamentos.map(item => (
                <CardAgendamento
                  key={item.id}
                  agendamento={item}
                  onToggle={() => handleToggleClick(item)}
                  onOpenOptions={() => abrirOpcoes(item)}
                  onTutorial={() => iniciarTutorialCard(item)}
                />
              ))}
            </div>
          )}

        <div style={{ textAlign: 'center', marginTop: '40px', marginBottom: '100px', color: '#999', fontSize: '12px' }}>
          <span style={{ textAlign: 'center', marginTop: '40px', marginBottom: '100px', color: '#999', fontSize: '14px' }}>Os botões de interrogção mostram informações importantes</span><p />
          <button onClick={abrirSuporte} style={{ background: 'none', border: 'none', color: '#2563eb', textDecoration: 'underline', cursor: 'pointer', fontSize: '14px', padding: '10px' }}>Precisa de suporte técnico? Clique aqui.</button>
        </div>
      </div>

      {/* BOTÕES FLUTUANTES (FAB) - ORGANIZADOS */}
      <div style={{ position: 'fixed', bottom: '20px', left: '20px', right: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', pointerEvents: 'none', zIndex: 20 }}>

        {/* Esquerda: Sair */}
        <button id='btn-logout' onClick={handleLogout} style={{ pointerEvents: 'auto', width: '45px', height: '45px', borderRadius: '50%', background: 'white', color: '#ef4444', border: '1px solid #ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
          <LogOut size={20} />
        </button>

        {/* Direita: Grupo Ajuda + Novo */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center', pointerEvents: 'auto' }}>
          <button id="btn-tutorial" onClick={iniciarTutorialGeral} style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'white', color: '#d97706', border: '1px solid #d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
            <HelpCircle size={20} />
          </button>

          <Link id="btn-novo" to="/novo" style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#2563eb', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 15px rgba(37, 99, 235, 0.4)', textDecoration: 'none' }}>
            <Plus size={28} strokeWidth={3} />
          </Link>
        </div>
      </div>

    </div>
  )
}

function CardAgendamento({ agendamento, onToggle, onOpenOptions, onTutorial }) {
  const hora = new Date(agendamento.start_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const isMensalista = agendamento.clients?.type === 'MENSALISTA'
  const isConcluido = agendamento.status === 'CONCLUIDO'
  const isPendente = agendamento.status === 'PENDENTE'
  const isFaltou = agendamento.status === 'FALTOU'

  const aprovarAgendamento = async (e) => {
    e.stopPropagation()
    const { error } = await supabase.from('appointments').update({ status: 'AGENDADO' }).eq('id', agendamento.id)
    if (!error) { toast.success('Confirmado!', { icon: '✅' }); window.location.reload(); }
  }

  const recusarAgendamento = async (e) => {
    e.stopPropagation()
    if (!window.confirm("Recusar solicitação?")) return;
    const { error } = await supabase.from('appointments').delete().eq('id', agendamento.id)
    if (!error) { toast('Recusado', { icon: '🗑️' }); window.location.reload(); }
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
            <p style={{ margin: 0, fontSize: '13px', color: '#666' }}>{agendamento.services?.name}</p>
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
        <p style={{ margin: 0, color: '#6b7280', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{agendamento.services?.name}</p>

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

const btnNavStyle = { background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', cursor: 'pointer', padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '40px', minHeight: '40px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }
const btnFull = { width: '100%', padding: '15px', borderRadius: '8px', border: 'none', color: 'white', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }
const btnPagamento = { padding: '15px', borderRadius: '8px', border: '1px solid #2563eb', background: '#eff6ff', color: '#2563eb', fontWeight: 'bold', cursor: 'pointer' }
const overlayStyle = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }
const modalBoxStyle = { background: 'white', width: '100%', maxWidth: '600px', borderRadius: '20px 20px 0 0', padding: '25px', animation: 'slideUp 0.3s ease-out' }