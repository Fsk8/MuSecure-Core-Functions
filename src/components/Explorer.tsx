import React, { useEffect, useState } from 'react';
import { LighthouseService } from '../services/LighthouseService';

export const Explorer: React.FC = () => {
  const [songs, setSongs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const lighthouseService = LighthouseService.getInstance();

  useEffect(() => {
    const fetchContent = async () => {
      try {
        setLoading(true);
        const allFiles = await lighthouseService.listUploads();
        
        // FILTRO: Solo archivos que NO terminen en .json
        const onlyAudio = (allFiles || []).filter((file: any) => 
          !file.fileName.toLowerCase().endsWith('.json')
        );
        
        setSongs(onlyAudio);
      } catch (error) {
        console.error("Error cargando el Explorer:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchContent();
  }, []);

  if (loading) return (
    <div className="flex flex-col items-center justify-center p-20 space-y-4">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
      <p className="text-zinc-400">Cargando catálogo MuSecure...</p>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-10">
        <h2 className="text-3xl font-bold text-white">Explorar Registros</h2>
        <p className="text-zinc-500 text-sm mt-1">Todas las obras protegidas en la red</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {songs.length === 0 ? (
          <p className="col-span-full text-center text-zinc-600 py-10 italic border border-dashed border-zinc-800 rounded-2xl">
            No hay canciones registradas aún.
          </p>
        ) : (
          songs.map((song) => {
            const isEncrypted = !!song.encryption;
            return (
              <div key={song.cid} className="bg-zinc-900 p-5 rounded-2xl border border-zinc-800 hover:border-zinc-700 transition-all">
                <div className="flex justify-between items-start mb-4">
                  <span className={`text-[10px] px-2 py-1 rounded font-bold uppercase ${
                    isEncrypted ? "bg-purple-500/10 text-purple-400" : "bg-emerald-500/10 text-emerald-400"
                  }`}>
                    {isEncrypted ? "🔐 Privado" : "🔓 Público"}
                  </span>
                  <span className="text-[10px] text-zinc-600">{new Date(song.createdAt).toLocaleDateString()}</span>
                </div>

                <h3 className="font-semibold text-zinc-100 truncate mb-1">{song.fileName || "Obra sin título"}</h3>
                <p className="text-[10px] font-mono text-zinc-500 mb-4 truncate">CID: {song.cid}</p>
                
                {isEncrypted ? (
                  <div className="bg-black/40 rounded-xl py-6 flex flex-col items-center justify-center border border-purple-900/10">
                    <span className="text-xl">🔒</span>
                    <p className="text-[10px] text-purple-400/60 mt-1 italic font-medium">Contenido Encriptado</p>
                  </div>
                ) : (
                  <audio 
                    controls 
                    className="w-full h-8 opacity-80 hover:opacity-100 transition-opacity" 
                    src={LighthouseService.gatewayUrl(song.cid)} 
                  />
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};