import { FingerprintUploader } from "@/components/FingerprintUploader";
import { Dashboard } from "@/pages/Dashboard";
import { Explorer } from "@/components/Explorer"; 
import { useState } from "react";

type Tab = "upload" | "dashboard" | "explorer";

export default function App() {
  const [tab, setTab] = useState<Tab>("explorer");

  // Estilos base para los botones
  const buttonStyle = {
    padding: '10px 20px',
    borderRadius: '12px',
    fontSize: '14px',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'all 0.2s border',
    border: '1px solid #27272a', // zinc-800
  };

  const activeStyle = {
    ...buttonStyle,
    backgroundColor: '#4f46e5', // indigo-600
    color: '#ffffff',
    border: '1px solid #6366f1',
  };

  const inactiveStyle = {
    ...buttonStyle,
    backgroundColor: '#09090b', // casi negro
    color: '#71717a', // zinc-500 (gris legible)
  };

  return (
    <main className="app">
      <header className="app-header">
        <h1>MuSecure</h1>
        <p className="tagline">Protege tu obra musical con acoustic fingerprints y blockchain</p>
      </header>

      {/* Navegación con contraste corregido */}
      <nav className="tabs" style={{ 
        display: 'flex', 
        gap: '10px', 
        marginBottom: '30px',
        justifyContent: 'center' // Esto los centra un poco respecto al header
      }}>
        <button
          type="button"
          style={tab === "explorer" ? activeStyle : inactiveStyle}
          onClick={() => setTab("explorer")}
        >
          Explorar Comunidad
        </button>
        <button
          type="button"
          style={tab === "upload" ? activeStyle : inactiveStyle}
          onClick={() => setTab("upload")}
        >
          Subir Obra
        </button>
        <button
          type="button"
          style={tab === "dashboard" ? activeStyle : inactiveStyle}
          onClick={() => setTab("dashboard")}
        >
          Mis Registros (Local)
        </button>
      </nav>

      <section className="content-area">
        {tab === "explorer" && <Explorer />}
        {tab === "upload" && <FingerprintUploader />}
        {tab === "dashboard" && <Dashboard />}
      </section>
    </main>
  );
}