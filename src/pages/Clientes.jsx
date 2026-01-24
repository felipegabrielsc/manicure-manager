// src/pages/Clientes.jsx
import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { ArrowLeft, Save, Trash2, X, Clock } from 'lucide-react'
import { Link } from 'react-router-dom'
import Modal from '../components/Modal'


export default function Clientes() {
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  
  // Form
  const [novoNome, setNovoNome] = useState('')
  const [novoTelefone, setNovoTelefone] = useState('')
  const [tipoCliente, setTipoCliente] = useState('AVULSO')
  const [valorMensal, setValorMensal] = useState('')
  const [diaVencimento, setDiaVencimento] = useState('')

  // Modal Confirmação
  const [modalOpen, setModalOpen] = useState(false)
  const [modalConfig, setModalConfig] = useState({ type: 'info', title: '', message: '' })
  const [idParaExcluir, setIdParaExcluir] = useState(null) 

  // Modal Detalhes (Ficha)
  const [clienteDetalhe, setClienteDetalhe] = useState(null)
  const [historicoCliente, setHistoricoCliente] = useState([])
  const [modalDetalheOpen, setModalDetalheOpen] = useState(false)

  

  useEffect(() => {
    fetchClientes()
  }, [])

  async function fetchClientes() {
    setLoading(true)
    const { data, error } = await supabase.from('clients').select('*').order('name')
    if (error) console.error(error)
    else setClientes(data || [])
    setLoading(false)
  }

  // --- BUSCA HISTÓRICO PARA A FICHA ---
  async function abrirDetalhes(cliente) {
    setClienteDetalhe(cliente)
    setModalDetalheOpen(true)
    
    // Busca últimos 5 agendamentos concluídos
    const { data } = await supabase
      .from('appointments')
      .select('start_time, services(name), agreed_price')
      .eq('client_id', cliente.id)
      .eq('status', 'CONCLUIDO')
      .order('start_time', { ascending: false })
      .limit(5)
      
    setHistoricoCliente(data || [])
  }

  // Formatação
  const handlePhoneChange = (e) => {
    let value = e.target.value.replace(/\D/g, "").slice(0, 11)
    value = value.replace(/^(\d{2})(\d)/g, "($1) $2")
    value = value.replace(/(\d)(\d{4})$/, "$1-$2")
    setNovoTelefone(value)
  }
  const handleValorChange = (e) => setValorMensal(e.target.value.replace(/[^0-9.,]/g, ''))
  const formatarNome = (nome) => nome.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')

  // Modais
  const fecharModal = () => { setModalOpen(false); setIdParaExcluir(null) }
  const showSucesso = (msg) => { setModalConfig({ type: 'success', title: 'Sucesso!', message: msg }); setModalOpen(true) }
  const showErro = (msg) => { setModalConfig({ type: 'error', title: 'Atenção', message: msg }); setModalOpen(true) }
  
  const confirmarExclusao = (e, id, nome) => {
    e.stopPropagation() // Não abre detalhes
    setIdParaExcluir(id)
    setModalConfig({ type: 'confirm', title: 'Excluir Cliente?', message: `Tem certeza que deseja apagar ${nome}?` })
    setModalOpen(true)
  }

  async function handleConfirmarModal() {
    if (modalConfig.type === 'confirm' && idParaExcluir) {
        const { error } = await supabase.from('clients').delete().eq('id', idParaExcluir)
        if (!error) { fetchClientes(); setModalOpen(false) } 
        else { setModalOpen(false); alert('Erro ao excluir') }
    } else { fecharModal() }
  }

  async function handleSalvar(e) {
    e.preventDefault()
    if (!novoNome) return showErro("Nome obrigatório!")
    const nomePadronizado = formatarNome(novoNome)
    const valorPadronizado = valorMensal ? parseFloat(valorMensal.replace(',', '.')) : null

    const { data: { user } } = await supabase.auth.getUser()

    const novoCliente = {
      name: nomePadronizado,
      phone: novoTelefone,
      type: tipoCliente,
      user_id: user.id,
      monthly_fee: tipoCliente === 'MENSALISTA' ? valorPadronizado : null,
      monthly_due_day: tipoCliente === 'MENSALISTA' ? parseInt(diaVencimento) : null
    }

    const { error } = await supabase.from('clients').insert(novoCliente)
    if (error) showErro(error.message)
    else {
      showSucesso(`${nomePadronizado} salva!`)
      setNovoNome(''); setNovoTelefone(''); setTipoCliente('AVULSO'); setValorMensal(''); setDiaVencimento('');
      fetchClientes()
    }
  }

  return (
    <div style={{ paddingBottom: '50px' }}>
      <Modal isOpen={modalOpen} onClose={fecharModal} type={modalConfig.type} title={modalConfig.title} message={modalConfig.message} onConfirm={handleConfirmarModal} />

      {/* MODAL DETALHES (FICHA DA CLIENTE) */}
      {modalDetalheOpen && clienteDetalhe && (
        <div style={overlayStyle} onClick={(e) => { if(e.target === e.currentTarget) setModalDetalheOpen(false) }}>
          <div style={modalBoxStyle}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px'}}>
               <h3 style={{margin:0, color:'#000'}}>{clienteDetalhe.name}</h3>
               <button onClick={() => setModalDetalheOpen(false)} style={{background:'none', border:'none', cursor:'pointer'}}><X size={24}/></button>
            </div>
            
            <p style={{marginBottom:'5px'}}><strong>WhatsApp:</strong> {clienteDetalhe.phone || 'Não informado'}</p>
            <p><strong>Tipo:</strong> <span style={{fontWeight:'bold', color: clienteDetalhe.type === 'MENSALISTA' ? '#6610f2' : '#155724'}}>{clienteDetalhe.type}</span></p>
            
            <h4 style={{marginTop:'25px', marginBottom:'10px', borderBottom:'1px solid #ccc', paddingBottom:'5px', color:'#000'}}>Últimos Serviços (Concluídos)</h4>
            {historicoCliente.length === 0 ? <p style={{color:'#666'}}>Nenhum serviço registrado.</p> : (
              <ul style={{paddingLeft:'0', listStyle:'none'}}>
                {historicoCliente.map((h, i) => (
                  <li key={i} style={{marginBottom:'10px', paddingBottom:'10px', borderBottom:'1px solid #eee', display:'flex', alignItems:'center', gap:'10px'}}>
                    <Clock size={16} color="#666"/>
                    <div>
                      <span style={{fontWeight:'bold', color:'#000', display:'block'}}>{h.services?.name}</span>
                      <small style={{color:'#666'}}>{new Date(h.start_time).toLocaleDateString()} • R$ {h.agreed_price}</small>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <button onClick={() => setModalDetalheOpen(false)} style={{...btnSalvar, background:'#666', marginTop:'20px'}}>Fechar</button>
          </div>
        </div>
      )}

      {/* CABEÇALHO */}
      <div className="header-safe-area" style={{ background: 'white', padding: '15px 20px', position: 'sticky', top: 0, zIndex: 10, boxShadow: '0 4px 6px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', gap: '15px' }}>
        <Link to="/" style={{ color: '#000' }}><ArrowLeft size={28} /></Link>
        <h2 style={{ margin: 0, fontSize: '20px', color: '#000' }}>Gerenciar Clientes</h2>
      </div>

      <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
        <div style={{ background: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', border: '1px solid #ddd', marginBottom: '30px' }}>
          <h3 style={{ marginTop: 0, color: '#2563eb' }}>Nova Cliente</h3>
          <form onSubmit={handleSalvar} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div><label style={{display:'block', fontSize:'12px', fontWeight:'bold', marginBottom:'5px'}}>Nome Completo</label><input placeholder="Ex: Ana Maria" value={novoNome} onChange={e => setNovoNome(e.target.value)} style={inputStyle} /></div>
            <div><label style={{display:'block', fontSize:'12px', fontWeight:'bold', marginBottom:'5px'}}>WhatsApp</label><input placeholder="(16) 99999-9999" value={novoTelefone} onChange={handlePhoneChange} maxLength={15} inputMode="numeric" style={inputStyle} /></div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '5px' }}>
              <button type="button" onClick={() => setTipoCliente('AVULSO')} style={tipoCliente === 'AVULSO' ? btnActive : btnInactive}>Avulso</button>
              <button type="button" onClick={() => setTipoCliente('MENSALISTA')} style={tipoCliente === 'MENSALISTA' ? btnActive : btnInactive}>Mensalista</button>
            </div>
            {tipoCliente === 'MENSALISTA' && (
              <div style={{ background: '#f3e8ff', padding: '15px', borderRadius: '8px', border: '1px solid #d8b4fe' }}>
                <label style={{display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#581c87'}}>Valor Mensal (R$):</label><input type="text" placeholder="Ex: 120,00" value={valorMensal} onChange={handleValorChange} inputMode="decimal" style={{...inputStyle, borderColor: '#a855f7'}} />
                <label style={{display: 'block', marginTop: '10px', marginBottom: '5px', fontWeight: 'bold', color: '#581c87'}}>Dia Vencimento:</label><input type="number" placeholder="Ex: 5" max="31" min="1" value={diaVencimento} onChange={e => setDiaVencimento(e.target.value)} style={{...inputStyle, borderColor: '#a855f7'}} />
              </div>
            )}
            <button type="submit" style={btnSalvar}><Save size={20} style={{ marginRight: '10px' }} /> Salvar Cliente</button>
          </form>
        </div>

        <h3 style={{ color: '#000' }}>Lista de Clientes ({clientes.length})</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {loading ? <p>Carregando...</p> : clientes.map(c => (
            <div key={c.id} onClick={() => abrirDetalhes(c)} style={{ background: 'white', padding: '15px', borderRadius: '8px', border: '1px solid #ddd', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
              <div>
                <strong style={{ fontSize: '16px', display: 'block' }}>{c.name}</strong>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '4px' }}>
                    <span style={{ fontSize: '12px', color: c.type === 'MENSALISTA' ? '#6610f2' : '#155724', fontWeight: 'bold' }}>{c.type}</span>
                    {c.phone && <span style={{fontSize: '12px', color: '#666'}}>• {c.phone}</span>}
                </div>
              </div>
              <button onClick={(e) => confirmarExclusao(e, c.id, c.name)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: '10px' }}><Trash2 size={24} /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const inputStyle = { padding: '12px', borderRadius: '8px', border: '1px solid #999', fontSize: '16px', width: '100%', boxSizing: 'border-box' }
const btnActive = { flex: 1, padding: '10px', borderRadius: '8px', border: '2px solid #2563eb', background: '#eff6ff', color: '#2563eb', fontWeight: 'bold', cursor: 'pointer' }
const btnInactive = { flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #ccc', background: '#fff', color: '#666', cursor: 'pointer' }
const btnSalvar = { padding: '15px', borderRadius: '8px', border: 'none', background: '#2563eb', color: 'white', fontWeight: 'bold', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '10px', cursor: 'pointer' }
const overlayStyle = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }
const modalBoxStyle = { background: 'white', width: '90%', maxWidth: '400px', borderRadius: '16px', padding: '25px', animation: 'fadeIn 0.2s', maxHeight:'80vh', overflowY:'auto' }