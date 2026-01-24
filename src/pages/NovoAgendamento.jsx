// src/pages/NovoAgendamento.jsx
import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Calendar, User, Scissors, CheckCircle, AlertCircle, Save } from 'lucide-react'
import SelectBusca from '../components/SelectBusca'

export default function NovoAgendamento() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)

  // Dados do Banco
  const [clientes, setClientes] = useState([])
  const [servicos, setServicos] = useState([])

  // Dados do Formulário
  const [selectedClienteId, setSelectedClienteId] = useState('')
  const [selectedServicoId, setSelectedServicoId] = useState('')
  const [dataHora, setDataHora] = useState('')

  // Efeito para carregar listas
  useEffect(() => {
    async function fetchDados() {
      const { data: c } = await supabase.from('clients').select('*').order('name')
      const { data: s } = await supabase.from('services').select('*').order('name')
      setClientes(c || [])
      setServicos(s || [])
    }
    fetchDados()
  }, [])

  // Lógica de "Preview" (Cálculo em tempo real)
  const clienteSelecionado = clientes.find(c => c.id == selectedClienteId)
  const servicoSelecionado = servicos.find(s => s.id == selectedServicoId)

  const isMensalista = clienteSelecionado?.type === 'MENSALISTA'
  const precoPreview = servicoSelecionado?.default_price || 0

  const optionsClientes = clientes.map(c => ({
    id: c.id,
    label: c.name,
    subLabel: c.type === 'MENSALISTA' ? 'Pacote Mensal' : null
  }))

  const optionsServicos = servicos.map(s => ({
    id: s.id,
    label: s.name,
    subLabel: `R$ ${s.default_price.toFixed(2)}`
  }))

  async function handleSalvar(e) {
    e.preventDefault()

    if (!selectedClienteId || !selectedServicoId || !dataHora) {
      return alert('Preencha todos os campos!')
    }

    setLoading(true)

    // A Lógica de Negócio (O Segredo)
    // Se for MENSALISTA, salva 0.00. Se for AVULSO, salva o preço do serviço.
    const precoFinal = isMensalista ? 0 : precoPreview

    const { data: { user } } = await supabase.auth.getUser()

    const { error } = await supabase
      .from('appointments')
      .insert({
        client_id: selectedClienteId,
        service_id: selectedServicoId,
        start_time: new Date(dataHora).toISOString(),
        agreed_price: precoFinal,
        status: 'AGENDADO',
        user_id: user.id
      })

    if (error) {
      alert('Erro: ' + error.message)
      setLoading(false)
    } else {
      // Sucesso! Volta pra agenda
      navigate('/')
    }
  }

  return (
    <div style={{ paddingBottom: '50px', background: '#eef2f6', minHeight: '100vh' }}>

      {/* CABEÇALHO */}
      <div style={{
        background: 'white', padding: '15px 20px',
        position: 'sticky', top: 0, zIndex: 10,
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
        display: 'flex', alignItems: 'center', gap: '15px'
      }}>
        <Link to="/" style={{ color: '#000' }}><ArrowLeft size={28} /></Link>
        <h2 style={{ margin: 0, fontSize: '20px', color: '#000' }}>Novo Agendamento</h2>
      </div>

      <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>

        <form onSubmit={handleSalvar} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* PASSO 1: QUEM? */}
          <div style={cardStyle}>
            <div style={labelHeaderStyle}>
              <User size={20} color="#2563eb" />
              <span>Quem é a cliente?</span>
            </div>

            <SelectBusca
              placeholder="Digite para buscar..."
              options={optionsClientes}
              value={selectedClienteId}
              onChange={setSelectedClienteId}
            />

            <div style={{ textAlign: 'right' }}>
              <Link to="/clientes" style={{ fontSize: '12px', color: '#2563eb', fontWeight: 'bold', textDecoration: 'none' }}>+ Cadastrar Nova</Link>
            </div>
          </div>

          {/* PASSO 2: O QUE? */}
          <div style={cardStyle}>
            <div style={labelHeaderStyle}>
              <Scissors size={20} color="#2563eb" />
              <span>Qual serviço?</span>
            </div>

            <SelectBusca
              placeholder="Selecione o serviço..."
              options={optionsServicos}
              value={selectedServicoId}
              onChange={setSelectedServicoId}
            />
          </div>

          {/* PASSO 3: QUANDO? */}
          <div style={cardStyle}>
            <div style={labelHeaderStyle}>
              <Calendar size={20} color="#2563eb" />
              <span>Quando?</span>
            </div>
            <input
              type="datetime-local"
              value={dataHora}
              onChange={e => setDataHora(e.target.value)}
              required
              style={inputStyle}
            />
          </div>

          {/* CARD DE RESUMO FINANCEIRO (AUTOMÁTICO) */}
          {selectedClienteId && selectedServicoId && (
            <div style={{
              background: isMensalista ? '#f3e8ff' : '#dcfce7',
              padding: '20px', borderRadius: '12px',
              border: `2px solid ${isMensalista ? '#7e22ce' : '#16a34a'}`,
              textAlign: 'center', boxShadow: '0 4px 6px rgba(0,0,0,0.05)'
            }}>
              <span style={{ display: 'block', fontSize: '14px', color: '#444', marginBottom: '5px', fontWeight: 'bold' }}>
                RESUMO DA COBRANÇA
              </span>

              {isMensalista ? (
                // VISUAL MENSALISTA
                <div>
                  <strong style={{ fontSize: '24px', color: '#581c87', display: 'block' }}>ISENTO</strong>
                  <span style={{ fontSize: '14px', color: '#6b21a8' }}>
                    <CheckCircle size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> Coberto pelo Pacote Mensal
                  </span>
                </div>
              ) : (
                // VISUAL AVULSO
                <div>
                  <strong style={{ fontSize: '28px', color: '#14532d', display: 'block' }}>
                    R$ {precoPreview.toFixed(2)}
                  </strong>
                  <span style={{ fontSize: '14px', color: '#15803d' }}>
                    <AlertCircle size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> Receber após o serviço
                  </span>
                </div>
              )}
            </div>
          )}

          {/* BOTÃO SALVAR */}
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '18px',
              background: '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              fontSize: '18px',
              fontWeight: 'bold',
              marginTop: '10px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
              boxShadow: '0 4px 10px rgba(37, 99, 235, 0.3)'
            }}
          >
            {loading ? 'Salvando...' : (
              <>
                <Save size={24} /> Confirmar Agendamento
              </>
            )}
          </button>

        </form>
      </div>
    </div>
  )
}

// Estilos
const cardStyle = {
  background: 'white',
  padding: '15px',
  borderRadius: '12px',
  boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
  border: '1px solid #ddd'
}

const labelHeaderStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  marginBottom: '10px',
  fontWeight: 'bold',
  color: '#000',
  fontSize: '16px'
}

const inputStyle = {
  width: '100%',
  padding: '14px',
  borderRadius: '8px',
  border: '1px solid #999', // Contraste alto na borda
  fontSize: '16px',
  background: '#fff',
  color: '#000',
  boxSizing: 'border-box',
  outline: 'none'
}