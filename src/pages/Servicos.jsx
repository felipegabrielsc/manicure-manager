// src/pages/Servicos.jsx
import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { ArrowLeft, Save, Trash2, Scissors } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function Servicos() {
  const [servicos, setServicos] = useState([])
  const [loading, setLoading] = useState(true)
  
  // Estado do Formulário
  const [novoNome, setNovoNome] = useState('')
  const [novoPreco, setNovoPreco] = useState('')

  useEffect(() => {
    fetchServicos()
  }, [])

  async function fetchServicos() {
    setLoading(true)
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .order('name', { ascending: true })
    
    if (error) console.error(error)
    else setServicos(data || [])
    setLoading(false)
  }

  async function handleSalvar(e) {
    e.preventDefault()
    
    if (!novoNome || !novoPreco) return alert("Preencha nome e preço!")

    const novoServico = {
      name: novoNome,
      default_price: parseFloat(novoPreco.replace(',', '.')) // Garante que 25,00 vire 25.00
    }

    const { error } = await supabase.from('services').insert(novoServico)

    if (error) {
      alert('Erro ao salvar: ' + error.message)
    } else {
      setNovoNome('')
      setNovoPreco('')
      fetchServicos() // Recarrega a lista
    }
  }

  async function handleExcluir(id) {
    if (confirm('Tem certeza? Isso não apaga agendamentos passados, apenas remove da lista de novos.')) {
      const { error } = await supabase.from('services').delete().eq('id', id)
      if (!error) fetchServicos()
    }
  }

  return (
    <div style={{ paddingBottom: '50px' }}>
      
      {/* Cabeçalho */}
      <div style={{ 
        background: 'white', padding: '15px 20px', 
        position: 'sticky', top: 0, zIndex: 10,
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
        display: 'flex', alignItems: 'center', gap: '15px'
      }}>
        <Link to="/" style={{ color: '#000' }}><ArrowLeft size={28} /></Link>
        <h2 style={{ margin: 0, fontSize: '20px', color: '#000' }}>Gerenciar Serviços</h2>
      </div>

      <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
        
        {/* Card de Cadastro */}
        <div style={{ background: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', border: '1px solid #ddd', marginBottom: '30px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
            <Scissors color="#2563eb" />
            <h3 style={{ margin: 0, color: '#2563eb' }}>Novo Serviço</h3>
          </div>
          
          <form onSubmit={handleSalvar} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div>
              <label style={labelStyle}>Nome do Serviço</label>
              <input 
                placeholder="Ex: Pé e Mão" 
                value={novoNome} 
                onChange={e => setNovoNome(e.target.value)}
                style={inputStyle}
              />
            </div>
            
            <div>
              <label style={labelStyle}>Preço Padrão (R$)</label>
              <input 
                type="number" 
                step="0.01"
                placeholder="Ex: 45.00" 
                value={novoPreco} 
                onChange={e => setNovoPreco(e.target.value)}
                style={inputStyle}
              />
            </div>

            <button type="submit" style={btnSalvar}>
              <Save size={20} style={{ marginRight: '10px' }} /> 
              Salvar Serviço
            </button>
          </form>
        </div>

        {/* Lista de Serviços */}
        <h3 style={{ color: '#000', borderBottom: '2px solid #ddd', paddingBottom: '10px' }}>
          Tabela de Preços ({servicos.length})
        </h3>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {loading ? <p>Carregando...</p> : servicos.map(s => (
            <div key={s.id} style={{ 
              background: 'white', padding: '15px', borderRadius: '8px', 
              border: '1px solid #ccc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' 
            }}>
              <div>
                <strong style={{ fontSize: '18px', display: 'block', color: '#000' }}>{s.name}</strong>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <span style={{ 
                  background: '#dcfce7', color: '#14532d', 
                  padding: '5px 10px', borderRadius: '6px', fontWeight: 'bold' 
                }}>
                  R$ {s.default_price}
                </span>
                <button onClick={() => handleExcluir(s.id)} style={{ background: 'none', border: 'none', color: '#dc2626' }}>
                  <Trash2 size={24} />
                </button>
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}

const inputStyle = {
  padding: '12px', borderRadius: '8px', border: '1px solid #000', // Borda preta para contraste
  fontSize: '18px', width: '100%', boxSizing: 'border-box'
}

const labelStyle = {
  display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#000'
}

const btnSalvar = {
  padding: '15px', borderRadius: '8px', border: 'none',
  background: '#2563eb', color: 'white', fontWeight: 'bold', fontSize: '18px',
  display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '10px'
}