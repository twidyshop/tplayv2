"use client";

import { useState, useEffect, useRef } from "react";
import { X, Loader2 } from "lucide-react";

export default function VideoPlayerModal({ drama, platform, onClose, onSaveHistory }) {
  const [detail, setDetail] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [currentEpisode, setCurrentEpisode] = useState(null);
  const [streamUrl, setStreamUrl] = useState("");
  const [loading, setLoading] = useState(true);

  const videoRef = useRef(null);
  const hlsInstanceRef = useRef(null);
  const episodesCacheRef = useRef({});
  const detailCacheRef = useRef({});

  const isLandscape = platform === "iqiyi" || platform === "wetv";

  // Ambil ID utama drama
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

  // Penarik URL video rekursif dari segala nama kunci JSON Hoshiyomi API
  const findVideoUrlFromObj = (obj) => {
    if (!obj) return "";
    if (typeof obj === "string") {
      if (obj.startsWith("http://") || obj.startsWith("https://") || obj.startsWith("//")) {
        return obj;
      }
      return "";
    }

    // 1. Cek properti langsung
    const directKeys = [
      "video_url", "videoUrl", "play_url", "playUrl", "stream_url", "streamUrl",
      "hls_url", "hlsUrl", "m3u8_url", "m3u8Url", "m3u8", "url", "link",
      "cdn_url", "cdnUrl", "download_url", "downloadUrl", "media_url",
      "resource_url", "src", "file"
    ];

    for (const key of directKeys) {
      if (obj[key] && typeof obj[key] === "string" && (obj[key].startsWith("http") || obj[key].startsWith("//"))) {
        return obj[key];
      }
    }

    // 2. Cek array bertingkat (qualities, streams, video_list, urls)
    const arrayKeys = ["qualities", "streams", "video_list", "urls", "video_qualities"];
    for (const key of arrayKeys) {
      if (Array.isArray(obj[key]) && obj[key].length > 0) {
        for (const item of obj[key]) {
          const found = findVideoUrlFromObj(item);
          if (found) return found;
        }
      }
    }

    // 3. Rekursi untuk objek bersarang (nested object)
    if (typeof obj === "object") {
      for (const k in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, k)) {
          if (
            k.toLowerCase().includes("cover") ||
            k.toLowerCase().includes("poster") ||
            k.toLowerCase().includes("image") ||
            k.toLowerCase().includes("thumb")
          ) {
            continue;
          }
          const res = findVideoUrlFromObj(obj[k]);
          if (res) return res;
        }
      }
    }

    return "";
  };

  // Helper parser array episode
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

  // Load Metadata & List Episode
  useEffect(() => {
    let isMounted = true;

    async function loadDramaData() {
      if (!primaryId) {
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
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

        let epsList = episodesCacheRef.current[primaryId] || [];

        if (epsList.length === 0) {
          let resEps = await fetch(`/api/hoshiyomi/${platform}/allepisode?id=${encodeURIComponent(primaryId)}`);
          if (!resEps.ok) {
            resEps = await fetch(`/api/hoshiyomi/${platform}/episodes?id=${encodeURIComponent(primaryId)}`);
          }

          if (resEps.ok) {
            const jsonEps = await resEps.json();
            epsList = parseEpisodesArray(jsonEps);
          }

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
            const initialUrl = findVideoUrlFromObj(firstEp);
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
        console.error("Error loading episode list:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadDramaData();

    return () => {
      isMounted = false;
    };
  }, [primaryId, platform]);

  // Load HLS.js dinamis untuk pemutaran format .m3u8 di Chrome / Brave Android
  useEffect(() => {
    if (!streamUrl || !videoRef.current) return;

    const videoEl = videoRef.current;

    if (hlsInstanceRef.current) {
      hlsInstanceRef.current.destroy();
      hlsInstanceRef.current = null;
    }

    const isM3u8 = streamUrl.includes(".m3u8") || streamUrl.includes("m3u8");

    if (isM3u8) {
      if (videoEl.canPlayType("application/vnd.apple.mpegurl")) {
        videoEl.src = streamUrl;
      } else {
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/hls.js@latest";
        script.onload = () => {
          if (window.Hls && window.Hls.isSupported()) {
            const hls = new window.Hls({
              enableWorker: true,
              lowLatencyMode: true,
            });
            hls.loadSource(streamUrl);
            hls.attachMedia(videoEl);
            hlsInstanceRef.current = hls;
          } else {
            videoEl.src = streamUrl;
          }
        };
        document.body.appendChild(script);
      }
    } else {
      videoEl.src = streamUrl;
    }
  }, [streamUrl]);

  const handleSelectEpisode = (ep, idx) => {
    setCurrentEpisode(ep);
    const url = findVideoUrlFromObj(ep);
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
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
            <span className="text-xs text-slate-400">Memuat episode...</span>
          </div>
        ) : streamUrl ? (
          <video
            ref={videoRef}
            controls
            autoPlay
            playsInline
            crossOrigin="anonymous"
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="text-center p-4 text-xs text-slate-400">
            {episodes.length > 0
              ? "URL video episode tidak ditemukan di objek API."
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
