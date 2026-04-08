import React, { useState, useEffect, useRef } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { ethers } from 'ethers';
import { AudioFingerprintService } from '../services/AudioFingerprintService';
import { runCatalogAuthenticityCheck } from '../services/runCatalogCheck';
import { LighthouseService } from '../services/LighthouseService';
import { RegisterWorkButton } from './RegisterWorkButton';
import type { CatalogAuthenticityReport } from '../types/acoustid';

export const FingerprintUploader: React.FC = () => {
  const { user, logout, authenticated, login, ready, signMessage } = usePrivy();
  const { wallets } = useWallets();
  const audioRef = useRef<HTMLAudioElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [isEncrypted, setIsEncrypted] = useState(true);
  const [isSoulbound, setIsSoulbound] = useState(true);
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  const [fpResult, setFpResult] = useState<any>(null);
  const [catalogReport, setCatalogReport] = useState<CatalogAuthenticityReport | null>(null);
  const [ipfsCid, setIpfsCid] = useState<string>("");

  useEffect(() => {
    if (!file) { setPreviewUrl(""); return; }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setFpResult(null);
      setCatalogReport(null);
      setCurrentStep(0);
      setStatus("Track seleccionado.");
    }
  };

  const handleAnalyze = async () => {
    if (!file) return;
    try {
      setLoading(true);
      setStatus("Generando huella digital...");
      const fp = await AudioFingerprintService.getInstance().generateFingerprint(file);
      setFpResult(fp);
      setStatus("Escaneando bases de datos globales...");
      const check = await runCatalogAuthenticityCheck(
        file, import.meta.env.VITE_ACOUSTID_CLIENT_KEY || "", () => {}
      );
      setCatalogReport(check.report);
      setCurrentStep(1);
      setStatus("Análisis finalizado.");
    } catch (e: any) {
      setStatus(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleIPFS = async () => {
    try {
      setLoading(true);
      setStatus("Subiendo a IPFS...");
      const address = user?.wallet?.address;
      if (!address) throw new Error("No hay wallet conectada");

      const result = await LighthouseService.getInstance().uploadAudio(
        file!, address, isEncrypted,
        isEncrypted ? async (msg: string) => await signMessage(msg) : undefined
      );
      setIpfsCid(result.cid);
      setCurrentStep(2);
      setStatus("IPFS OK ✓");
    } catch (e: any) {
      setStatus(`Error IPFS: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!ready) return <div style={{ padding: '80px', textAlign: 'center', color: '#10b981', textTransform: 'uppercase', fontSize: '10px', fontWeight: '900' }}>Sincronizando MuSecure...</div>;

  const originalityScore = catalogReport ? 100 - catalogReport.catalogMatchScore : null;
  const catalogScore = catalogReport?.catalogMatchScore ?? 0;
  const isHighRisk = catalogScore >= 80;

  // Estilo base para los botones de acción (como el de "Conectar" en Explorer)
  const mainButtonStyle = {
    width: '100%',
    padding: '20px',
    borderRadius: '20px',
    fontSize: '10px',
    fontWeight: '900',
    textTransform: 'uppercase' as const,
    border: 'none',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    boxShadow: '0 10px 15px -3px rgba(16, 185, 129, 0.1)',
  };

  // Estilo para los toggles (Soulbound/Cifrado)
  const toggleStyle = (active: boolean) => ({
    flex: 1,
    padding: '12px',
    borderRadius: '16px',
    fontSize: '10px',
    fontWeight: '900' as const,
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
    transition: 'all 0.2s',
    backgroundColor: active ? '#10b981' : '#111111',
    color: active ? '#000000' : '#10b981',
    border: active ? '1px solid #10b981' : '1px solid #10b98133',
  });

  return (
    <div style={{ maxWidth: '42rem', margin: '0 auto', padding: '40px', backgroundColor: '#111111', border: '1px solid #10b98133', borderRadius: '40px', color: '#ffffff' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '900', fontStyle: 'italic', color: '#10b981', textTransform: 'uppercase', letterSpacing: '-0.05em', margin: 0 }}>MuSecure</h2>
        {authenticated && (
          <button onClick={logout} style={{ fontSize: '9px', fontWeight: 'bold', padding: '6px 16px', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '9999px', textTransform: 'uppercase', cursor: 'pointer' }}>
            Logout
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        
        {previewUrl && (
          <audio ref={audioRef} controls style={{ width: '100%', height: '32px', filter: 'invert(1) brightness(2)', marginBottom: '8px' }} src={previewUrl} />
        )}

        {/* REPORTE DE ORIGINALIDAD (Look similar a las cards de Explorer) */}
        {catalogReport && (
          <div style={{ padding: '24px', border: '1px solid #10b98133', borderRadius: '30px', backgroundColor: isHighRisk ? 'rgba(239, 68, 68, 0.05)' : 'rgba(16, 185, 129, 0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <span style={{ fontSize: '10px', fontWeight: '900', textTransform: 'uppercase', color: '#10b981', letterSpacing: '0.1em' }}>Originalidad</span>
              <span style={{ fontSize: '1.8rem', fontWeight: '900', color: isHighRisk ? '#ef4444' : '#ffffff' }}>{originalityScore}%</span>
            </div>
            <div style={{ width: '100%', height: '4px', backgroundColor: '#27272a', borderRadius: '9999px', overflow: 'hidden' }}>
              <div style={{ height: '100%', backgroundColor: '#10b981', width: `${originalityScore}%`, transition: 'width 1s ease-out' }} />
            </div>
            {isHighRisk && (
               <p style={{ color: '#ef4444', fontSize: '9px', fontWeight: 'bold', marginTop: '12px', textTransform: 'uppercase' }}>🚫 Registro bloqueado — Coincidencia alta con catálogo</p>
            )}
          </div>
        )}

        {/* TOGGLES */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => setIsSoulbound(!isSoulbound)} style={toggleStyle(isSoulbound)}>
            Soulbound: {isSoulbound ? 'ON' : 'OFF'}
          </button>
          <button onClick={() => setIsEncrypted(!isEncrypted)} style={toggleStyle(isEncrypted)}>
            Cifrado: {isEncrypted ? 'ON' : 'OFF'}
          </button>
        </div>

        {/* PASOS DE ACCIÓN */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          
          <div style={{ opacity: currentStep === 0 ? 1 : 0.4 }}>
            <input 
              type="file" 
              accept="audio/*" 
              onChange={handleFileChange} 
              style={{ display: 'block', width: '100%', fontSize: '10px', fontWeight: 'bold', color: '#10b981', marginBottom: '12px', cursor: 'pointer' }} 
            />
            <button 
              onClick={handleAnalyze} 
              disabled={loading || !file || currentStep !== 0} 
              style={{ ...mainButtonStyle, backgroundColor: '#ffffff', color: '#000000', opacity: (loading || !file || currentStep !== 0) ? 0.5 : 1 }}
            >
              {loading && currentStep === 0 ? "Generando Huella..." : "1. Analizar Originalidad"}
            </button>
          </div>

          <button 
            onClick={handleIPFS} 
            disabled={loading || currentStep !== 1 || isHighRisk} 
            style={{ 
              ...mainButtonStyle, 
              backgroundColor: (currentStep === 1 && !isHighRisk) ? '#059669' : '#1a1a1a', 
              color: (currentStep === 1 && !isHighRisk) ? '#000000' : '#10b98133',
              border: (currentStep === 1 && !isHighRisk) ? 'none' : '1px solid #10b98122'
            }}
          >
            {loading && currentStep === 1 ? "Subiendo a IPFS..." : "2. Cifrar y Subir"}
          </button>

          {/* PASO 3: Delegado al RegisterWorkButton que ya tiene tu lógica de backend */}
          {currentStep === 2 && (
            <RegisterWorkButton 
              fingerprintHash={fpResult.sha256}
              ipfsCid={ipfsCid}
              authenticityScore={catalogScore}
              soulbound={isSoulbound}
              onSuccess={() => setCurrentStep(3)}
            />
          )}
        </div>
      </div>

      {status && (
        <div style={{ marginTop: '32px', textAlign: 'center', fontSize: '9px', fontWeight: '900', color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.2em', fontFamily: 'monospace' }}>
          {status}
        </div>
      )}
    </div>
  );
};