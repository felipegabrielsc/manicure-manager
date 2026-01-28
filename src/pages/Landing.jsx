// src/pages/Landing.jsx
import { Link } from 'react-router-dom'
import { Calendar, Smartphone, Star, ArrowRight, TrendingUp, LogIn } from 'lucide-react'

const EntrarContato = () => { 
  window.open(`https://wa.me/5516996097901?text=${encodeURIComponent("Oi, gostaria de fazer parte do Agenda Manicure!")}`, '_blank') 
}

export default function Landing() {
  return (
    <div style={{ fontFamily: '"Inter", sans-serif', color: '#1f2937', overflowX: 'hidden', width: '100%' }}>
      
      {/* --- ESTILOS GLOBAIS E RESPONSIVOS --- */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap');
        
        /* Animações e Botões */
        .btn-gradient {
          background: linear-gradient(135deg, #2563eb 0%, #7c3aed 100%);
          transition: all 0.3s ease;
        }
        .btn-gradient:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 25px -5px rgba(37, 99, 235, 0.4);
        }
        .feature-card {
          transition: all 0.3s ease;
        }
        .feature-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
        }
        .floating {
          animation: float 6s ease-in-out infinite;
        }
        @keyframes float {
          0% { transform: translateY(0px); }
          50% { transform: translateY(-20px); }
          100% { transform: translateY(0px); }
        }

        /* --- RESPONSIVIDADE (MOBILE) --- */
        
        /* Título Gigante */
        .hero-title {
            font-size: 60px;
            line-height: 1.1;
        }
        
        /* Mockup do Celular */
        .mockup-container {
            width: 280px;
        }

        /* AJUSTES PARA CELULAR (Telas menores que 768px) */
        @media (max-width: 768px) {
            .hero-title {
                font-size: 36px !important; /* Diminui a fonte drasticamente no celular */
            }
            .hero-desc {
                font-size: 16px !important;
                padding: 0 10px;
            }
            .mockup-container {
                width: 100% !important; /* Ocupa a largura disponível, não fixa */
                max-width: 280px;
            }
            .nav-logo-text {
                font-size: 18px !important;
            }
            .nav-btn-text {
                font-size: 12px !important;
                padding: 8px 15px !important;
            }
            .section-padding {
                padding: 50px 20px !important;
            }
        }
      `}</style>

      {/* --- NAVBAR --- */}
      <nav style={{ 
        padding: '15px 20px', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        maxWidth: '1200px', 
        margin: '0 auto',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'rgba(255, 255, 255, 0.9)',
        backdropFilter: 'blur(10px)',
        borderBottom: '1px solid rgba(0,0,0,0.05)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '32px', height: '32px', background: 'linear-gradient(135deg, #2563eb, #db2777)', borderRadius: '8px' }}></div>
          <h2 className="nav-logo-text" style={{ margin: 0, fontSize: '20px', letterSpacing: '-0.5px' }}>Agenda<span style={{color: '#2563eb'}}>Manicure</span></h2>
        </div>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          <Link to="/login" className="btn-gradient nav-btn-text" style={{ textDecoration: 'none', color: 'white', padding: '8px 20px', borderRadius: '20px', fontWeight: 'bold', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <LogIn size={16}/> Entrar
          </Link>
        </div>
      </nav>

      {/* --- HERO SECTION --- */}
      <div className="section-padding" style={{ 
        textAlign: 'center', 
        padding: '80px 20px 100px 20px', 
        background: 'radial-gradient(circle at 50% 50%, #eff6ff 0%, #fff 100%)',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Bolhas de fundo */}
        <div style={{ position: 'absolute', top: '10%', left: '5%', width: '300px', height: '300px', background: '#dbeafe', borderRadius: '50%', filter: 'blur(80px)', opacity: 0.5, zIndex: 0 }}></div>
        <div style={{ position: 'absolute', bottom: '10%', right: '5%', width: '250px', height: '250px', background: '#fce7f3', borderRadius: '50%', filter: 'blur(80px)', opacity: 0.5, zIndex: 0 }}></div>

        <div style={{ position: 'relative', zIndex: 1, maxWidth: '800px', margin: '0 auto' }}>
          <span style={{ display: 'inline-block', padding: '5px 15px', background: '#eff6ff', color: '#2563eb', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold', marginBottom: '20px', border: '1px solid #bfdbfe' }}>
            ✨ O sistema nº 1 para Manicures Independentes
          </span>
          
          <h1 className="hero-title" style={{ fontWeight: '800', margin: '0 auto 25px auto', letterSpacing: '-1px', color: '#111827' }}>
            Pare de perder dinheiro <br/>
            <span style={{ background: 'linear-gradient(90deg, #2563eb, #db2777)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              organize sua agenda.
            </span>
          </h1>
          
          <p className="hero-desc" style={{ fontSize: '18px', color: '#4b5563', maxWidth: '500px', margin: '0 auto 40px auto', lineHeight: '1.6' }}>
            Adeus caderninho! Tenha controle total dos agendamentos, financeiro e clientes na palma da sua mão. Simples, rápido e lindo.
          </p>
          
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px' }}>
            <Link onClick={EntrarContato} className="btn-gradient" style={{ 
              display: 'inline-flex', alignItems: 'center', gap: '10px',
              color: 'white', padding: '15px 40px', borderRadius: '50px', 
              textDecoration: 'none', fontSize: '18px', fontWeight: 'bold',
              maxWidth: '90%', justifyContent: 'center'
            }}>
              Entre em Contato <ArrowRight size={20}/>
            </Link>
            <span style={{ fontSize: '12px', color: '#9ca3af' }}>Teste grátis. Cancele quando quiser.</span>
          </div>

          {/* MOCKUP DO APP FLUTUANDO */}
          <div className="floating" style={{ marginTop: '60px', position: 'relative', display: 'inline-block', maxWidth: '100%' }}>
             <div className="mockup-container" style={{ 
                background: 'white', borderRadius: '24px', padding: '15px', 
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', 
                border: '8px solid #111827', margin: '0 auto', boxSizing: 'border-box'
             }}>
                {/* Header Fake */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                   <div style={{width:'30px', height:'30px', background:'#f3f4f6', borderRadius:'8px'}}></div>
                   <div style={{width:'80px', height:'10px', background:'#e5e7eb', borderRadius:'5px'}}></div>
                   <div style={{width:'30px', height:'30px', background:'#dcfce7', borderRadius:'8px', display:'flex', alignItems:'center', justifyContent:'center', color:'#16a34a'}}>$</div>
                </div>
                {/* Cards Fake */}
                <div style={{ background:'#eff6ff', borderRadius:'12px', padding:'15px', marginBottom:'10px', textAlign:'left' }}>
                   <div style={{width:'70%', height:'12px', background:'#93c5fd', borderRadius:'6px', marginBottom:'8px'}}></div>
                   <div style={{width:'40%', height:'10px', background:'#bfdbfe', borderRadius:'6px'}}></div>
                </div>
                <div style={{ background:'#fff', border:'1px solid #eee', borderRadius:'12px', padding:'15px', marginBottom:'10px', textAlign:'left' }}>
                   <div style={{width:'60%', height:'12px', background:'#e5e7eb', borderRadius:'6px', marginBottom:'8px'}}></div>
                   <div style={{width:'30%', height:'10px', background:'#f3f4f6', borderRadius:'6px'}}></div>
                </div>
                {/* Botão FAB Fake */}
                <div style={{ width:'45px', height:'45px', background:'#2563eb', borderRadius:'50%', position:'absolute', bottom:'30px', right:'-15px', boxShadow:'0 10px 15px -3px rgba(37, 99, 235, 0.3)', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize:'24px' }}>+</div>
             </div>
          </div>
        </div>
      </div>

      {/* --- BENEFÍCIOS --- */}
      <div className="section-padding" style={{ background: 'white', padding: '80px 20px' }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '50px' }}>
            <h2 style={{ fontSize: '28px', fontWeight: '800', marginBottom: '10px' }}>Tudo o que você precisa</h2>
            <p style={{ color: '#666', fontSize: '16px' }}>Profissionalize seu atendimento hoje mesmo.</p>
          </div>

          {/* Grid Responsivo: minmax reduzido para caber em telas pequenas */}
          <div style={{ display: 'grid', gap: '20px', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
            <Feature 
              icon={<Calendar size={28} color="white" />}
              bg="#2563eb"
              title="Agenda Inteligente"
              desc="Visualize seus horários, encaixe clientes e evite furos na agenda. Tudo organizado por dia."
            />
            <Feature 
              icon={<TrendingUp size={28} color="white" />}
              bg="#16a34a"
              title="Financeiro Automático"
              desc="Saiba exatamente quanto entrou no dia. Gráficos de lucro e controle de despesas simples."
            />
            <Feature 
              icon={<Smartphone size={28} color="white" />}
              bg="#9333ea"
              title="Site de Agendamento"
              desc="Envie seu link exclusivo para clientes. Elas veem seus horários livres e marcam sozinhas."
            />
          </div>
        </div>
      </div>

      {/* --- DEPOIMENTO --- */}
      <div className="section-padding" style={{ background: '#f8fafc', padding: '80px 20px', textAlign: 'center' }}>
        <div style={{ maxWidth: '700px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '5px', marginBottom: '20px' }}>
            {[1,2,3,4,5].map(i => <Star key={i} size={20} fill="#fbbf24" color="#fbbf24" />)}
          </div>
          <h3 style={{ fontSize: '20px', lineHeight: '1.5', fontWeight: '600', marginBottom: '30px', color: '#111827', fontStyle: 'italic' }}>
            "Eu perdia muito tempo respondendo WhatsApp. Agora minhas clientes agendam pelo link e eu só recebo o dinheiro. Mudou minha vida!"
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '15px' }}>
            <div style={{ width: '50px', height: '50px', background: '#ddd', borderRadius: '50%', backgroundImage: 'url(https://i.pravatar.cc/150?img=5)', backgroundSize: 'cover' }}></div>
            <div style={{ textAlign: 'left' }}>
              <strong style={{ display: 'block', color: '#111827' }}>Ana Clara</strong>
              <span style={{ fontSize: '13px', color: '#666' }}>Manicure & Pedicure</span>
            </div>
          </div>
        </div>
      </div>

      {/* --- CTA FINAL --- */}
      <div className="section-padding" style={{ padding: '80px 20px', textAlign: 'center', background: '#111827', color: 'white' }}>
        <h2 style={{ fontSize: '28px', marginBottom: '15px', fontWeight: '800' }}>Pronta para lucrar mais?</h2>
        <p style={{ fontSize: '16px', color: '#9ca3af', marginBottom: '30px' }}>Junte-se a centenas de manicures que modernizaram seus negócios.</p>
        <Link onClick={EntrarContato} className="btn-gradient" style={{ 
          display: 'inline-block',
          color: 'white', padding: '15px 40px', borderRadius: '50px', 
          textDecoration: 'none', fontSize: '18px', fontWeight: 'bold' 
        }}>
          Entre em Contato
        </Link>
      </div>

      {/* --- FOOTER --- */}
      <div style={{ textAlign: 'center', padding: '30px 20px', background: '#000', color: '#4b5563', fontSize: '12px', borderTop: '1px solid #1f2937' }}>
        <p>© 2026 Agenda Manicure SaaS. Feito com 💜 por Felipe Gabriel Sgobi.</p>
      </div>
    </div>
  )
}

function Feature({ icon, bg, title, desc }) {
  return (
    <div className="feature-card" style={{ padding: '25px', borderRadius: '20px', border: '1px solid #f3f4f6', background: 'white' }}>
      <div style={{ 
        width: '50px', height: '50px', background: bg, borderRadius: '14px', 
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '15px',
        boxShadow: `0 10px 15px -3px ${bg}40`
      }}>
        {icon}
      </div>
      <h3 style={{ margin: '0 0 10px 0', fontSize: '18px', fontWeight: 'bold' }}>{title}</h3>
      <p style={{ margin: 0, color: '#666', lineHeight: '1.5', fontSize: '14px' }}>{desc}</p>
    </div>
  )
}