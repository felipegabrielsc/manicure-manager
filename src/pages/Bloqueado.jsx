// src/pages/Bloqueado.jsx
import { ShieldAlert, MessageCircle } from 'lucide-react'

export default function Bloqueado() {
  const abrirSuporte = () => {
    // Coloque SEU número aqui para ela chorar as pitangas
    window.open(`https://wa.me/5516996097901?text=${encodeURIComponent("Olá, meu acesso está suspenso. Poderia verificar?")}`, '_blank')
  }

  return (
    <div style={{ height: '100vh', background: '#fef2f2', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', textAlign: 'center', fontFamily: 'sans-serif' }}>
      
      <div style={{ background: '#fff', padding: '40px', borderRadius: '20px', boxShadow: '0 10px 25px rgba(220, 38, 38, 0.15)', maxWidth: '400px', border: '1px solid #fee2e2' }}>
        
        <div style={{ background: '#fee2e2', width: '80px', height: '80px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <ShieldAlert size={40} color="#dc2626" />
        </div>

        <h1 style={{ color: '#991b1b', margin: '0 0 10px 0', fontSize: '24px' }}>Acesso Suspenso</h1>
        
        <p style={{ color: '#7f1d1d', lineHeight: '1.6', marginBottom: '30px' }}>
          Identificamos uma pendência ou irregularidade na sua conta. Por segurança, o acesso ao sistema foi temporariamente bloqueado.
        </p>

        <button 
          onClick={abrirSuporte}
          style={{ width: '100%', padding: '15px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
        >
          <MessageCircle size={20} /> Falar com Suporte
        </button>
        
        <button 
          onClick={() => window.location.reload()}
          style={{ background: 'none', border: 'none', marginTop: '20px', color: '#991b1b', textDecoration: 'underline', cursor: 'pointer', fontSize: '14px' }}
        >
          Tentar novamente
        </button>
      </div>

    </div>
  )
}