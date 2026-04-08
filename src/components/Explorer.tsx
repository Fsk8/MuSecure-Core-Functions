import React, { useEffect, useState } from 'react';
import { LighthouseService } from '../services/LighthouseService';
import { EncryptedAudioPlayer } from './Encryptedaudioplayer';
import { usePrivy } from '@privy-io/react-auth';

export const Explorer: React.FC = () => {
  const [songs, setSongs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { ready, authenticated, user, login, signMessage } = usePrivy();
  const address = user?.wallet?.address;

  useEffect(() => {
    const fetchContent = async () => {
      try {
        setLoading(true);
        const lighthouseService = LighthouseService.getInstance();
        const allFiles = await lighthouseService.listUploads();
        const unique = new Map();
        (allFiles || []).forEach((file: any) => {
          if (!file.fileName.toLowerCase().endsWith('.json')) {
            unique.set(file.cid, file);
          }
        });
        setSongs(Array.from(unique.values()));
      } catch (error) { 
        console.error("Error Explorer:", error); 
      } finally { 
        setLoading(false); 
      }
    };
    fetchContent();
  }, []);

  if (!ready || loading) return <div style={{ padding: '80px', textAlign: 'center', color: '#10b981', textTransform: 'uppercase', fontSize: '10px', fontWeight: '900', fontStyle: 'italic' }}>Sincronizando MuSecure...</div>;

  return (
    <div className="explorer-container">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '32px' }}>
        {songs.map((song) => {
          const isEncrypted = song.mimeType === "application/octet-stream" || !song.fileName.includes('.');
          return (
            <div key={song.cid} style={{ backgroundColor: '#111111', border: '1px solid #10b98133', padding: '32px', borderRadius: '32px', display: 'flex', flexDirection: 'column', height: '100%', transition: 'all 0.3s ease' }}>
              <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <span style={{ fontSize: '9px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '4px 12px', borderRadius: '9999px', backgroundColor: isEncrypted ? '#10b981' : '#27272a', color: isEncrypted ? '#000000' : '#10b981', border: isEncrypted ? 'none' : '1px solid #10b98133' }}>
                  {isEncrypted ? 'MuSecure Protected' : 'Public Domain'}
                </span>
              </div>

              {/* TÍTULO EN BLANCO PURO */}
              <h3 style={{ fontWeight: 'bold', color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '1rem', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '-0.025em' }}>
                {song.fileName || "Sin título"}
              </h3>
              
              {/* CID EN VERDE MENTA BRILLANTE */}
              <p style={{ fontSize: '10px', fontFamily: 'monospace', color: '#10b981', marginBottom: '32px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 1, fontWeight: 'bold' }}>
                CID: {song.cid}
              </p>

              <div style={{ marginTop: 'auto' }}>
                {isEncrypted ? (
                  authenticated && address ? (
                    <EncryptedAudioPlayer cid={song.cid} ownerAddress={address} signMessage={signMessage} />
                  ) : (
                    <button onClick={() => login()} style={{ width: '100%', backgroundColor: '#059669', color: '#000000', padding: '16px', borderRadius: '16px', fontSize: '10px', fontWeight: '900', textTransform: 'uppercase', border: 'none', cursor: 'pointer', boxShadow: '0 10px 15px -3px rgba(16, 185, 129, 0.2)' }}>
                      🔓 Conectar para Escuchar
                    </button>
                  )
                ) : (
                  <audio controls preload="metadata" style={{ width: '100%', height: '40px', filter: 'invert(1) brightness(2)' }} src={`https://gateway.lighthouse.storage/ipfs/${song.cid}`} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};