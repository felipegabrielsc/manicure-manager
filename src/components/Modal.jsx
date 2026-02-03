// src/components/Modal.jsx
import React from 'react'

export default function Modal({ isOpen, onClose, type, title, message, onConfirm }) {
  if (!isOpen) return null

  // Estilos inline simples para garantir funcionamento sem CSS externo
  const overlay = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }
  const box = { background: 'white', padding: '25px', borderRadius: '12px', maxWidth: '400px', width: '90%', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', textAlign: 'center' }
  const btnGroup = { display: 'flex', gap: '10px', marginTop: '20px', justifyContent: 'center' }
  const btnBase = { padding: '10px 20px', borderRadius: '6px', border: 'none', fontWeight: 'bold', cursor: 'pointer', flex: 1 }
  
  return (
    <div style={overlay} onClick={(e) => { if(e.target === e.currentTarget) onClose() }}>
      <div style={box}>
        <h3 style={{marginTop: 0, color: type === 'confirm' ? '#dc2626' : '#2563eb'}}>{title}</h3>
        <p style={{color: '#4b5563', lineHeight: '1.5'}}>{message}</p>
        
        <div style={btnGroup}>
            {/* Se for 'confirm', mostra os dois botões. Se for 'info', só mostra o de fechar/entendi */}
            {type === 'confirm' ? (
                <>
                    <button onClick={onClose} style={{...btnBase, background: '#f3f4f6', color: '#374151'}}>Cancelar</button>
                    <button onClick={onConfirm} style={{...btnBase, background: '#dc2626', color: 'white'}}>Confirmar</button>
                </>
            ) : (
                <button onClick={onClose} style={{...btnBase, background: '#2563eb', color: 'white'}}>Entendi</button>
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