import { FingerprintUploader } from "@/components/FingerprintUploader";
import { Dashboard } from "@/pages/Dashboard";
import { Explorer } from "@/components/Explorer"; 
import { usePrivy } from "@privy-io/react-auth";
import { useGasAirdrop } from "@/hooks/useGasAirdrop"; 
import { useState } from "react";

type Tab = "upload" | "dashboard" | "explorer";

export default function App() {
  const [tab, setTab] = useState<Tab>("explorer");
  const { ready, authenticated, user, login } = usePrivy();
  const address = user?.wallet?.address;
  const { airdropMessage } = useGasAirdrop(address || null, (user as any)?.isNewUser);

  const buttonStyle = {
    padding: '10px 20px',
    borderRadius: '12px',
    fontSize: '14px',
    fontWeight: 'bold' as const,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    border: '1px solid #10b98133', 
  };

  const activeStyle = {
    ...buttonStyle,
    backgroundColor: '#10b981', 
    color: '#000000',
    border: '1px solid #10b981',
    boxShadow: '0 0 15px rgba(16, 185, 129, 0.4)',
  };

  const inactiveStyle = {
    ...buttonStyle,
    backgroundColor: 'transparent',
    color: '#10b981',
    border: '1px solid #10b98122',
  };

  if (!ready) return null;

  return (
    <main className="app" style={{ backgroundColor: '#000000', minHeight: '100vh', color: '#ffffff' }}>
      <header className="app-header" style={{ padding: '20px', borderBottom: '1px solid #10b98122' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
          <div>
            <h1 style={{ color: '#10b981', fontWeight: '900', fontStyle: 'italic', textTransform: 'uppercase', fontSize: '2rem', margin: 0 }}>MuSecure</h1>
            <p style={{ color: '#ffffff', opacity: 1, fontWeight: 'bold', margin: 0, fontSize: '0.8rem' }}>PROTECCIÓN DE IP MUSICAL</p>
          </div>
          
          {authenticated && (
            <div style={{ textAlign: 'right' }}>
              <p style={{ color: '#10b981', fontFamily: 'monospace', fontSize: '12px', fontWeight: 'bold', margin: 0 }}>{address?.slice(0,6)}...{address?.slice(-4)}</p>
              <p style={{ color: '#ffffff', fontWeight: '900', fontSize: '10px', textTransform: 'uppercase', margin: 0 }}>CONECTADO</p>
            </div>
          )}
        </div>
      </header>

      {airdropMessage && (
        <div style={{ background: '#10b98115', border: '1px solid #10b98133', color: '#10b981', padding: '10px', borderRadius: '12px', textAlign: 'center', margin: '20px auto', maxWidth: '1200px', fontWeight: 'bold' }}>
          {airdropMessage}
        </div>
      )}

      <nav style={{ display: 'flex', gap: '10px', justifyContent: 'center', margin: '30px 0' }}>
        <button type="button" style={tab === "explorer" ? activeStyle : inactiveStyle} onClick={() => setTab("explorer")}>Explorar</button>
        <button type="button" style={tab === "upload" ? activeStyle : inactiveStyle} onClick={() => setTab("upload")}>Subir Obra</button>
        <button type="button" style={tab === "dashboard" ? activeStyle : inactiveStyle} onClick={() => setTab("dashboard")}>Mis obras en Blockchain</button>
      </nav>

      <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 20px' }}>
        {tab === "explorer" && <Explorer />}
        {tab === "upload" && (
          authenticated ? <FingerprintUploader /> : (
            <div style={{ textAlign: 'center', padding: '80px', border: '2px dashed #10b98133', borderRadius: '40px', backgroundColor: '#09090b' }}>
              <p style={{ color: '#10b981', textTransform: 'uppercase', fontWeight: '900', fontSize: '0.75rem', marginBottom: '16px' }}>Debes conectar tu identidad para subir obras</p>
              <button onClick={login} style={activeStyle}>Conectar Ahora</button>
            </div>
          )
        )}
        {tab === "dashboard" && (
          authenticated ? <Dashboard /> : (
            <div style={{ textAlign: 'center', padding: '80px', border: '2px dashed #10b98133', borderRadius: '40px', backgroundColor: '#09090b' }}>
              <p style={{ color: '#10b981', textTransform: 'uppercase', fontWeight: '900', fontSize: '0.75rem', marginBottom: '16px' }}>Conecta tu wallet para ver tu catálogo personal</p>
              <button onClick={login} style={activeStyle}>Ver mi Dashboard</button>
            </div>
          )
        )}
      </section>
    </main>
  );
}