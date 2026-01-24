import { BrowserRouter, Routes, Route } from 'react-router-dom'
import NovoAgendamento from './pages/NovoAgendamento'
import Agenda from './pages/Agenda' // Importe a nova página
import Clientes from './pages/Clientes' // Importe a nova página
import Servicos from './pages/Servicos' // Importe novo
import Financeiro from './pages/Financeiro'

function App() {
  return (
    <BrowserRouter>
      <div style={{ minHeight: '100vh', background: '#eef2f6', fontFamily: 'sans-serif' }}>
        <Routes>
          <Route path="/" element={<Agenda />} />
          <Route path="/novo" element={<NovoAgendamento />} />
          <Route path="/clientes" element={<Clientes />} />
          <Route path="/servicos" element={<Servicos />} /> 
          <Route path="/financeiro" element={<Financeiro />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
export default App