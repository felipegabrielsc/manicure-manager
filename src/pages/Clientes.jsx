// src/pages/Clientes.jsx
import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { ArrowLeft, Search, User, Plus, HelpCircle } from 'lucide-react'
import ClientDetailSheet from '../components/ClientDetailSheet'
import { labelPagamento } from '../components/pagamentoLabels'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import Modal from '../components/Modal'
import { monthRangeLocal, money } from '../utils/dates'
import { driver } from "driver.js";
import "driver.js/dist/driver.css";

export default function Clientes() {
  const [loading, setLoading] = useState(true)
  const [clientes, setClientes] = useState([])
  const [busca, setBusca] = useState('')
  const [filtroPeriodo, setFiltroPeriodo] = useState('MES')
  const [filtroPagamento, setFiltroPagamento] = useState('TODOS')
  const [filtroTipo, setFiltroTipo] = useState('TODOS')
  const [clienteFocoId, setClienteFocoId] = useState('')

  // Estados para Modal de Novo/Editar
  const [modalAberto, setModalAberto] = useState(false)
  const [nomeCliente, setNomeCliente] = useState('')
  const [phoneCliente, setPhoneCliente] = useState('')
  const [idEdicao, setIdEdicao] = useState(null)
  const [tipoCliente, setTipoCliente] = useState('AVULSO')
  const [mensalidadeValor, setMensalidadeValor] = useState('')
  const [diaVencimento, setDiaVencimento] = useState('10')
  const [offsetVencimento, setOffsetVencimento] = useState('1')

  // Estados para Modal de Histórico
  const [clienteDetalheId, setClienteDetalheId] = useState(null)
  const [loyaltySettings, setLoyaltySettings] = useState(null)

  // Estados para o Modal de Confirmação (Delete)
  const [alertModal, setAlertModal] = useState({ isOpen: false, type: 'info', title: '', message: '' })
  const [acaoConfirmacao, setAcaoConfirmacao] = useState(null)

  useEffect(() => {
    carregarDados()
  }, [filtroPeriodo])

  // --- 2. CONFIGURAÇÃO DO TUTORIAL INTERATIVO ---
  const iniciarTutorial = () => {
    const driverObj = driver({
      showProgress: true,
      nextBtnText: 'Próximo',
      prevBtnText: 'Anterior',
      doneBtnText: 'Entendi!',
      steps: [
        { 
          element: '#cli-novo', 
          popover: { title: 'Nova Cliente', description: 'Clique aqui para cadastrar uma nova cliente manualmente.' } 
        },
        { 
          element: '#cli-busca', 
          popover: { title: 'Pesquisa', description: 'Digite o nome para encontrar alguém rapidamente.' } 
        },
        { 
          element: '#cli-filtros', 
          popover: { title: 'Filtros', description: 'Escolha uma cliente, veja só os serviços ou só as compras, e filtre por PIX, cartão, dinheiro ou mensalidade.' } 
        },
        { 
          element: '#cli-lista', 
          popover: { title: 'Lista Inteligente', description: 'As clientes são ordenadas pelo valor gasto. Quem gasta mais aparece no topo (em verde).' } 
        },
        { 
          element: '#cli-detalhes', 
          popover: { title: 'Histórico', description: 'Abra a cliente para o extrato. Lá dá para ver todos os serviços ou só o que ela pagou no PIX.' } 
        }
      ]
    });
    driverObj.drive();
  }

  const formatarTelefone = (value) => {
    if (!value) return ""
    const numbers = value.replace(/\D/g, '')
    return numbers
      .replace(/^(\d{2})(\d)/g, '($1) $2')
      .replace(/(\d)(\d{4})$/, '$1-$2')
      .substring(0, 15)
  }

  async function carregarDados() {
    setLoading(true)
    const { data: clientsData, error: errClients } = await supabase.from('clients').select('*').order('name')
    if (errClients) { toast.error('Erro ao carregar clientes'); setLoading(false); return; }

    const { data: loyalty } = await supabase.from('loyalty_settings').select('visits_required, reward_description, active').maybeSingle()
    setLoyaltySettings(loyalty)

    let query = supabase.from('appointments').select('id, client_id, agreed_price, start_time, payment_method, services(name)').eq('status', 'CONCLUIDO')

    let txQuery = supabase
      .from('transactions')
      .select('id, client_id, description, amount, date, payment_method, category, type')
      .eq('type', 'RECEITA')
      .not('client_id', 'is', null)

    if (filtroPeriodo === 'MES') {
        const { start, end, startDay, endDay } = monthRangeLocal(new Date())
        query = query.gte('start_time', start.toISOString()).lte('start_time', end.toISOString())
        txQuery = txQuery.gte('date', startDay).lte('date', `${endDay}T23:59:59`)
    }

    const [{ data: appointmentsData }, { data: transacoesData }, { data: pendentesData }] = await Promise.all([
      query,
      txQuery,
      supabase.from('appointments').select('id, client_id, agreed_price').in('status', ['PENDENTE', 'AGENDADO']),
    ])

    const clientesComGasto = clientsData.map(cliente => {
        const servicos = (appointmentsData || [])
          .filter(app => app.client_id === cliente.id)
          .map(app => ({
            id: `apt-${app.id}`,
            tipo: 'servico',
            titulo: app.services?.name || 'Serviço',
            date: app.start_time,
            amount: Number(app.agreed_price) || 0,
            payment_method: app.payment_method,
            category: 'servico',
          }))
        const compras = (transacoesData || [])
          .filter(t => t.client_id === cliente.id)
          .map(t => ({
            id: `tx-${t.id}`,
            tipo: 'compra',
            titulo: t.description || (t.category === 'mensalidade' ? 'Mensalidade' : 'Compra'),
            date: t.date,
            amount: Number(t.amount) || 0,
            payment_method: t.payment_method,
            category: t.category,
          }))
        const historico = [...servicos, ...compras].sort((a, b) => String(b.date).localeCompare(String(a.date)))
        const totalGasto = historico.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0)
        const aReceber = (pendentesData || [])
          .filter(app => app.client_id == cliente.id)
          .reduce((acc, app) => acc + (Number(app.agreed_price) || 0), 0)

        return { ...cliente, totalGasto, historico, aReceber }
    })

    clientesComGasto.sort((a, b) => b.totalGasto - a.totalGasto)
    setClientes(clientesComGasto)
    setLoading(false)
  }

  const salvarCliente = async (e) => {
    e.preventDefault()
    if (!nomeCliente || !phoneCliente) return toast.error('Preencha os campos')
    const user = (await supabase.auth.getUser()).data.user
    const dados = {
      name: nomeCliente,
      phone: phoneCliente,
      user_id: user.id,
      type: tipoCliente,
    }
    if (tipoCliente === 'MENSALISTA') {
      dados.monthly_fee = mensalidadeValor ? Number(String(mensalidadeValor).replace(',', '.')) : null
      dados.monthly_due_day = Math.min(31, Math.max(1, parseInt(diaVencimento, 10) || 10))
      dados.monthly_due_offset = offsetVencimento === '0' ? 0 : 1
    }

    let error
    if (idEdicao) {
        const res = await supabase.from('clients').update(dados).eq('id', idEdicao)
        error = res.error
    } else {
        const res = await supabase.from('clients').insert(dados)
        error = res.error
    }

    if (error) toast.error(error.message?.includes('monthly_') ? 'Rode o SQL 007 no Supabase (vencimento da mensalidade).' : (error.message || 'Erro ao salvar'))
    else {
        toast.success('Cliente salva!')
        setModalAberto(false)
        limparForm()
        carregarDados()
    }
  }

  const confirmarExclusao = async (id) => {
      const toastId = toast.loading('Verificando histórico...')
      const { count, error } = await supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('client_id', id)
      toast.dismiss(toastId)

      if (error) return toast.error('Erro ao verificar histórico.')

      if (count > 0) {
        setAlertModal({
            isOpen: true,
            type: 'info',
            title: 'Não é possível excluir',
            message: `Esta cliente possui ${count} agendamentos no histórico. Excluí-la apagaria o registro financeiro.`
        })
        setAcaoConfirmacao(null) 
        return;
      }

      setAcaoConfirmacao(() => async () => {
          const { error: deleteError } = await supabase.from('clients').delete().eq('id', id)
          if (deleteError) toast.error('Erro ao excluir.')
          else {
              toast.success('Cliente excluída')
              setClienteDetalheId(null) 
              carregarDados()
          }
          setAlertModal({ ...alertModal, isOpen: false })
      })

      setAlertModal({ isOpen: true, type: 'confirm', title: 'Excluir Cliente?', message: 'Esta cliente não tem histórico. Deseja removê-la?' })
  }

  const handleModalConfirm = () => { if (acaoConfirmacao) acaoConfirmacao() }

  const abrirEdicao = (c, e) => {
      e.stopPropagation()
      setIdEdicao(c.id)
      setNomeCliente(c.name)
      setPhoneCliente(c.phone)
      setTipoCliente(c.type === 'MENSALISTA' ? 'MENSALISTA' : 'AVULSO')
      setMensalidadeValor(c.monthly_fee != null ? String(c.monthly_fee) : '')
      setDiaVencimento(String(c.monthly_due_day || 10))
      setOffsetVencimento(c.monthly_due_offset == null ? '1' : String(c.monthly_due_offset))
      setModalAberto(true)
  }

  const limparForm = () => {
    setIdEdicao(null)
    setNomeCliente('')
    setPhoneCliente('')
    setTipoCliente('AVULSO')
    setMensalidadeValor('')
    setDiaVencimento('10')
    setOffsetVencimento('1')
  }

  const itensFiltradosDe = (historico) => (historico || []).filter(item => passaFiltroItem(item, filtroTipo, filtroPagamento))

  const filtrarLista = clientes.filter(c => {
    if (clienteFocoId && c.id !== clienteFocoId) return false
    if (!c.name.toLowerCase().includes(busca.toLowerCase())) return false
    const itens = itensFiltradosDe(c.historico)
    const filtroEstreito = filtroTipo !== 'TODOS' || filtroPagamento !== 'TODOS'
    if (!clienteFocoId && filtroEstreito && itens.length === 0) return false
    return true
  })

  const clientesPorNome = [...clientes].sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR'))
  const clienteDetalhe = clientes.find(c => c.id === clienteDetalheId)
  const historicoDetalhe = clienteDetalhe ? itensFiltradosDe(clienteDetalhe.historico) : []

  const escolherClienteFoco = (id) => {
    setClienteFocoId(id)
    setClienteDetalheId(id || null)
  }

  return (
    <div style={{ minHeight: '100%', background: '#f8fafc', paddingBottom: '80px', fontFamily: 'sans-serif' }}>
      
      <Modal isOpen={alertModal.isOpen} onClose={() => setAlertModal({...alertModal, isOpen: false})} type={alertModal.type} title={alertModal.title} message={alertModal.message} onConfirm={handleModalConfirm} />

      {/* CABEÇALHO */}
      <div style={{ background: 'white', padding: '15px 20px', position: 'sticky', top: 0, zIndex: 10, boxShadow: '0 4px 6px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
            <Link to="/" style={{ color: '#000' }}><ArrowLeft size={24} /></Link>
            <h2 style={{ margin: 0, fontSize: '20px' }}>Clientes</h2>
        </div>
        
        <div style={{display:'flex', gap:'10px'}}>
            {/* BOTÃO TUTORIAL */}
            <button 
                onClick={iniciarTutorial} 
                style={{ background: '#fffbeb', color: '#d97706', border: '1px solid #d97706', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                title="Ajuda"
            >
                <HelpCircle size={20} />
            </button>

            {/* BOTÃO ADICIONAR (COM ID PARA TUTORIAL) */}
            <button 
                id="cli-novo"
                onClick={() => { limparForm(); setModalAberto(true) }} 
                style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
                <Plus size={24} />
            </button>
        </div>
      </div>

      <div style={{ padding: '20px 20px 0 20px' }} className="page-inner">
        
        {/* BUSCA (COM ID) */}
        <div id="cli-busca" style={{ position: 'relative', marginBottom: '15px' }}>
            <Search size={20} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '12px' }} />
            <input 
                placeholder="Buscar cliente..." 
                value={busca}
                onChange={e => setBusca(e.target.value)}
                style={{ width: '100%', padding: '12px 12px 12px 40px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '16px', boxSizing:'border-box' }} 
            />
        </div>

        {/* FILTROS (COM ID) */}
        <div id="cli-filtros" style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
            <select
              value={clienteFocoId}
              onChange={e => escolherClienteFoco(e.target.value)}
              style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '16px', background: 'white', boxSizing: 'border-box' }}
            >
              <option value="">Todas as clientes</option>
              {clientesPorNome.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: '10px' }}>
            <button 
                onClick={() => setFiltroPeriodo('MES')}
                style={{ flex: 1, padding: '10px', borderRadius: '8px', border: filtroPeriodo === 'MES' ? '1px solid #2563eb' : '1px solid #e2e8f0', background: filtroPeriodo === 'MES' ? '#eff6ff' : 'white', color: filtroPeriodo === 'MES' ? '#2563eb' : '#64748b', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer' }}
            >
                📅 Este Mês
            </button>
            <button 
                onClick={() => setFiltroPeriodo('TOTAL')}
                style={{ flex: 1, padding: '10px', borderRadius: '8px', border: filtroPeriodo === 'TOTAL' ? '1px solid #2563eb' : '1px solid #e2e8f0', background: filtroPeriodo === 'TOTAL' ? '#eff6ff' : 'white', color: filtroPeriodo === 'TOTAL' ? '#2563eb' : '#64748b', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer' }}
            >
                ♾️ Tudo
            </button>
            </div>
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
              {[['TODOS', 'Tudo'], ['SERVICOS', 'Serviços'], ['COMPRAS', 'Compras']].map(([id, label]) => (
                <button key={id} onClick={() => setFiltroTipo(id)} style={chipFiltro(filtroTipo === id)}>
                  {label}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
              {[['TODOS', 'Pagamento'], ['PIX', 'PIX'], ['DINHEIRO', 'Dinheiro'], ['CARTAO', 'Cartão'], ['MENSALIDADE', 'Mensalidade']].map(([id, label]) => (
                <button key={id} onClick={() => setFiltroPagamento(id)} style={chipFiltro(filtroPagamento === id)}>
                  {label}
                </button>
              ))}
            </div>
        </div>

        {/* LISTA (COM ID) */}
        {loading ? <div style={{textAlign:'center', color:'#666'}}>Carregando...</div> : (
            <div id="cli-lista" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {filtrarLista.length === 0 && (
                  <p style={{ textAlign: 'center', color: '#94a3b8' }}>Nada neste filtro. Troque o período, o tipo ou o pagamento.</p>
                )}
                {filtrarLista.map((cliente, index) => {
                    const itens = itensFiltradosDe(cliente.historico)
                    const totalFiltro = itens.reduce((acc, item) => acc + (Number(item.amount) || 0), 0)
                    return (
                    <div 
                        key={cliente.id} 
                        id={index === 0 ? 'cli-detalhes' : ''}
                        onClick={() => setClienteDetalheId(cliente.id)}
                        style={{ background: 'white', borderRadius: '12px', padding: '15px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', gap: '12px', minWidth: 0 }}
                    >
                        <div style={{display:'flex', alignItems:'center', gap:'12px', minWidth: 0, flex: 1}}>
                            <div style={{width:'40px', height:'40px', flexShrink: 0, background:'#f1f5f9', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', color:'#64748b'}}>
                                <User size={20}/>
                            </div>
                            <div style={{ minWidth: 0 }}>
                                <h3 style={{margin:0, fontSize:'16px', color:'#1e293b', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{cliente.name}</h3>
                                <span style={{fontSize:'12px', color:'#64748b'}}>{formatarTelefone(cliente.phone)}</span>
                                {cliente.type === 'MENSALISTA' && (
                                  <span style={{ display: 'block', fontSize: '11px', color: '#dc2626', fontWeight: 'bold' }}>
                                    Mensalidade · vence dia {cliente.monthly_due_day || 10}{Number(cliente.monthly_due_offset) === 0 ? ' no mesmo mês' : ' no mês seguinte'}
                                  </span>
                                )}
                                {(cliente.loyalty_visits > 0) && (
                                  <span style={{ fontSize: '11px', color: '#7c3aed', fontWeight: 'bold' }}>★ {cliente.loyalty_visits} visitas</span>
                                )}
                            </div>
                        </div>

                        <div style={{textAlign:'right', flexShrink: 0}}>
                            <span style={{display:'block', fontSize:'10px', color:'#64748b', fontWeight:'bold'}}>
                              {rotuloTotal(filtroTipo, filtroPagamento)}
                            </span>
                            <span style={{color: totalFiltro > 0 ? '#16a34a' : '#94a3b8', fontWeight: 'bold', fontSize: '16px'}}>
                                R$ {money(totalFiltro)}
                            </span>
                            <span style={{display:'block', fontSize:'11px', color:'#94a3b8'}}>{itens.length} item(ns)</span>
                        </div>
                    </div>
                    )
                })}
            </div>
        )}
      </div>

      {clienteDetalhe && (
        <ClientDetailSheet
          cliente={clienteDetalhe}
          historico={historicoDetalhe}
          filtroPeriodo={filtroPeriodo}
          filtroTipo={filtroTipo}
          filtroPagamento={filtroPagamento}
          onFiltroTipo={setFiltroTipo}
          onFiltroPagamento={setFiltroPagamento}
          loyaltySettings={loyaltySettings}
          onClose={() => setClienteDetalheId(null)}
          onEdit={() => { const c = clienteDetalhe; setClienteDetalheId(null); abrirEdicao(c, { stopPropagation: () => {} }) }}
          onDelete={() => confirmarExclusao(clienteDetalhe.id)}
        />
      )}

      {/* --- MODAL NOVO/EDITAR --- */}
      {modalAberto && (
        <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', zIndex:60, display:'flex', alignItems:'center', justifyContent:'center'}} onClick={(e)=>{if(e.target===e.currentTarget) setModalAberto(false)}}>
             <div style={{background:'white', padding:'25px', borderRadius:'16px', width:'90%', maxWidth:'400px', maxHeight:'90vh', overflowY:'auto'}}>
                 <h3 style={{marginTop:0}}>{idEdicao ? 'Editar' : 'Nova'}</h3>
                 <form onSubmit={salvarCliente}>
                     <div style={{marginBottom:'15px'}}>
                         <label style={{display:'block', fontSize:'12px', fontWeight:'bold', marginBottom:'5px'}}>Nome</label>
                         <input required value={nomeCliente} onChange={e=>setNomeCliente(e.target.value)} style={inputStyle} placeholder="Ex: Maria Silva" />
                     </div>
                     <div style={{marginBottom:'15px'}}>
                         <label style={{display:'block', fontSize:'12px', fontWeight:'bold', marginBottom:'5px'}}>WhatsApp</label>
                         <input required value={phoneCliente} onChange={e => setPhoneCliente(formatarTelefone(e.target.value))} style={inputStyle} placeholder="(00) 00000-0000" maxLength={15}/>
                     </div>
                     <div style={{marginBottom:'15px'}}>
                         <label style={{display:'block', fontSize:'12px', fontWeight:'bold', marginBottom:'5px'}}>Tipo</label>
                         <div style={{display:'flex', gap:'8px'}}>
                           <button type="button" onClick={() => setTipoCliente('AVULSO')} style={tipoCliente === 'AVULSO' ? btnChipOn : btnChipOff}>Avulsa</button>
                           <button type="button" onClick={() => setTipoCliente('MENSALISTA')} style={tipoCliente === 'MENSALISTA' ? btnChipOn : btnChipOff}>Mensalista</button>
                         </div>
                     </div>
                     {tipoCliente === 'MENSALISTA' && (
                       <>
                         <div style={{marginBottom:'15px'}}>
                           <label style={{display:'block', fontSize:'12px', fontWeight:'bold', marginBottom:'5px'}}>Valor da mensalidade (opcional)</label>
                           <input value={mensalidadeValor} onChange={e => setMensalidadeValor(e.target.value)} style={inputStyle} placeholder="Ex: 150 — senão soma os serviços" inputMode="decimal" />
                         </div>
                         <div style={{marginBottom:'8px'}}>
                           <label style={{display:'block', fontSize:'12px', fontWeight:'bold', marginBottom:'5px'}}>Quando cobra</label>
                           <div style={{display:'flex', flexDirection:'column', gap:'8px'}}>
                             <button type="button" onClick={() => { setDiaVencimento('10'); setOffsetVencimento('1') }} style={diaVencimento === '10' && offsetVencimento === '1' ? btnChipOn : btnChipOff}>Dia 10 do mês seguinte</button>
                             <button type="button" onClick={() => { setDiaVencimento('31'); setOffsetVencimento('0') }} style={diaVencimento === '31' && offsetVencimento === '0' ? btnChipOn : btnChipOff}>Último dia do mês dos serviços</button>
                           </div>
                         </div>
                         <div style={{display:'flex', gap:'10px', marginBottom:'20px'}}>
                           <div style={{flex:1}}>
                             <label style={{display:'block', fontSize:'12px', fontWeight:'bold', marginBottom:'5px'}}>Dia</label>
                             <input type="number" min="1" max="31" value={diaVencimento} onChange={e => setDiaVencimento(e.target.value)} style={inputStyle} />
                           </div>
                           <div style={{flex:1}}>
                             <label style={{display:'block', fontSize:'12px', fontWeight:'bold', marginBottom:'5px'}}>Mês</label>
                             <select value={offsetVencimento} onChange={e => setOffsetVencimento(e.target.value)} style={inputStyle}>
                               <option value="0">Mesmo mês</option>
                               <option value="1">Mês seguinte</option>
                             </select>
                           </div>
                         </div>
                       </>
                     )}
                     {tipoCliente !== 'MENSALISTA' && <div style={{marginBottom:'20px'}} />}
                     <button type="submit" style={btnStyle}>Salvar</button>
                 </form>
             </div>
        </div>
      )}

      <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
    </div>
  )
}

const inputStyle = { width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ccc', boxSizing:'border-box' }
const btnStyle = { width: '100%', padding: '12px', borderRadius: '8px', border: 'none', background: '#2563eb', color: 'white', fontWeight: 'bold', cursor:'pointer' }
const btnChipOn = { flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #2563eb', background: '#eff6ff', color: '#2563eb', fontWeight: 'bold', cursor: 'pointer' }
const btnChipOff = { flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontWeight: 'bold', cursor: 'pointer' }

function chipFiltro(ativo) {
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

function passaFiltroItem(item, filtroTipo, filtroPagamento) {
  if (filtroTipo === 'SERVICOS' && item.tipo !== 'servico') return false
  if (filtroTipo === 'COMPRAS' && item.tipo !== 'compra') return false
  if (filtroPagamento === 'TODOS') return true
  if (filtroPagamento === 'MENSALIDADE') {
    return item.payment_method === 'MENSALIDADE' || item.category === 'mensalidade'
  }
  return item.payment_method === filtroPagamento
}

function rotuloTotal(filtroTipo, filtroPagamento) {
  const tipo = filtroTipo === 'SERVICOS' ? 'SERVIÇOS' : filtroTipo === 'COMPRAS' ? 'COMPRAS' : 'TOTAL'
  if (filtroPagamento === 'TODOS') return tipo
  return `${tipo} · ${labelPagamento(filtroPagamento)}`
}