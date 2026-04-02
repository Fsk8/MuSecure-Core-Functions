import React, { useEffect, useState } from 'react';
import { LighthouseService } from '../services/LighthouseService';

export const Explorer: React.FC = () => {
  const [songs, setSongs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const lighthouseService = LighthouseService.getInstance();

  useEffect(() => {
    const fetchPublicContent = async () => {
      try {
        setLoading(true);
        // Trae todo lo que has subido con tu API Key
        const allFiles = await lighthouseService.listUploads();
        
        // Filtramos para mostrar solo lo que NO está encriptado 
        // (ya que no implementamos el decrypt para el demo)
        const publicFiles = allFiles.filter(file => !file.encryption);
        setSongs(publicFiles);
      } catch (error) {
        console.error("Error cargando el Explorer:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchPublicContent();
  }, []);

  if (loading) return <div className="p-10 text-center">Cargando la música de la comunidad...</div>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6">
      {songs.length === 0 ? (
        <p className="col-span-3 text-center opacity-50">No hay canciones públicas aún.</p>
      ) : (
        songs.map((song) => (
          <div key={song.cid} className="bg-zinc-900 p-4 rounded-xl border border-zinc-800 shadow-lg">
            <h3 className="font-bold text-white truncate">{song.fileName}</h3>
            <p className="text-xs text-zinc-400 mb-4">CID: {song.cid.slice(0, 10)}...</p>
            
            <audio 
              controls 
              className="w-full h-8"
              src={LighthouseService.gatewayUrl(song.cid)}
            />
            
            <div className="mt-3 flex justify-between items-center text-[10px] uppercase tracking-widest text-zinc-500">
              <span>Public Audio</span>
              <span>{new Date(song.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        ))
      )}
    </div>
  );
};