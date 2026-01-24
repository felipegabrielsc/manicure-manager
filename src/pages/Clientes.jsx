// src/pages/Clientes.jsx
import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { ArrowLeft, Save, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import Modal from '../components/Modal'

export default function Clientes() {
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  
  // Estado do Formulário
  const [novoNome, setNovoNome] = useState('')
  const [novoTelefone, setNovoTelefone] = useState('')
  const [tipoCliente, setTipoCliente] = useState('AVULSO')
  const [valorMensal, setValorMensal] = useState('')
  const [diaVencimento, setDiaVencimento] = useState('')

  // Modal
  const [modalOpen, setModalOpen] = useState(false)
  const [modalConfig, setModalConfig] = useState({ type: 'info', title: '', message: '' })
  const [idParaExcluir, setIdParaExcluir] = useState(null) 

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

  // --- MÁSCARAS DE PADRONIZAÇÃO (NOVO) ---
  
  const handlePhoneChange = (e) => {
    let value = e.target.value
    // 1. Remove tudo que não é número
    value = value.replace(/\D/g, "")
    // 2. Limita a 11 dígitos (DDD + 9 números)
    value = value.slice(0, 11)
    // 3. Aplica a máscara (XX) XXXXX-XXXX
    value = value.replace(/^(\d{2})(\d)/g, "($1) $2")
    value = value.replace(/(\d)(\d{4})$/, "$1-$2")
    
    setNovoTelefone(value)
  }

  const handleValorChange = (e) => {
    let value = e.target.value
    // Permite apenas números, ponto e vírgula
    value = value.replace(/[^0-9.,]/g, '')
    setValorMensal(value)
  }

  // Função para deixar Nome Bonito (Ex: ana clara -> Ana Clara)
  const formatarNome = (nome) => {
    return nome
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  // --- FUNÇÕES DE MODAL ---
  const fecharModal = () => {
    setModalOpen(false)
    setIdParaExcluir(null)
  }
  
  const showSucesso = (msg) => {
    setModalConfig({ type: 'success', title: 'Sucesso!', message: msg })
    setModalOpen(true)
  }

  const showErro = (msg) => {
    setModalConfig({ type: 'error', title: 'Atenção', message: msg })
    setModalOpen(true)
  }
  
  const confirmarExclusao = (id, nome) => {
    setIdParaExcluir(id)
    setModalConfig({ 
      type: 'confirm', 
      title: 'Excluir Cliente?', 
      message: `Tem certeza que deseja apagar ${nome}? Todo o histórico dela será perdido.`
    })
    setModalOpen(true)
  }

  async function handleConfirmarModal() {
    if (modalConfig.type === 'confirm' && idParaExcluir) {
        const { error } = await supabase.from('clients').delete().eq('id', idParaExcluir)
        if (!error) {
            fetchClientes()
            setModalOpen(false) 
        } else {
            setModalOpen(false)
            alert('Erro ao excluir')
        }
    } else {
        fecharModal()
    }
  }

  async function handleSalvar(e) {
    e.preventDefault()
    
    if (!novoNome) return showErro("Você precisa digitar o nome da cliente!")
    
    // Validação extra para telefone incompleto
    if (novoTelefone.length > 0 && novoTelefone.length < 14) {
      return showErro("O telefone parece incompleto. Use o formato (DD) 99999-9999")
    }

    if (tipoCliente === 'MENSALISTA' && !valorMensal) return showErro("Para mensalistas, o valor é obrigatório!")

    // Padronização Final antes de Salvar
    const nomePadronizado = formatarNome(novoNome)
    // Garante que o valor financeiro use PONTO para o banco de dados (120,00 -> 120.00)
    const valorPadronizado = valorMensal ? parseFloat(valorMensal.replace(',', '.')) : null

    const novoCliente = {
      name: nomePadronizado,
      phone: novoTelefone,
      type: tipoCliente,
      monthly_fee: tipoCliente === 'MENSALISTA' ? valorPadronizado : null,
      monthly_due_day: tipoCliente === 'MENSALISTA' ? parseInt(diaVencimento) : null
    }

    const { error } = await supabase.from('clients').insert(novoCliente)

    if (error) {
      showErro('Erro ao salvar: ' + error.message)
    } else {
      showSucesso(`${nomePadronizado} cadastrada com sucesso!`)
      setNovoNome('')
      setNovoTelefone('')
      setTipoCliente('AVULSO')
      setValorMensal('')
      setDiaVencimento('')
      fetchClientes()
    }
  }

  return (
    <div style={{ paddingBottom: '50px' }}>
      
      <Modal 
        isOpen={modalOpen} 
        onClose={fecharModal} 
        type={modalConfig.type} 
        title={modalConfig.title} 
        message={modalConfig.message}
        onConfirm={handleConfirmarModal} 
      />

      {/* Cabeçalho */}
      <div style={{ background: 'white', padding: '15px 20px', position: 'sticky', top: 0, zIndex: 10, boxShadow: '0 4px 6px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', gap: '15px' }}>
        <Link to="/" style={{ color: '#000' }}><ArrowLeft size={28} /></Link>
        <h2 style={{ margin: 0, fontSize: '20px', color: '#000' }}>Gerenciar Clientes</h2>
      </div>

      <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
        
        {/* Formulário */}
        <div style={{ background: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', border: '1px solid #ddd', marginBottom: '30px' }}>
          <h3 style={{ marginTop: 0, color: '#2563eb' }}>Nova Cliente</h3>
          <form onSubmit={handleSalvar} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            
            <div>
              <label style={{display:'block', fontSize:'12px', fontWeight:'bold', marginBottom:'5px'}}>Nome Completo</label>
              <input 
                placeholder="Ex: Ana Maria" 
                value={novoNome} 
                onChange={e => setNovoNome(e.target.value)} 
                style={inputStyle} 
              />
            </div>
            
            <div>
              <label style={{display:'block', fontSize:'12px', fontWeight:'bold', marginBottom:'5px'}}>WhatsApp</label>
              <input 
                placeholder="(16) 99999-9999" 
                value={novoTelefone} 
                onChange={handlePhoneChange} // Usa a função com máscara
                maxLength={15} // Limita tamanho máximo visual
                inputMode="numeric" // Abre teclado numérico no celular
                style={inputStyle} 
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '5px' }}>
              <button type="button" onClick={() => setTipoCliente('AVULSO')} style={tipoCliente === 'AVULSO' ? btnActive : btnInactive}>Avulso</button>
              <button type="button" onClick={() => setTipoCliente('MENSALISTA')} style={tipoCliente === 'MENSALISTA' ? btnActive : btnInactive}>Mensalista</button>
            </div>

            {tipoCliente === 'MENSALISTA' && (
              <div style={{ background: '#f3e8ff', padding: '15px', borderRadius: '8px', border: '1px solid #d8b4fe' }}>
                <label style={{display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#581c87'}}>Valor Mensal (R$):</label>
                <input 
                  type="text" 
                  placeholder="Ex: 120,00" 
                  value={valorMensal} 
                  onChange={handleValorChange} // Usa máscara de moeda
                  inputMode="decimal"
                  style={{...inputStyle, borderColor: '#a855f7'}} 
                />
                
                <label style={{display: 'block', marginTop: '10px', marginBottom: '5px', fontWeight: 'bold', color: '#581c87'}}>Dia Vencimento:</label>
                <input 
                  type="number" 
                  placeholder="Ex: 5" 
                  max="31" min="1" 
                  value={diaVencimento} 
                  onChange={e => setDiaVencimento(e.target.value)} 
                  style={{...inputStyle, borderColor: '#a855f7'}} 
                />
              </div>
            )}

            <button type="submit" style={btnSalvar}><Save size={20} style={{ marginRight: '10px' }} /> Salvar Cliente</button>
          </form>
        </div>

        {/* Lista */}
        <h3 style={{ color: '#000' }}>Lista de Clientes ({clientes.length})</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {loading ? <p>Carregando...</p> : clientes.map(c => (
            <div key={c.id} style={{ background: 'white', padding: '15px', borderRadius: '8px', border: '1px solid #ddd', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong style={{ fontSize: '16px', display: 'block' }}>{c.name}</strong>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '4px' }}>
                    <span style={{ fontSize: '12px', color: c.type === 'MENSALISTA' ? '#6610f2' : '#155724', fontWeight: 'bold' }}>
                    {c.type} {c.type === 'MENSALISTA' && `- Dia ${c.monthly_due_day}`}
                    </span>
                    {c.phone && <span style={{fontSize: '12px', color: '#666'}}>• {c.phone}</span>}
                </div>
              </div>
              
              <button 
                onClick={() => confirmarExclusao(c.id, c.name)} 
                style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: '10px' }}
              >
                <Trash2 size={24} />
              </button>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}

// Estilos
const inputStyle = { padding: '12px', borderRadius: '8px', border: '1px solid #999', fontSize: '16px', width: '100%', boxSizing: 'border-box' }
const btnActive = { flex: 1, padding: '10px', borderRadius: '8px', border: '2px solid #2563eb', background: '#eff6ff', color: '#2563eb', fontWeight: 'bold', cursor: 'pointer' }
const btnInactive = { flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #ccc', background: '#fff', color: '#666', cursor: 'pointer' }
const btnSalvar = { padding: '15px', borderRadius: '8px', border: 'none', background: '#2563eb', color: 'white', fontWeight: 'bold', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '10px', cursor: 'pointer' }