// src/components/SelectBusca.jsx
import { useState, useEffect, useRef } from 'react'
import { Search, ChevronDown, X } from 'lucide-react'

export default function SelectBusca({ options, value, onChange, placeholder, label }) {
  const [isOpen, setIsOpen] = useState(false)
  const [busca, setBusca] = useState('')
  const containerRef = useRef(null)

  // Encontra o item selecionado para mostrar o nome (não o ID)
  const selecionado = options.find(o => o.id == value)

  // Fecha o dropdown se clicar fora
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Filtra as opções baseado no texto digitado
  const opcoesFiltradas = options.filter(opt => 
    opt.label.toLowerCase().includes(busca.toLowerCase())
  )

  return (
    <div ref={containerRef} style={{ position: 'relative', marginBottom: '15px' }}>
      {label && <label style={{display:'block', fontWeight:'bold', fontSize:'14px', marginBottom:'5px', color:'#000'}}>{label}</label>}
      
      {/* O CAMPO QUE ELA VÊ */}
      <div 
        onClick={() => setIsOpen(!isOpen)}
        style={{
          padding: '14px', borderRadius: '8px', border: '1px solid #999',
          background: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          cursor: 'pointer'
        }}
      >
        <span style={{ color: selecionado ? '#000' : '#666', fontSize: '16px' }}>
          {selecionado ? selecionado.label : placeholder}
        </span>
        <ChevronDown size={20} color="#666" />
      </div>

      {/* A LISTA FLUTUANTE (DROPDOWN) */}
      {isOpen && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
          background: 'white', border: '1px solid #ccc', borderRadius: '8px',
          marginTop: '5px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
          maxHeight: '250px', overflowY: 'auto'
        }}>
          {/* Campo de Busca Interno */}
          <div style={{ padding: '10px', position: 'sticky', top: 0, background: 'white', borderBottom: '1px solid #eee' }}>
            <div style={{ display: 'flex', alignItems: 'center', background: '#f0f0f0', borderRadius: '6px', padding: '0 10px' }}>
              <Search size={18} color="#666" />
              <input 
                autoFocus
                placeholder="Buscar..." 
                value={busca}
                onChange={e => setBusca(e.target.value)}
                style={{ border: 'none', background: 'transparent', padding: '10px', width: '100%', outline: 'none', fontSize: '14px' }}
              />
            </div>
          </div>

          {/* Lista de Opções */}
          {opcoesFiltradas.length === 0 ? (
            <div style={{ padding: '15px', textAlign: 'center', color: '#666' }}>Nada encontrado</div>
          ) : (
            opcoesFiltradas.map(opt => (
              <div 
                key={opt.id}
                onClick={() => {
                  onChange(opt.id) // Passa o ID pra cima
                  setIsOpen(false)
                  setBusca('') // Limpa busca
                }}
                style={{
                  padding: '12px 15px', borderBottom: '1px solid #f0f0f0', cursor: 'pointer',
                  background: value == opt.id ? '#eff6ff' : 'white',
                  color: value == opt.id ? '#2563eb' : '#000'
                }}
              >
                {opt.label} 
                {opt.subLabel && <small style={{display:'block', color:'#666', fontSize:'12px'}}>{opt.subLabel}</small>}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}