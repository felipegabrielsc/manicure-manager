// src/pages/Cadastro.jsx
import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { useNavigate } from 'react-router-dom'
import { User, Lock, Mail, Star, ArrowRight, Loader2, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'

export default function Cadastro() {
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const navigate = useNavigate()

  const handleCadastro = async (e) => {
    e.preventDefault()

    // 1. Validação básica de senha
    if (password.length < 6) {
        return toast.error("A senha precisa ter pelo menos 6 caracteres.", { icon: '🔐' })
    }

    setLoading(true)

    // 2. Cria o usuário no Supabase
    // Como desligamos o "Confirm Email" no painel, ele já cria VERIFICADO.
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    })

    if (error) {
      console.error(error) // Ajuda a ver o erro real no console se der ruim
      toast.error(error.message === "User already registered" ? "Este e-mail já está cadastrado!" : "Erro ao criar conta.")
      setLoading(false)
      return
    }

    // 3. Sucesso! O usuário já tem sessão.
    if (data.user && data.session) {
        
        // (Opcional) Cria o horário padrão para ela não começar com a agenda vazia
        // O Perfil nós NÃO criamos aqui, porque aquele Trigger do banco já faz isso sozinho.
        await supabase.from('business_hours').insert([
            { user_id: data.user.id, day_of_week: 1, open_time: '09:00', close_time: '18:00' }
        ])

        toast.success('Cadastro realizado com sucesso!')
        
        // 4. Redirecionamento Inteligente
        // Se você manteve a regra de "Nascer Bloqueada", ela vai cair na tela de Bloqueio.
        // Se você tirou a regra, ela vai cair na Agenda.
        // O navigate('/') joga ela pro sistema, e o sistema decide pra onde ela vai.
        navigate('/')
        window.location.reload() // Garante que o App recarregue pegando o novo usuário
    } 
    else {
        // Se cair aqui, é porque a opção "Confirm Email" ainda está LIGADA no painel.
        setLoading(false)
        toast.error('O sistema pediu confirmação de e-mail. Verifique o painel do Supabase.')
    }
  }

  return (
    <div style={{ height: '100vh', background: '#eef2f6', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: 'sans-serif' }}>
      <div style={{ background: 'white', padding: '30px', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', width: '100%', maxWidth: '400px', textAlign: 'center' }}>
        
        <div style={{ background: '#eff6ff', width: '60px', height: '60px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <Star size={30} color="#2563eb" />
        </div>
        
        <h2 style={{ color: '#1e3a8a', margin: '0 0 10px 0' }}>Criar Conta VIP</h2>
        <p style={{ color: '#666', marginBottom: '30px' }}>Preencha para liberar seu acesso imediato.</p>

        <form onSubmit={handleCadastro} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div style={{ position: 'relative' }}>
            <Mail size={20} color="#9ca3af" style={{ position: 'absolute', left: '12px', top: '12px' }} />
            <input required type="email" placeholder="Seu E-mail" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} />
          </div>

          <div style={{ position: 'relative' }}>
            <Lock size={20} color="#9ca3af" style={{ position: 'absolute', left: '12px', top: '12px' }} />
            <input required type="password" placeholder="Senha (Mínimo 6 dígitos)" value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} />
          </div>

          <button type="submit" disabled={loading} style={btnStyle}>
            {loading ? <><Loader2 className="spin" size={20}/> Processando...</> : <><ArrowRight size={20}/> Acessar Sistema</>}
          </button>
        </form>

        <style>{` .spin { animation: spin 1s linear infinite; } @keyframes spin { 100% { transform: rotate(360deg); } } `}</style>

      </div>
    </div>
  )
}

const inputStyle = { width: '100%', padding: '12px 12px 12px 40px', borderRadius: '8px', border: '1px solid #ccc', fontSize: '16px', boxSizing: 'border-box' }
const btnStyle = { width: '100%', padding: '15px', borderRadius: '8px', border: 'none', background: '#2563eb', color: 'white', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer', marginTop: '10px', display:'flex', alignItems:'center', justifyContent:'center', gap:'10px' }