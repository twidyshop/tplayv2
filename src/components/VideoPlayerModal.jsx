"use client";

import { useState, useEffect, useRef } from "react";
import { X, Loader2 } from "lucide-react";

export default function VideoPlayerModal({ drama, platform, onClose, onSaveHistory }) {
  const [detail, setDetail] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [currentEpisode, setCurrentEpisode] = useState(null);
  const [loading, setLoading] = useState(true);

  const episodesCacheRef = useRef({});
  const detailCacheRef = useRef({});

  const isLandscape = platform === "iqiyi" || platform === "wetv";

  // Ekstraksi ID secara bersih
  const getCleanId = (item) => {
    if (!item) return "";
    return String(
      item.id ||
      item.book_id ||
      item.bookId ||
      item.album_id ||
      item.series_id ||
      item.drama_id ||
      ""
    ).trim();
  };

  const primaryId = getCleanId(drama);

  // Helper parser array episode dari berbagai format payload JSON Hoshiyomi
  const parseEpisodesArray = (json) => {
    if (!json) return [];
    if (Array.isArray(json)) return json;
    if (Array.isArray(json.data)) return json.data;
    if (Array.isArray(json.episodes)) return json.episodes;
    if (Array.isArray(json.chapter_list)) return json.chapter_list;
    if (Array.isArray(json.items)) return json.items;
    if (Array.isArray(json.list)) return json.list;
    if (json.data && Array.isArray(json.data.episodes)) return json.data.episodes;
    if (json.data && Array.isArray(json.data.chapter_list)) return json.data.chapter_list;
    if (json.data && Array.isArray(json.data.list)) return json.data.list;
    return [];
  };

  // Helper pencari URL video dari objek episode
  const extractVideoUrl = (ep) => {
    if (!ep) return "";
    if (typeof ep === "string") return ep;
    
    if (ep.qualities && Array.isArray(ep.qualities) && ep.qualities.length > 0) {
      const bestQuality = ep.qualities[ep.qualities.length - 1];
      if (bestQuality?.url) return bestQuality.url;
    }

    return (
      ep.video_url ||
      ep.play_url ||
      ep.url ||
      ep.hls_url ||
      ep.stream_url ||
      ep.m3u8 ||
      ep.link ||
      ep.video ||
      ""
    );
  };

  useEffect(() => {
    let isMounted = true;

    async function loadAllData() {
      if (!primaryId) {
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        // 1. Fetch Metadata Detail
        let detailData = detailCacheRef.current[primaryId];
        if (!detailData) {
          const resDetail = await fetch(`/api/hoshiyomi/${platform}/detail?id=${encodeURIComponent(primaryId)}`);
          if (resDetail.ok) {
            const jsonDetail = await resDetail.json();
            detailData = jsonDetail.data || jsonDetail;
            detailCacheRef.current[primaryId] = detailData;
          }
        }
        if (isMounted && detailData) setDetail(detailData);

        // 2. Fetch Episodes dengan Metode Fallback Endpoint
        let epsList = episodesCacheRef.current[primaryId] || [];

        if (epsList.length === 0) {
          // Tahap A: Coba endpoint /allepisode (spesifikasi Hoshiyomi API)
          let resEps = await fetch(`/api/hoshiyomi/${platform}/allepisode?id=${encodeURIComponent(primaryId)}`);
          
          // Tahap B: Fallback ke /episodes jika /allepisode 400/404
          if (!resEps.ok) {
            resEps = await fetch(`/api/hoshiyomi/${platform}/episodes?id=${encodeURIComponent(primaryId)}`);
          }

          if (resEps.ok) {
            const jsonEps = await resEps.json();
            epsList = parseEpisodesArray(jsonEps);
          }

          // Tahap C: Jika masih kosong, ekstrak dari detail metadata
          if (epsList.length === 0 && detailData) {
            epsList = parseEpisodesArray(detailData);
          }

          episodesCacheRef.current[primaryId] = epsList;
        }

        if (isMounted) {
          setEpisodes(epsList);
          if (epsList.length > 0) {
            setCurrentEpisode(epsList[0]);
            onSaveHistory({
              id: primaryId,
              title: drama.title || drama.name,
              cover: drama.cover || drama.poster,
              platform,
              episode: 1
            });
          }
        }
      } catch (err) {
        console.error("Error loading drama stream data:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadAllData();

    return () => {
      isMounted = false;
    };
  }, [primaryId, platform]);

  const handleSelectEpisode = (ep, idx) => {
    setCurrentEpisode(ep);
    onSaveHistory({
      id: primaryId,
      title: drama.title || drama.name,
      cover: drama.cover || drama.poster,
      platform,
      episode: idx + 1
    });
  };

  const videoSrc = extractVideoUrl(currentEpisode);

  return (
    <div className="fixed top-[56px] left-0 right-0 bottom-0 z-40 bg-black/95 flex flex-col max-w-lg mx-auto overflow-hidden">
      {/* Sub-Header Modal */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex-shrink-0">
        <span className="text-xs font-bold text-purple-400 uppercase tracking-widest">{platform}</span>
        <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-full bg-slate-800">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Frame Pemutar Video */}
      <div
        className={`w-full bg-black flex items-center justify-center relative flex-shrink-0 ${
          isLandscape ? "aspect-video" : "aspect-[9/16] max-h-[46vh]"
        }`}
      >
        {loading ? (
          <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
        ) : videoSrc ? (
          <video
            src={videoSrc}
            controls
            autoPlay
            playsInline
            crossOrigin="anonymous"
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="text-center p-4 text-xs text-slate-400">
            {episodes.length > 0
              ? "Sumber video episode ini sedang diproses provider."
              : "Daftar episode sedang memuat..."}
          </div>
        )}
      </div>

      {/* Informasi & Pilihan Episode */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <h2 className="text-white font-bold text-base">{drama.title || drama.name}</h2>
          <p className="text-xs text-slate-400 mt-1 line-clamp-2">
            {detail?.description || detail?.intro || "Streaming drama favorit tanpa login di TPLAY."}
          </p>
        </div>

        <div>
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
            Pilih Episode ({episodes.length})
          </h3>

          {episodes.length === 0 && !loading ? (
            <p className="text-xs text-slate-500 italic">Daftar episode tidak tersedia.</p>
          ) : (
            <div className="grid grid-cols-5 gap-2">
              {episodes.map((ep, idx) => {
                const isActive = currentEpisode === ep;
                return (
                  <button
                    key={idx}
                    onClick={() => handleSelectEpisode(ep, idx)}
                    className={`py-2 text-xs font-medium rounded-lg border transition ${
                      isActive
                        ? "bg-purple-600 border-purple-400 text-white font-bold"
                        : "bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700"
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
