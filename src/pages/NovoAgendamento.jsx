// src/pages/NovoAgendamento.jsx
import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Calendar, User, Scissors, CheckCircle, AlertCircle, Save } from 'lucide-react'
import SelectBusca from '../components/SelectBusca'
import toast from 'react-hot-toast'
import {
  fetchSchedulingContext,
  validateBookingSlot,
  getServiceDuration,
} from '../utils/scheduling'

import { calcularDesconto } from '../utils/exportReport'

export default function NovoAgendamento() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [userId, setUserId] = useState(null)

  const [clientes, setClientes] = useState([])
  const [servicos, setServicos] = useState([])
  const [staffList, setStaffList] = useState([])
  const [locations, setLocations] = useState([])

  const [selectedClienteId, setSelectedClienteId] = useState('')
  const [selectedServicoId, setSelectedServicoId] = useState('')
  const [selectedStaffId, setSelectedStaffId] = useState('')
  const [selectedLocationId, setSelectedLocationId] = useState('')
  const [cupomCodigo, setCupomCodigo] = useState('')
  const [cupomAplicado, setCupomAplicado] = useState(null)
  const [dataHora, setDataHora] = useState('')

  useEffect(() => {
    async function fetchDados() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)

      const [{ data: c }, { data: s }, { data: st }, { data: loc }] = await Promise.all([
        supabase.from('clients').select('*').order('name'),
        supabase.from('services').select('*').order('name'),
        supabase.from('staff_members').select('*').eq('active', true).order('name'),
        supabase.from('locations').select('*').eq('active', true).order('name'),
      ])
      setClientes(c || [])
      setServicos(s || [])
      setStaffList(st || [])
      setLocations(loc || [])
      const defaultLoc = loc?.find(l => l.is_default)
      if (defaultLoc) setSelectedLocationId(defaultLoc.id)
    }
    fetchDados()
  }, [])

  const clienteSelecionado = clientes.find(c => c.id == selectedClienteId)
  const servicoSelecionado = servicos.find(s => s.id == selectedServicoId)
  const isMensalista = clienteSelecionado?.type === 'MENSALISTA'
  const precoPreview = servicoSelecionado?.default_price || 0
  const duracaoPreview = getServiceDuration(servicoSelecionado)
  const descontoPreview = cupomAplicado && !isMensalista
    ? calcularDesconto(precoPreview, cupomAplicado.discount_type, cupomAplicado.discount_value)
    : 0
  const precoComDesconto = isMensalista ? 0 : Math.max(0, precoPreview - descontoPreview)

  async function aplicarCupom() {
    if (!cupomCodigo || !userId) return
    const { data, error } = await supabase.rpc('validar_cupom', { p_user_id: userId, p_code: cupomCodigo })
    if (error || !data?.valid) toast.error(data?.reason || 'Cupom inválido')
    else {
      setCupomAplicado(data)
      toast.success('Cupom aplicado!')
    }
  }

  const optionsClientes = clientes.map(c => ({
    id: c.id,
    label: c.name,
    subLabel: c.type === 'MENSALISTA' ? 'Pacote Mensal' : null
  }))

  const optionsServicos = servicos.map(s => ({
    id: s.id,
    label: s.name,
    subLabel: `R$ ${s.default_price.toFixed(2)} · ${getServiceDuration(s)} min`
  }))

  async function handleSalvar(e) {
    e.preventDefault()

    if (!selectedClienteId || !selectedServicoId || !dataHora) {
      return toast.error('Preencha todos os campos!')
    }

    if (!userId) return toast.error('Usuário não autenticado.')

    setLoading(true)
    const startTime = new Date(dataHora)
    const durationMinutes = getServiceDuration(servicoSelecionado)

    const ctx = await fetchSchedulingContext(supabase, userId, startTime)
    const validation = validateBookingSlot({
      startTime,
      durationMinutes,
      businessHours: ctx.businessHours,
      appointments: ctx.appointments,
      blockedSlots: ctx.blockedSlots,
      staffId: selectedStaffId || null,
    })

    if (!validation.valid) {
      setLoading(false)
      return toast.error(validation.reason)
    }

    let { data: rpcCheck, error: rpcErr } = await supabase.rpc('validar_horario_agendamento', {
      p_user_id: userId,
      p_start_time: startTime.toISOString(),
      p_duration_minutes: durationMinutes,
      p_staff_id: selectedStaffId || null,
    })
    if (rpcErr) {
      const retry = await supabase.rpc('validar_horario_agendamento', {
        p_user_id: userId,
        p_start_time: startTime.toISOString(),
        p_duration_minutes: durationMinutes,
      })
      rpcCheck = retry.data
      rpcErr = retry.error
    }

    if (!rpcErr && rpcCheck?.valid === false) {
      setLoading(false)
      return toast.error(rpcCheck.reason || 'Horário indisponível.')
    }

    const precoFinal = precoComDesconto

    const { error } = await supabase.from('appointments').insert({
      client_id: selectedClienteId,
      service_id: selectedServicoId,
      start_time: startTime.toISOString(),
      agreed_price: precoFinal,
      status: 'AGENDADO',
      user_id: userId,
      staff_id: selectedStaffId || null,
      location_id: selectedLocationId || null,
      coupon_id: cupomAplicado?.coupon_id || null,
      discount_applied: descontoPreview || 0,
    })

    if (!error && cupomAplicado?.coupon_id) {
      const { data: cup } = await supabase.from('coupons').select('uses_count').eq('id', cupomAplicado.coupon_id).single()
      await supabase.from('coupons').update({ uses_count: (cup?.uses_count || 0) + 1 }).eq('id', cupomAplicado.coupon_id)
    }

    setLoading(false)

    if (error) {
      toast.error('Erro ao agendar: ' + error.message)
    } else {
      toast.success('Agendamento realizado!')
      navigate('/')
    }
  }

  return (
    <div style={{ paddingBottom: '50px', background: '#eef2f6', minHeight: '100%' }}>
      <div style={{
        background: 'white', padding: '15px 20px',
        position: 'sticky', top: 0, zIndex: 10,
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
        display: 'flex', alignItems: 'center', gap: '15px'
      }}>
        <Link to="/" style={{ color: '#000' }}><ArrowLeft size={28} /></Link>
        <h2 style={{ margin: 0, fontSize: '20px', color: '#000' }}>Novo Agendamento</h2>
      </div>

      <div className="page-inner" style={{ padding: '20px' }}>
        <form onSubmit={handleSalvar} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={cardStyle}>
            <div style={labelHeaderStyle}>
              <User size={20} color="#2563eb" />
              <span>Quem é a cliente?</span>
            </div>
            <SelectBusca placeholder="Digite para buscar..." options={optionsClientes} value={selectedClienteId} onChange={setSelectedClienteId} />
            <div style={{ textAlign: 'right' }}>
              <Link to="/clientes" style={{ fontSize: '12px', color: '#2563eb', fontWeight: 'bold', textDecoration: 'none' }}>+ Cadastrar Nova</Link>
            </div>
          </div>

          <div style={cardStyle}>
            <div style={labelHeaderStyle}>
              <Scissors size={20} color="#2563eb" />
              <span>Qual serviço?</span>
            </div>
            <SelectBusca placeholder="Selecione o serviço..." options={optionsServicos} value={selectedServicoId} onChange={setSelectedServicoId} />
          </div>

          <div style={cardStyle}>
            <div style={labelHeaderStyle}>
              <Calendar size={20} color="#2563eb" />
              <span>Quando?</span>
            </div>
            <input type="datetime-local" value={dataHora} onChange={e => setDataHora(e.target.value)} required style={inputStyle} />
            {selectedServicoId && (
              <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#64748b' }}>
                Duração estimada: {duracaoPreview} minutos
              </p>
            )}
          </div>

          {(staffList.length > 0 || locations.length > 0) && (
            <div style={cardStyle}>
              <div style={labelHeaderStyle}><User size={20} color="#2563eb" /><span>Profissional & Unidade</span></div>
              {locations.length > 0 && (
                <select value={selectedLocationId} onChange={e => setSelectedLocationId(e.target.value)} style={inputStyle}>
                  <option value="">Unidade padrão</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              )}
              {staffList.length > 0 && (
                <select value={selectedStaffId} onChange={e => setSelectedStaffId(e.target.value)} style={{ ...inputStyle, marginTop: '10px' }}>
                  <option value="">Qualquer profissional</option>
                  {staffList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              )}
            </div>
          )}

          {!isMensalista && (
            <div style={cardStyle}>
              <div style={labelHeaderStyle}><span>Cupom de desconto</span></div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input placeholder="Código" value={cupomCodigo} onChange={e => { setCupomCodigo(e.target.value.toUpperCase()); setCupomAplicado(null) }} style={{ ...inputStyle, flex: 1 }} />
                <button type="button" onClick={aplicarCupom} style={{ padding: '0 16px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>Aplicar</button>
              </div>
              {cupomAplicado && <p style={{ color: '#16a34a', fontSize: '13px', margin: '8px 0 0' }}>Desconto: R$ {descontoPreview.toFixed(2)}</p>}
            </div>
          )}

          {selectedClienteId && selectedServicoId && (
            <div style={{
              background: isMensalista ? '#f3e8ff' : '#dcfce7',
              padding: '20px', borderRadius: '12px',
              border: `2px solid ${isMensalista ? '#7e22ce' : '#16a34a'}`,
              textAlign: 'center', boxShadow: '0 4px 6px rgba(0,0,0,0.05)'
            }}>
              <span style={{ display: 'block', fontSize: '14px', color: '#444', marginBottom: '5px', fontWeight: 'bold' }}>RESUMO DA COBRANÇA</span>
              {isMensalista ? (
                <div>
                  <strong style={{ fontSize: '24px', color: '#581c87', display: 'block' }}>ISENTO</strong>
                  <span style={{ fontSize: '14px', color: '#6b21a8' }}>
                    <CheckCircle size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> Coberto pelo Pacote Mensal
                  </span>
                </div>
              ) : (
                <div>
                  <strong style={{ fontSize: '28px', color: '#14532d', display: 'block' }}>R$ {precoComDesconto.toFixed(2)}</strong>
                  {descontoPreview > 0 && <span style={{ fontSize: '12px', color: '#64748b', textDecoration: 'line-through' }}>R$ {precoPreview.toFixed(2)}</span>}
                  <span style={{ fontSize: '14px', color: '#15803d' }}>
                    <AlertCircle size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> Receber após o serviço
                  </span>
                </div>
              )}
            </div>
          )}

          <button type="submit" disabled={loading} style={{
            padding: '18px', background: '#2563eb', color: 'white', border: 'none',
            borderRadius: '12px', fontSize: '18px', fontWeight: 'bold', marginTop: '10px',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
            boxShadow: '0 4px 10px rgba(37, 99, 235, 0.3)'
          }}>
            {loading ? 'Salvando...' : <><Save size={24} /> Confirmar Agendamento</>}
          </button>
        </form>
      </div>
    </div>
  )
}

const cardStyle = { background: 'white', padding: '15px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', border: '1px solid #ddd' }
const labelHeaderStyle = { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', fontWeight: 'bold', color: '#000', fontSize: '16px' }
const inputStyle = { width: '100%', padding: '14px', borderRadius: '8px', border: '1px solid #999', fontSize: '16px', background: '#fff', color: '#000', boxSizing: 'border-box', outline: 'none' }
