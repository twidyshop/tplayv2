"use client";

import { useState, useEffect, useRef } from "react";
import { X, Loader2 } from "lucide-react";

export default function VideoPlayerModal({ drama, platform, onClose, onSaveHistory }) {
  const [detail, setDetail] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [currentEpisode, setCurrentEpisode] = useState(null);
  const [streamUrl, setStreamUrl] = useState("");
  const [loading, setLoading] = useState(true);

  const episodesCacheRef = useRef({});
  const detailCacheRef = useRef({});

  const isLandscape = platform === "iqiyi" || platform === "wetv";

  // Ekstraksi ID yang bersih
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

  // Deep search untuk menemukan URL video dalam objek episode (Mendukung semua platform)
  const findAnyVideoUrl = (obj) => {
    if (!obj) return "";
    if (typeof obj === "string") {
      if (obj.startsWith("http://") || obj.startsWith("https://")) {
        const lower = obj.toLowerCase();
        if (
          !lower.endsWith(".jpg") &&
          !lower.endsWith(".jpeg") &&
          !lower.endsWith(".png") &&
          !lower.endsWith(".webp") &&
          !lower.endsWith(".gif")
        ) {
          return obj;
        }
      }
      return "";
    }

    // Cek nama kunci utama secara langsung
    const primaryKeys = [
      "video_url", "videoUrl", "play_url", "playUrl", "stream_url", "streamUrl",
      "hls_url", "hlsUrl", "m3u8_url", "m3u8Url", "m3u8", "url", "link",
      "cdn_url", "cdnUrl", "download_url", "downloadUrl", "video", "media_url",
      "resource_url", "video_path", "video_link", "file"
    ];

    for (const key of primaryKeys) {
      if (obj[key]) {
        const found = findAnyVideoUrl(obj[key]);
        if (found) return found;
      }
    }

    // Cek properti bertingkat (array qualities, streams, dll.)
    const arrayKeys = ["qualities", "streams", "video_list", "urls", "episodes", "list", "data"];
    for (const key of arrayKeys) {
      if (Array.isArray(obj[key])) {
        for (const item of obj[key]) {
          const found = findAnyVideoUrl(item);
          if (found) return found;
        }
      }
    }

    // Pencarian rekursif untuk struktur JSON unik
    if (typeof obj === "object") {
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          if (
            key.includes("cover") ||
            key.includes("poster") ||
            key.includes("image") ||
            key.includes("avatar") ||
            key.includes("thumb")
          ) {
            continue;
          }
          const val = obj[key];
          if (typeof val === "string") {
            const found = findAnyVideoUrl(val);
            if (found) return found;
          } else if (typeof val === "object" && val !== null) {
            const found = findAnyVideoUrl(val);
            if (found) return found;
          }
        }
      }
    }

    return "";
  };

  // Helper parsing array episode
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

  useEffect(() => {
    let isMounted = true;

    async function loadDramaData() {
      if (!primaryId) {
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        // Fetch detail metadata
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

        // Fetch episode via /allepisodes (Sesuai Spesifikasi Hoshiyomi API)
        let epsList = episodesCacheRef.current[primaryId] || [];

        if (epsList.length === 0) {
          // Priority 1: /allepisode (Endpoint resmi Hoshiyomi berisi video)
          let resEps = await fetch(`/api/hoshiyomi/${platform}/allepisode?id=${encodeURIComponent(primaryId)}`);
          
          // Priority 2: Fallback ke /episodes
          if (!resEps.ok) {
            resEps = await fetch(`/api/hoshiyomi/${platform}/episodes?id=${encodeURIComponent(primaryId)}`);
          }

          if (resEps.ok) {
            const jsonEps = await resEps.json();
            epsList = parseEpisodesArray(jsonEps);
          }

          // Priority 3: Fallback ke detail metadata
          if (epsList.length === 0 && detailData) {
            epsList = parseEpisodesArray(detailData);
          }

          episodesCacheRef.current[primaryId] = epsList;
        }

        if (isMounted) {
          setEpisodes(epsList);
          if (epsList.length > 0) {
            const firstEp = epsList[0];
            setCurrentEpisode(firstEp);
            const initialUrl = findAnyVideoUrl(firstEp);
            setStreamUrl(initialUrl);

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
        console.error("Error loading drama episodes:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadDramaData();

    return () => {
      isMounted = false;
    };
  }, [primaryId, platform]);

  const handleSelectEpisode = (ep, idx) => {
    setCurrentEpisode(ep);
    const url = findAnyVideoUrl(ep);
    setStreamUrl(url);

    onSaveHistory({
      id: primaryId,
      title: drama.title || drama.name,
      cover: drama.cover || drama.poster,
      platform,
      episode: idx + 1
    });
  };

  return (
    <div className="fixed top-[56px] left-0 right-0 bottom-0 z-40 bg-black/95 flex flex-col max-w-lg mx-auto overflow-hidden">
      {/* Top Modal Navigation */}
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
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
            <span className="text-xs text-slate-400">Memuat episode...</span>
          </div>
        ) : streamUrl ? (
          <video
            src={streamUrl}
            controls
            autoPlay
            playsInline
            crossOrigin="anonymous"
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="text-center p-4 text-xs text-slate-400">
            {episodes.length > 0
              ? "URL video episode ini tidak ditemukan di objek episode."
              : "Daftar episode sedang memuat..."}
          </div>
        )}
      </div>

      {/* Detail & Pilihan Episode */}
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
