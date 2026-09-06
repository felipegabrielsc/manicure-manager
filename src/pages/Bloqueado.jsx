// src/pages/Bloqueado.jsx
import { ShieldAlert, Clock, MessageCircle } from 'lucide-react'
import { openSupportWhatsApp } from '../config/app'
import UnlockAdminForm from '../components/UnlockAdminForm'
import { useSessionProfile } from '../context/SessionProfile'

export default function Bloqueado() {
  const { refreshProfile } = useSessionProfile()
  const abrirSuporte = () => openSupportWhatsApp('Olá, acabei de me cadastrar no sistema. Poderia liberar meu acesso?')

  return (
    <div style={{ height: '100vh', background: '#f0f9ff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', textAlign: 'center', fontFamily: 'sans-serif' }}>
      
      <div style={{ background: '#fff', padding: '40px', borderRadius: '24px', boxShadow: '0 10px 40px rgba(0,0,0,0.1)', maxWidth: '400px', width:'100%' }}>
        
        <div style={{ background: '#e0f2fe', width: '80px', height: '80px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <Clock size={40} color="#0284c7" />
        </div>

        <h1 style={{ color: '#0369a1', margin: '0 0 10px 0', fontSize: '24px' }}>Cadastro em Análise</h1>
        
        <p style={{ color: '#64748b', lineHeight: '1.6', marginBottom: '30px' }}>
          Sua conta foi criada com sucesso! <br/>
          Por questões de segurança, nosso administrador precisa liberar seu acesso.
        </p>

        <div style={{background:'#f8fafc', padding:'15px', borderRadius:'12px', border:'1px solid #e2e8f0', marginBottom:'25px', fontSize:'14px', color:'#475569'}}>
            Isso geralmente leva menos de 1 hora.
        </div>

        <button 
          onClick={abrirSuporte}
          style={{ width: '100%', padding: '16px', background: '#0284c7', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', boxShadow:'0 4px 12px rgba(2, 132, 199, 0.3)' }}
        >
          <MessageCircle size={20} /> Avisar Admin no WhatsApp
        </button>
        
        <button 
          onClick={() => window.location.reload()}
          style={{ background: 'none', border: 'none', marginTop: '20px', color: '#0369a1', textDecoration: 'underline', cursor: 'pointer', fontSize: '14px' }}
        >
          Já fui aprovada? Atualizar
        </button>

        <div style={{ marginTop: '28px', paddingTop: '20px', borderTop: '1px solid #e2e8f0', textAlign: 'left' }}>
          <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 8px' }}>Dona do sistema? Use o código de liberação:</p>
          <UnlockAdminForm onUnlocked={() => refreshProfile?.()} />
        </div>
      </div>

    </div>
  )
}