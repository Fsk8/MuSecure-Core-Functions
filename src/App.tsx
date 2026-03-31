import { FingerprintUploader } from "@/components/FingerprintUploader";
import { Dashboard } from "@/pages/Dashboard";
import { useState } from "react";

export default function App() {
  const [tab, setTab] = useState<"upload" | "dashboard">("upload");
  return (
    <main className="app">
      <header className="app-header">
        <h1>MuSecure</h1>
        <p className="tagline">Prototipo: huella acústica en cliente antes de IPFS / cadena</p>
      </header>

      <nav className="tabs">
        <button
          type="button"
          className={tab === "upload" ? "tab active" : "tab"}
          onClick={() => setTab("upload")}
        >
          Subir
        </button>
        <button
          type="button"
          className={tab === "dashboard" ? "tab active" : "tab"}
          onClick={() => setTab("dashboard")}
        >
          Dashboard
        </button>
      </nav>

      {tab === "upload" ? <FingerprintUploader /> : <Dashboard />}
    </main>
  );
}
