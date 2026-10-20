"use client";

import { useState, useEffect } from "react";
import { X, Play, Loader2 } from "lucide-react";

export default function VideoPlayerModal({ drama, platform, onClose, onSaveHistory }) {
  const [detail, setDetail] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [currentEpisode, setCurrentEpisode] = useState(null);
  const [loading, setLoading] = useState(true);

  const dramaId = drama.id || drama.book_id || drama.series_id;

  useEffect(() => {
    async function fetchDramaDetail() {
      setLoading(true);
      try {
        const resDetail = await fetch(`/api/hoshiyomi/${platform}/detail?id=${dramaId}`);
        const dataDetail = await resDetail.json();
        const dramaInfo = dataDetail.data || dataDetail;
        setDetail(dramaInfo);

        const resEps = await fetch(`/api/hoshiyomi/${platform}/episodes?id=${dramaId}`);
        const dataEps = await resEps.json();
        const epsList = dataEps.data || dataEps.episodes || [];
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
      } catch (err) {
        console.error("Error fetching detail:", err);
      } finally {
        setLoading(false);
      }
    }

    if (dramaId) fetchDramaDetail();
  }, [dramaId, platform]);

  const handleSelectEpisode = (ep, idx) => {
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
            Sumber pemutaran video tidak ditemukan atau memerlukan izin DRM.
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <h2 className="text-white font-bold text-lg">{drama.title || drama.name}</h2>
          <p className="text-xs text-slate-400 mt-1 line-clamp-3">
            {detail?.description || detail?.intro || "Nonton drama gratis tanpa login di TPLAY."}
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
