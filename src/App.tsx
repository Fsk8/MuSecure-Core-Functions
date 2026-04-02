import { FingerprintUploader } from "@/components/FingerprintUploader";
import { Dashboard } from "@/pages/Dashboard";
import { Explorer } from "@/components/Explorer"; // Asegúrate de haber creado este archivo
import { useState } from "react";

// Definimos los tipos de pestañas disponibles
type Tab = "upload" | "dashboard" | "explorer";

export default function App() {
  const [tab, setTab] = useState<Tab>("explorer"); // Lo pongo en explorer por defecto para que la demo no se vea vacía al entrar

  return (
    <main className="app">
      <header className="app-header">
        <h1>MuSecure</h1>
        <p className="tagline">Protege tu obra musical con acoustic fingerprints y blockchain</p>
      </header>

      <nav className="tabs" style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <button
          type="button"
          className={tab === "explorer" ? "tab active" : "tab"}
          onClick={() => setTab("explorer")}
        >
          Explorar Comunidad
        </button>
        <button
          type="button"
          className={tab === "upload" ? "tab active" : "tab"}
          onClick={() => setTab("upload")}
        >
          Subir Obra
        </button>
        <button
          type="button"
          className={tab === "dashboard" ? "tab active" : "tab"}
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