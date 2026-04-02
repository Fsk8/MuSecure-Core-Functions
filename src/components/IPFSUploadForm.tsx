import { useState } from "react";
import { useIPFSUpload } from "@/hooks/useIPFSUpload";
import type { FingerprintResult } from "@/services/AudioFingerprintService";
import { RegisterWorkButton } from "@/components/RegisterWorkButton.tsx";

interface Props {
  fingerprint: FingerprintResult;
  ownerAddress: string;
  audioFile: File;
  signMessage: (message: string) => Promise<string>;
  authenticityScore: number;
}

export function IPFSUploadForm({ fingerprint, ownerAddress, audioFile, signMessage, authenticityScore }: Props) {
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [encrypt, setEncrypt] = useState(true);
  const [isSoulbound, setIsSoulbound] = useState(false);

  const { upload, progress, result, error, reset } = useIPFSUpload();
  const isUploading = progress.stage !== "idle" && progress.stage !== "done" && progress.stage !== "error";

  const handleSubmit = async () => {
    if (!title.trim() || !artist.trim()) return;
    await upload({ 
        audioFile, 
        ownerAddress, 
        signMessage: encrypt ? signMessage : undefined, 
        encrypt, 
        title, 
        artist, 
        fingerprint: { 
            sha256: fingerprint.sha256, 
            data: fingerprint.fingerprint, 
            durationSec: fingerprint.duration 
        } 
    });
  };

  if (result) return (
    <div className="bg-zinc-900 border border-emerald-500/30 rounded-3xl p-8 shadow-2xl text-center">
      <div className="w-16 h-16 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">✓</div>
      <h3 className="text-xl font-bold text-white mb-2">Obra subida a IPFS</h3>
      <RegisterWorkButton 
        fingerprintHash={`0x${result.metadata.fingerprint.sha256}`} 
        ipfsCid={result.metadataCid} 
        authenticityScore={authenticityScore} 
        soulbound={isSoulbound} 
      />
      <button onClick={reset} className="mt-4 text-zinc-500 text-xs hover:text-white">Subir otra obra</button>
    </div>
  );

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 shadow-2xl space-y-6">
      <h3 className="text-xl font-bold text-white border-b border-zinc-800 pb-4">2. Detalles de la Obra</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <label className="text-[10px] text-zinc-500 uppercase font-bold ml-1">Título</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 text-white focus:border-indigo-500 outline-none mt-1" placeholder="Ej: Mi canción" />
          </div>
          <div>
            <label className="text-[10px] text-zinc-500 uppercase font-bold ml-1">Artista</label>
            <input type="text" value={artist} onChange={(e) => setArtist(e.target.value)} className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 text-white focus:border-indigo-500 outline-none mt-1" placeholder="Ej: Favio M." />
          </div>
        </div>

        <div className="space-y-4">
          <label className="text-[10px] text-zinc-500 uppercase font-bold ml-1">Configuración de Privacidad</label>
          
          {/* TOGGLE ENCRIPTADO */}
          <div 
            onClick={() => setEncrypt(!encrypt)} 
            className={`p-4 rounded-2xl border cursor-pointer transition-all ${encrypt ? 'bg-purple-500/10 border-purple-500/50' : 'bg-zinc-800/30 border-zinc-800'}`}
          >
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm font-bold text-white">{encrypt ? "🔒 Encriptado" : "🌐 Público"}</p>
                <p className="text-[10px] text-zinc-500">{encrypt ? "Solo tú puedes autorizar el acceso" : "Cualquiera puede escuchar"}</p>
              </div>
              <div className={`w-10 h-5 rounded-full relative transition-colors ${encrypt ? 'bg-purple-600' : 'bg-zinc-700'}`}>
                <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${encrypt ? 'left-6' : 'left-1'}`} />
              </div>
            </div>
          </div>

          {/* TOGGLE SOULBOUND */}
          <div 
            onClick={() => setIsSoulbound(!isSoulbound)} 
            className={`p-4 rounded-2xl border cursor-pointer transition-all ${isSoulbound ? 'bg-indigo-500/10 border-indigo-500/50' : 'bg-zinc-800/30 border-zinc-800'}`}
          >
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm font-bold text-white">{isSoulbound ? "🔗 Soulbound" : "↔️ Transferible"}</p>
                <p className="text-[10px] text-zinc-500">{isSoulbound ? "NFT no transferible" : "NFT negociable"}</p>
              </div>
              <div className={`w-10 h-5 rounded-full relative transition-colors ${isSoulbound ? 'bg-indigo-600' : 'bg-zinc-700'}`}>
                <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${isSoulbound ? 'left-6' : 'left-1'}`} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <button 
        onClick={handleSubmit} 
        disabled={!title.trim() || !artist.trim() || isUploading} 
        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-2xl transition-all disabled:opacity-50 shadow-lg shadow-indigo-500/20"
      >
        {isUploading ? `${progress.message}...` : "Subir a IPFS y Preparar Registro"}
      </button>
    </div>
  );
}