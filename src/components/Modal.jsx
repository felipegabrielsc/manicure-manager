// src/components/Modal.jsx
import React from 'react'
import { X, CheckCircle, AlertTriangle, Info } from 'lucide-react'

export default function Modal({ isOpen, onClose, type = 'info', title, message, onConfirm }) {
  if (!isOpen) return null

  // Configuração visual baseada no tipo
  const configs = {
    success: { icon: <CheckCircle size={48} color="#16a34a" />, color: '#16a34a', bg: '#dcfce7' },
    error:   { icon: <AlertTriangle size={48} color="#dc2626" />, color: '#dc2626', bg: '#fee2e2' },
    confirm: { icon: <AlertTriangle size={48} color="#d97706" />, color: '#d97706', bg: '#fef3c7' },
    info:    { icon: <Info size={48} color="#2563eb" />,          color: '#2563eb', bg: '#eff6ff' }
  }

  const current = configs[type] || configs.info

  return (
    <div style={overlayStyle}>
      <div style={modalBoxStyle}>
        
        {/* Ícone Gigante no Topo */}
        <div style={{ marginBottom: '15px', display: 'flex', justifyContent: 'center' }}>
          <div style={{ ...iconCircleStyle, background: current.bg }}>
            {current.icon}
          </div>
        </div>

        {/* Título e Mensagem */}
        <h3 style={{ margin: '0 0 10px 0', color: '#000', fontSize: '22px', textAlign: 'center' }}>{title}</h3>
        <p style={{ margin: '0 0 25px 0', color: '#555', fontSize: '16px', textAlign: 'center', lineHeight: '1.5' }}>
          {message}
        </p>

        {/* Botões de Ação */}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          {type === 'confirm' ? (
            <>
              <button onClick={onClose} style={btnSecondary}>Cancelar</button>
              <button onClick={() => { onConfirm(); onClose(); }} style={{ ...btnPrimary, background: '#dc2626' }}>
                Confirmar Exclusão
              </button>
            </>
          ) : (
            <button onClick={onClose} style={{ ...btnPrimary, background: current.color }}>
              OK, Entendi
            </button>
          )}
        </div>

      </div>
    </div>
  )
}

// Estilos do Modal
const overlayStyle = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.7)', // Fundo escuro para foco
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 1000,
  backdropFilter: 'blur(3px)' // Efeito de desfoque moderno
}

const modalBoxStyle = {
  background: 'white',
  padding: '30px',
  borderRadius: '16px',
  width: '90%',
  maxWidth: '400px',
  boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
  position: 'relative',
  animation: 'fadeIn 0.2s ease-out'
}

const iconCircleStyle = {
  width: '80px', height: '80px', borderRadius: '50%',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  marginBottom: '10px'
}

const btnPrimary = {
  flex: 1, padding: '12px 20px', border: 'none', borderRadius: '8px',
  color: 'white', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer'
}

const btnSecondary = {
  flex: 1, padding: '12px 20px', border: '1px solid #ccc', borderRadius: '8px',
  background: 'white', color: '#333', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer'
}