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

  // Eliminamos 'error' de aquí ya que no lo estabas renderizando
  const { upload, progress, result } = useIPFSUpload();
  const isUploading = progress.stage !== "idle" && progress.stage !== "done" && progress.stage !== "error";

  const handleSubmit = async () => {
    if (!title.trim() || !artist.trim()) return;
    await upload({ 
      audioFile, ownerAddress, 
      signMessage: encrypt ? signMessage : undefined, 
      encrypt, title, artist, 
      fingerprint: { sha256: fingerprint.sha256, data: fingerprint.fingerprint, durationSec: fingerprint.duration } 
    });
  };

  if (result) return (
    <div className="bg-zinc-900 border border-emerald-500/30 rounded-3xl p-8 text-center animate-in zoom-in-95">
      <div className="w-16 h-16 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">✓</div>
      <h3 className="text-xl font-bold text-white mb-2">Subida exitosa</h3>
      <RegisterWorkButton 
        fingerprintHash={`0x${result.metadata.fingerprint.sha256}`} 
        ipfsCid={result.metadataCid} 
        authenticityScore={authenticityScore} 
        soulbound={isSoulbound} 
      />
    </div>
  );

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 space-y-6 shadow-2xl">
      <h3 className="text-xl font-bold text-white border-b border-zinc-800 pb-4">2. Configuración</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 text-white focus:border-indigo-500 outline-none" placeholder="Título de la obra" />
          <input type="text" value={artist} onChange={(e) => setArtist(e.target.value)} className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 text-white focus:border-indigo-500 outline-none" placeholder="Nombre del Artista" />
        </div>

        <div className="space-y-3">
          <button 
            type="button"
            onClick={() => setEncrypt(!encrypt)} 
            className={`w-full flex justify-between items-center p-4 rounded-2xl border transition-all ${encrypt ? 'bg-purple-600/10 border-purple-500/50' : 'bg-black border-zinc-800'}`}
          >
            <div className="text-left">
              <p className={`text-sm font-bold ${encrypt ? 'text-purple-400' : 'text-zinc-400'}`}>{encrypt ? "🔒 Encriptado" : "🌐 Público"}</p>
              <p className="text-[10px] text-zinc-600">Privacidad de Lighthouse</p>
            </div>
            <div className={`w-4 h-4 rounded-full ${encrypt ? 'bg-purple-500' : 'bg-zinc-800'}`} />
          </button>

          <button 
            type="button"
            onClick={() => setIsSoulbound(!isSoulbound)} 
            className={`w-full flex justify-between items-center p-4 rounded-2xl border transition-all ${isSoulbound ? 'bg-indigo-600/10 border-indigo-500/50' : 'bg-black border-zinc-800'}`}
          >
            <div className="text-left">
              <p className={`text-sm font-bold ${isSoulbound ? 'text-indigo-400' : 'text-zinc-400'}`}>{isSoulbound ? "🔗 Soulbound" : "↔️ Transferible"}</p>
              <p className="text-[10px] text-zinc-600">Propiedad del NFT</p>
            </div>
            <div className={`w-4 h-4 rounded-full ${isSoulbound ? 'bg-indigo-500' : 'bg-zinc-800'}`} />
          </button>
        </div>
      </div>

      <button 
        onClick={handleSubmit} 
        disabled={!title.trim() || !artist.trim() || isUploading} 
        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-2xl transition-all disabled:opacity-50"
      >
        {isUploading ? `${progress.message}...` : "Subir a IPFS"}
      </button>
    </div>
  );
}