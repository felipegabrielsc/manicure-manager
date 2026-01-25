// src/pages/Landing.jsx
import { Link } from 'react-router-dom'
import { CheckCircle, Calendar, DollarSign, Smartphone } from 'lucide-react'

export default function Landing() {
  return (
    <div style={{ fontFamily: 'sans-serif', color: '#1f2937', paddingBottom: '50px' }}>
      
      {/* Navbar Simples */}
      <nav style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: '1000px', margin: '0 auto' }}>
        <h2 style={{ margin: 0, color: '#2563eb' }}>Agenda<span style={{color:'#000'}}>Manicure</span></h2>
        <Link to="/login" style={{ textDecoration: 'none', color: '#2563eb', fontWeight: 'bold' }}>Entrar</Link>
      </nav>

      {/* Hero Section */}
      <div style={{ textAlign: 'center', padding: '60px 20px', background: 'linear-gradient(to bottom, #eff6ff, #fff)' }}>
        <h1 style={{ fontSize: '36px', maxWidth: '600px', margin: '0 auto 20px auto', lineHeight: '1.2' }}>
          Organize sua agenda e <span style={{color: '#2563eb'}}>lucre mais</span> sem dor de cabeça.
        </h1>
        <p style={{ fontSize: '18px', color: '#666', maxWidth: '500px', margin: '0 auto 30px auto' }}>
          O sistema feito para Manicures que querem parar de perder dinheiro com anotações em caderno.
        </p>
        <Link to="/login" style={{ background: '#2563eb', color: 'white', padding: '15px 40px', borderRadius: '30px', textDecoration: 'none', fontSize: '18px', fontWeight: 'bold', boxShadow: '0 4px 15px rgba(37, 99, 235, 0.3)' }}>
          Começar Grátis
        </Link>
        <p style={{ fontSize: '12px', color: '#999', marginTop: '10px' }}>Não precisa de cartão de crédito</p>
      </div>

      {/* Benefícios */}
      <div style={{ maxWidth: '800px', margin: '40px auto', padding: '0 20px', display: 'grid', gap: '30px', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}>
        <Feature 
          icon={<Calendar size={32} color="#2563eb" />}
          title="Agenda Inteligente"
          desc="Confirmação via WhatsApp automática e controle total de quem vem e quem faltou."
        />
        <Feature 
          icon={<DollarSign size={32} color="#16a34a" />}
          title="Financeiro Real"
          desc="Saiba exatamente quanto você lucrou. Controle mensalistas e serviços avulsos."
        />
        <Feature 
          icon={<Smartphone size={32} color="#9333ea" />}
          title="Funciona no Celular"
          desc="Não precisa baixar nada. Instale como um aplicativo direto no seu iPhone ou Android."
        />
      </div>

      {/* Depoimento (Prova Social) */}
      <div style={{ background: '#f9fafb', padding: '40px 20px', textAlign: 'center', marginTop: '40px' }}>
        <p style={{ fontStyle: 'italic', fontSize: '18px', maxWidth: '500px', margin: '0 auto 10px auto' }}>
          "Eu perdia a conta de quantas unhas as mensalistas já tinham feito. Agora o sistema conta pra mim. Mudou minha vida!"
        </p>
        <strong style={{ display: 'block' }}>— Ana, Manicure há 10 anos</strong>
      </div>

      {/* Footer */}
      <div style={{ textAlign: 'center', padding: '40px 20px', color: '#999', fontSize: '14px' }}>
        <p>© 2024 Agenda Manicure SaaS. Desenvolvido por Felipe Gabriel Sgobi.</p>
      </div>
    </div>
  )
}

function Feature({ icon, title, desc }) {
  return (
    <div style={{ padding: '20px', borderRadius: '12px', border: '1px solid #eee', background: 'white', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' }}>
      <div style={{ marginBottom: '15px' }}>{icon}</div>
      <h3 style={{ margin: '0 0 10px 0' }}>{title}</h3>
      <p style={{ margin: 0, color: '#666', lineHeight: '1.5' }}>{desc}</p>
    </div>
  )
}