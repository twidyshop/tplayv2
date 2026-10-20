"use client";

import { useState, useEffect, useRef } from "react";
import { X, Loader2 } from "lucide-react";

export default function VideoPlayerModal({ drama, platform, onClose, onSaveHistory }) {
  const [detail, setDetail] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [currentEpisode, setCurrentEpisode] = useState(null);
  const [loading, setLoading] = useState(true);

  // Client-side Caching Ref (Memory Cache per Komponen)
  const episodesCacheRef = useRef({});
  const detailCacheRef = useRef({});

  const dramaId = drama.id || drama.book_id || drama.series_id;

  useEffect(() => {
    let isMounted = true;

    async function loadDramaData() {
      setLoading(true);

      try {
        // 1. CACHE METADATA DETAIL
        let detailData = detailCacheRef.current[dramaId];
        if (!detailData) {
          const resDetail = await fetch(`/api/hoshiyomi/${platform}/detail?id=${dramaId}`);
          const jsonDetail = await resDetail.json();
          detailData = jsonDetail.data || jsonDetail;
          detailCacheRef.current[dramaId] = detailData;
        }

        if (isMounted) setDetail(detailData);

        // 2. CACHE METADATA EPISODE (FETCH ONCE ONLY)
        let epsList = episodesCacheRef.current[dramaId];
        if (!epsList) {
          const resEps = await fetch(`/api/hoshiyomi/${platform}/episodes?id=${dramaId}`);
          const jsonEps = await resEps.json();
          epsList = jsonEps.data || jsonEps.episodes || [];
          episodesCacheRef.current[dramaId] = epsList;
        }

        if (isMounted) {
          setEpisodes(epsList);
          if (epsList.length > 0) {
            setCurrentEpisode(epsList[0]);
            onSaveHistory({
              id: dramaId,
              title: drama.title || drama.name,
              cover: drama.cover || drama.poster,
              platform,
              episode: 1
            });
          }
        }
      } catch (err) {
        console.error("Error loading episode metadata:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    if (dramaId) {
      loadDramaData();
    }

    return () => {
      isMounted = false;
    };
  }, [dramaId, platform]);

  const handleSelectEpisode = (ep, idx) => {
    // Re-use episode data dari state lokal yang sudah di-cache (Tanpa Re-fetch ke API!)
    setCurrentEpisode(ep);
    onSaveHistory({
      id: dramaId,
      title: drama.title || drama.name,
      cover: drama.cover || drama.poster,
      platform,
      episode: idx + 1
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col max-w-lg mx-auto">
      <div className="flex items-center justify-between p-3 bg-slate-900 border-b border-slate-800">
        <span className="text-xs font-bold text-purple-400 uppercase tracking-widest">{platform}</span>
        <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-full bg-slate-800">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Video Frame */}
      <div className="w-full aspect-video bg-black flex items-center justify-center relative">
        {loading ? (
          <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
        ) : currentEpisode?.video_url || currentEpisode?.url || currentEpisode?.play_url ? (
          <video
            src={currentEpisode?.video_url || currentEpisode?.url || currentEpisode?.play_url}
            controls
            autoPlay
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="text-center p-4 text-xs text-slate-400">
            Sumber video tidak tersedia atau memerlukan otorisasi player.
          </div>
        )}
      </div>

      {/* Episode Selection List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <h2 className="text-white font-bold text-lg">{drama.title || drama.name}</h2>
          <p className="text-xs text-slate-400 mt-1 line-clamp-3">
            {detail?.description || detail?.intro || "Drama favorit tanpa login di TPLAY."}
          </p>
        </div>

        <div>
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
            Pilih Episode ({episodes.length})
          </h3>
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
        </div>
      </div>
    </div>
  );
}
