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

  // Ambil ID utama dari objek drama tanpa nilai undefined
  const extractPrimaryId = (item) => {
    if (!item) return "";
    return (
      item.book_id ||
      item.bookId ||
      item.id ||
      item.album_id ||
      item.series_id ||
      item.drama_id ||
      ""
    );
  };

  const primaryId = extractPrimaryId(drama);

  // Parsing fleksibel dari berbagai jenis payload JSON Hoshiyomi
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

  // Ekstraksi URL streaming video
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
      (ep.qualities && ep.qualities[0]?.url) ||
      ""
    );
  };

  useEffect(() => {
    let isMounted = true;

    async function fetchDramaPayload() {
      if (!primaryId) {
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        let detailData = detailCacheRef.current[primaryId];
        let epsList = episodesCacheRef.current[primaryId] || [];

        // 1. Coba Ambil Detail
        if (!detailData) {
          let resDetail = await fetch(`/api/hoshiyomi/${platform}/detail?id=${primaryId}`);
          if (!resDetail.ok) {
            resDetail = await fetch(`/api/hoshiyomi/${platform}/detail?book_id=${primaryId}`);
          }
          if (resDetail.ok) {
            const jsonDetail = await resDetail.json();
            detailData = jsonDetail.data || jsonDetail;
            detailCacheRef.current[primaryId] = detailData;
          }
        }

        if (isMounted && detailData) setDetail(detailData);

        // 2. Coba Ambil Episodes (Metode Bertahap)
        if (epsList.length === 0) {
          // Percobaan 1: Menggunakan id
          let resEps = await fetch(`/api/hoshiyomi/${platform}/episodes?id=${primaryId}`);
          
          // Percobaan 2: Menggunakan book_id jika percobaan 1 gagal/400
          if (!resEps.ok) {
            resEps = await fetch(`/api/hoshiyomi/${platform}/episodes?book_id=${primaryId}`);
          }

          if (resEps.ok) {
            const jsonEps = await resEps.json();
            epsList = parseListFromResponse(jsonEps);
          }

          // Percobaan 3: Jika endpoint /episodes kosong, periksa metadata detail
          if (epsList.length === 0 && detailData) {
            epsList = parseListFromResponse(detailData);
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
        console.error("Error fetching drama player data:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchDramaPayload();

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

  const videoSrc = getVideoUrl(currentEpisode);

  return (
    <div className="fixed top-[56px] left-0 right-0 bottom-0 z-40 bg-black/95 flex flex-col max-w-lg mx-auto overflow-hidden">
      {/* Sub-Header Modal Player */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex-shrink-0">
        <span className="text-xs font-bold text-purple-400 uppercase tracking-widest">{platform}</span>
        <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-full bg-slate-800">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Frame Pemutar Video */}
      <div
        className={`w-full bg-black flex items-center justify-center relative flex-shrink-0 ${
          isLandscape ? "aspect-video" : "aspect-[9/16] max-h-[48vh]"
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

      {/* Informasi & Daftar Episode */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <h2 className="text-white font-bold text-base">{drama.title || drama.name}</h2>
          <p className="text-xs text-slate-400 mt-1 line-clamp-2">
            {detail?.description || detail?.intro || "Nonton drama favorit tanpa login di TPLAY."}
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
