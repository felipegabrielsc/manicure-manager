// src/pages/Servicos.jsx
import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { ArrowLeft, Save, Trash2, Scissors, DollarSign, Clock } from 'lucide-react'
import { Link } from 'react-router-dom'
import Modal from '../components/Modal'
import toast from 'react-hot-toast'

export default function Servicos() {
  const [servicos, setServicos] = useState([])
  const [loading, setLoading] = useState(true)
  
  // Form
  const [nome, setNome] = useState('')
  const [preco, setPreco] = useState('')
  const [duracao, setDuracao] = useState('60')

  // Modal Confirmação
  const [modalOpen, setModalOpen] = useState(false)
  const [modalConfig, setModalConfig] = useState({ type: 'info', title: '', message: '' })
  const [idParaExcluir, setIdParaExcluir] = useState(null)

  useEffect(() => { fetchServicos() }, [])

  async function fetchServicos() {
    setLoading(true)
    const { data, error } = await supabase.from('services').select('*').order('name')
    if (error) toast.error('Erro ao carregar serviços')
    else setServicos(data || [])
    setLoading(false)
  }

  // --- LÓGICA DE EXCLUSÃO SEGURA ---
  const confirmarExclusao = (id, nomeServico) => {
    setIdParaExcluir(id)
    setModalConfig({ 
        type: 'confirm', 
        title: 'Excluir Serviço?', 
        message: `Tem certeza que deseja apagar "${nomeServico}"?` 
    })
    setModalOpen(true)
  }

  async function handleConfirmarModal() {
    if (modalConfig.type === 'confirm' && idParaExcluir) {
        
        // 1. VERIFICAÇÃO DE SEGURANÇA (A BLINDAGEM)
        const { count } = await supabase
            .from('appointments')
            .select('*', { count: 'exact', head: true }) // Conta sem baixar os dados
            .eq('service_id', idParaExcluir)

        if ((count || 0) > 0) {
            setModalOpen(false)
            toast.error(`Negado! Existem ${count} agendamentos usando este serviço.`, {
                duration: 5000,
                icon: '🚫'
            })
            return
        }

        // 2. SE ESTIVER LIVRE, EXCLUI
        const { error } = await supabase.from('services').delete().eq('id', idParaExcluir)
        
        if (!error) {
            toast.success('Serviço excluído!')
            fetchServicos()
            setModalOpen(false)
        } else {
            setModalOpen(false)
            toast.error('Erro ao excluir: ' + error.message)
        }

    } else {
        setModalOpen(false)
        setIdParaExcluir(null)
    }
  }

  // --- SALVAR NOVO SERVIÇO ---
  async function handleSalvar(e) {
    e.preventDefault()
    if (!nome || !preco) return toast.error("Preencha nome e preço!")
    const duracaoNum = parseInt(duracao, 10)
    if (!duracaoNum || duracaoNum < 15) return toast.error('Duração mínima: 15 minutos.')

    const { data: { user } } = await supabase.auth.getUser()
    
    const novoServico = {
        name: nome,
        default_price: parseFloat(preco.replace(',', '.')),
        duration_minutes: duracaoNum,
        user_id: user.id
    }

    const { error } = await supabase.from('services').insert(novoServico)

    if (error) {
        toast.error(error.message)
    } else {
        toast.success('Serviço salvo!')
        setNome('')
        setPreco('')
        setDuracao('60')
        fetchServicos()
    }
  }

  // Máscara simples de moeda
  const handlePrecoChange = (e) => {
    const v = e.target.value.replace(/[^0-9.,]/g, '')
    setPreco(v)
  }

  return (
    <div style={{ paddingBottom: '50px' }}>
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} type={modalConfig.type} title={modalConfig.title} message={modalConfig.message} onConfirm={handleConfirmarModal} />

      {/* CABEÇALHO */}
      <div className="header-safe-area" style={{ background: 'white', padding: '15px 20px', position: 'sticky', top: 0, zIndex: 10, boxShadow: '0 4px 6px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', gap: '15px' }}>
        <Link to="/" style={{ color: '#000' }}><ArrowLeft size={28} /></Link>
        <h2 style={{ margin: 0, fontSize: '20px', color: '#000' }}>Meus Serviços</h2>
      </div>

      <div className="page-inner" style={{ padding: '20px' }}>
        
        {/* CARD DE CADASTRO */}
        <div style={{ background: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', border: '1px solid #ddd', marginBottom: '30px' }}>
          <h3 style={{ marginTop: 0, color: '#2563eb', display:'flex', alignItems:'center', gap:'10px' }}><Scissors size={20}/> Novo Serviço</h3>
          
          <form onSubmit={handleSalvar} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div>
                <label style={{display:'block', fontSize:'12px', fontWeight:'bold', marginBottom:'5px'}}>Nome do Serviço</label>
                <input placeholder="Ex: Pé e Mão" value={nome} onChange={e => setNome(e.target.value)} style={inputStyle} />
            </div>
            
            <div>
                <label style={{display:'block', fontSize:'12px', fontWeight:'bold', marginBottom:'5px'}}>Preço Padrão (R$)</label>
                <div style={{position:'relative'}}>
                    <DollarSign size={16} color="#666" style={{position:'absolute', left:'10px', top:'14px'}}/>
                    <input placeholder="0.00" value={preco} onChange={handlePrecoChange} inputMode="decimal" style={{...inputStyle, paddingLeft:'30px'}} />
                </div>
            </div>

            <div>
                <label style={{display:'block', fontSize:'12px', fontWeight:'bold', marginBottom:'5px'}}>Duração (minutos)</label>
                <div style={{position:'relative'}}>
                    <Clock size={16} color="#666" style={{position:'absolute', left:'10px', top:'14px'}}/>
                    <select value={duracao} onChange={e => setDuracao(e.target.value)} style={{...inputStyle, paddingLeft:'30px'}}>
                        <option value="30">30 min</option>
                        <option value="45">45 min</option>
                        <option value="60">1 hora</option>
                        <option value="90">1h 30min</option>
                        <option value="120">2 horas</option>
                    </select>
                </div>
            </div>

            <button type="submit" style={btnSalvar}>
                <Save size={20} style={{ marginRight: '10px' }} /> Salvar Serviço
            </button>
          </form>
        </div>

        {/* LISTA DE SERVIÇOS */}
        <h3 style={{ color: '#000' }}>Lista ({servicos.length})</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {loading ? <p style={{textAlign:'center'}}>Carregando...</p> : servicos.map(s => (
            <div key={s.id} style={{ background: 'white', padding: '15px', borderRadius: '8px', border: '1px solid #ddd', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{display:'flex', alignItems:'center', gap:'15px'}}>
                <div style={{background:'#eff6ff', padding:'10px', borderRadius:'8px'}}><Scissors size={20} color="#2563eb"/></div>
                <div>
                    <strong style={{ fontSize: '16px', display: 'block' }}>{s.name}</strong>
                    <span style={{ fontSize: '14px', color: '#16a34a', fontWeight:'bold' }}>R$ {s.default_price.toFixed(2)}</span>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>{s.duration_minutes ?? 60} min</span>
                </div>
              </div>
              <button onClick={() => confirmarExclusao(s.id, s.name)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: '10px' }}>
                <Trash2 size={20} />
              </button>
            </div>
          ))}
          
          {servicos.length === 0 && !loading && (
            <p style={{textAlign:'center', color:'#999', marginTop:'20px'}}>Nenhum serviço cadastrado.</p>
          )}
        </div>

      </div>
    </div>
  )
}

const inputStyle = { padding: '12px', borderRadius: '8px', border: '1px solid #999', fontSize: '16px', width: '100%', boxSizing: 'border-box' }
const btnSalvar = { padding: '15px', borderRadius: '8px', border: 'none', background: '#2563eb', color: 'white', fontWeight: 'bold', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '10px', cursor: 'pointer' }