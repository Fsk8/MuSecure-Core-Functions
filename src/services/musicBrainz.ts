/**
 * MuSecure – MusicBrainz Service
 * Obtiene releaseId a partir de recordingId para Cover Art Archive
 */

export async function getReleaseIdFromRecording(recordingId: string): Promise<string | null> {
    try {
      // Rate limiting: esperar 1 segundo entre llamadas (MusicBrainz permite 1 req/seg)
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const url = `https://musicbrainz.org/ws/2/recording/${recordingId}?inc=releases&fmt=json`;
      console.log(`🔍 [MusicBrainz] Buscando releases para recording: ${recordingId}`);
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'MuSecure/1.0 (https://musecure.app)',
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        console.warn(`⚠️ MusicBrainz API error: ${response.status}`);
        return null;
      }
      
      const data = await response.json();
      const releases = data.releases || [];
      
      console.log(`📋 [MusicBrainz] ${releases.length} releases encontrados`);
      
      // Priorizar releases oficiales y tipo Album
      const officialRelease = releases.find((r: any) => 
        r.status === 'Official' && r.release_group?.primary_type === 'Album'
      );
      
      if (officialRelease?.id) {
        console.log(`✅ [MusicBrainz] Release oficial (Album): ${officialRelease.id}`);
        return officialRelease.id;
      }
      
      // Fallback: cualquier release oficial
      const anyOfficial = releases.find((r: any) => r.status === 'Official');
      if (anyOfficial?.id) {
        console.log(`✅ [MusicBrainz] Release oficial: ${anyOfficial.id}`);
        return anyOfficial.id;
      }
      
      // Último fallback: cualquier release con ID
      const anyRelease = releases.find((r: any) => r.id);
      if (anyRelease?.id) {
        console.log(`✅ [MusicBrainz] Release (fallback): ${anyRelease.id}`);
        return anyRelease.id;
      }
      
      console.log(`❌ [MusicBrainz] No se encontró releaseId`);
      return null;
      
    } catch (e) {
      console.warn('❌ [MusicBrainz] Error fetching releaseId:', e);
      return null;
    }
  }
  
  /**
   * Obtiene la URL de portada para un releaseId
   */
  export function getCoverArtUrl(releaseId: string | null | undefined): string | null {
    if (!releaseId) return null;
    return `https://coverartarchive.org/release/${releaseId}/front-250`;
  }