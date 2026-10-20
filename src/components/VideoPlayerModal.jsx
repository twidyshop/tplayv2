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

  // Deteksi ID drama dari berbagai kemungkinan atribut API
  const dramaId = drama.id || drama.book_id || drama.series_id || drama.drama_id;

  // iQIYI & WeTV memakai Landscape (16:9), sisanya memakai Portrait (9:16)
  const isLandscape = platform === "iqiyi" || platform === "wetv";

  // Fungsi pembaca struktur list dari berbagai format API Hoshiyomi
  const parseListFromResponse = (json) => {
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

  // Ekstraksi URL video dari berbagai nama kunci
  const getVideoUrl = (ep) => {
    if (!ep) return "";
    if (typeof ep === "string") return ep;
    return (
      ep.video_url ||
      ep.play_url ||
      ep.url ||
      ep.hls_url ||
      ep.stream_url ||
      ep.m3u8 ||
      ep.link ||
      ""
    );
  };

  useEffect(() => {
    let isMounted = true;

    async function loadDramaData() {
      setLoading(true);

      try {
        // 1. Fetch Detail Metadata
        let detailData = detailCacheRef.current[dramaId];
        if (!detailData) {
          const resDetail = await fetch(`/api/hoshiyomi/${platform}/detail?id=${dramaId}&book_id=${dramaId}`);
          const jsonDetail = await resDetail.json();
          detailData = jsonDetail.data || jsonDetail;
          detailCacheRef.current[dramaId] = detailData;
        }
        if (isMounted) setDetail(detailData);

        // 2. Fetch Daftar Episode
        let epsList = episodesCacheRef.current[dramaId];
        if (!epsList || epsList.length === 0) {
          const resEps = await fetch(`/api/hoshiyomi/${platform}/episodes?id=${dramaId}&book_id=${dramaId}`);
          const jsonEps = await resEps.json();
          epsList = parseListFromResponse(jsonEps);
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
        console.error("Error loading drama player data:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    if (dramaId) loadDramaData();

    return () => {
      isMounted = false;
    };
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

  const videoSrc = getVideoUrl(currentEpisode);

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col max-w-lg mx-auto overflow-hidden">
      {/* Header Modal */}
      <div className="flex items-center justify-between p-3 bg-slate-900 border-b border-slate-800 flex-shrink-0">
        <span className="text-xs font-bold text-purple-400 uppercase tracking-widest">{platform}</span>
        <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-full bg-slate-800">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Frame Pemutar Video (Dinamis Portrait 9:16 atau Landscape 16:9) */}
      <div
        className={`w-full bg-black flex items-center justify-center relative flex-shrink-0 ${
          isLandscape ? "aspect-video" : "aspect-[9/16] max-h-[55vh]"
        }`}
      >
        {loading ? (
          <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
        ) : videoSrc ? (
          <video src={videoSrc} controls autoPlay className="w-full h-full object-contain" />
        ) : (
          <div className="text-center p-4 text-xs text-slate-400">
            Sumber video sedang diproses atau memerlukan akses VIP provider.
          </div>
        )}
      </div>

      {/* Detail & Daftar Episode */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <h2 className="text-white font-bold text-base">{drama.title || drama.name}</h2>
          <p className="text-xs text-slate-400 mt-1 line-clamp-2">
            {detail?.description || detail?.intro || "Drama favorit tanpa login di TPLAY."}
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
