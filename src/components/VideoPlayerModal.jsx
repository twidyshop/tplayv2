"use client";

import { useState, useEffect, useRef } from "react";
import { X, Loader2, Menu } from "lucide-react";

export default function VideoPlayerModal({ drama, platform, onClose, onSaveHistory }) {
  const [detail, setDetail] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [currentEpisode, setCurrentEpisode] = useState(null);
  const [streamUrl, setStreamUrl] = useState("");
  const [subtitleUrl, setSubtitleUrl] = useState("");
  const [loading, setLoading] = useState(true);
  
  // State khusus untuk Portrait Player UI
  const [isPortraitMenuOpen, setIsPortraitMenuOpen] = useState(false);

  const videoRef = useRef(null);
  const hlsInstanceRef = useRef(null);
  const episodesCacheRef = useRef({});
  const detailCacheRef = useRef({});

  // iQIYI & WeTV menggunakan mode Landscape
  const isLandscape = platform === "iqiyi" || platform === "wetv";

  // Ekstraksi ID yang mencakup semua platform (WeTV butuh cid/vid)
  const getCleanId = (item) => {
    if (!item) return "";
    return String(
      item.id ||
      item.cid ||
      item.vid ||
      item.book_id ||
      item.bookId ||
      item.album_id ||
      item.series_id ||
      item.drama_id ||
      ""
    ).trim();
  };

  const primaryId = getCleanId(drama);

  // Penarik URL Video Anti-Kotak Patah
  const findVideoUrlFromObj = (obj) => {
    if (!obj) return "";
    if (typeof obj === "string") {
      if ((obj.startsWith("http") || obj.startsWith("//")) && !obj.match(/\.(jpg|jpeg|png|webp|gif)$/i)) {
        return obj;
      }
      return "";
    }

    const directKeys = [
      "video_url", "videoUrl", "play_url", "playUrl", "stream_url", "streamUrl",
      "hls_url", "hlsUrl", "m3u8_url", "m3u8Url", "m3u8", "url", "link",
      "cdn_url", "cdnUrl", "download_url", "media_url", "src", "file"
    ];

    for (const key of directKeys) {
      if (obj[key] && typeof obj[key] === "string" && obj[key].startsWith("http")) {
        return obj[key];
      }
    }

    const arrayKeys = ["qualities", "streams", "video_list", "urls", "video_qualities"];
    for (const key of arrayKeys) {
      if (Array.isArray(obj[key]) && obj[key].length > 0) {
        for (const item of obj[key]) {
          const found = findVideoUrlFromObj(item);
          if (found) return found;
        }
      }
    }

    if (typeof obj === "object") {
      for (const k in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, k)) {
          if (k.toLowerCase().match(/cover|poster|image|thumb|pic/)) continue;
          const res = findVideoUrlFromObj(obj[k]);
          if (res) return res;
        }
      }
    }
    return "";
  };

  // Penarik URL Subtitle
  const findSubtitleUrl = (obj) => {
    if (!obj) return "";
    const subKeys = ["subtitle", "subtitles", "captions", "cc", "srt"];
    
    for (const key of subKeys) {
      const val = obj[key];
      if (!val) continue;
      if (typeof val === "string" && val.startsWith("http")) return val;
      
      if (Array.isArray(val) && val.length > 0) {
        // Cari subtitle bahasa Indonesia jika ada
        const idSub = val.find(s => s.lang && (s.lang.toLowerCase().includes('id') || s.lang.toLowerCase().includes('ind')));
        if (idSub) return idSub.url || idSub.src || idSub.file || "";
        return val[0].url || val[0].src || val[0].file || "";
      }
      if (typeof val === "object") {
        return val.url || val.src || val.file || "";
      }
    }
    return "";
  };

  // Parser Data API (Menangani Format WeTV)
  const parseEpisodesArray = (json) => {
    if (!json) return [];
    if (Array.isArray(json)) return json;
    if (Array.isArray(json.data)) return json.data;
    if (Array.isArray(json.episodes)) return json.episodes;
    if (Array.isArray(json.chapter_list)) return json.chapter_list;
    if (Array.isArray(json.items)) return json.items;
    if (Array.isArray(json.list)) return json.list;
    if (json.data) {
      if (Array.isArray(json.data.episodes)) return json.data.episodes;
      if (Array.isArray(json.data.chapter_list)) return json.data.chapter_list;
      if (Array.isArray(json.data.list)) return json.data.list;
      if (Array.isArray(json.data.episode_list)) return json.data.episode_list;
      if (Array.isArray(json.data.items)) return json.data.items;
    }
    return [];
  };

  // 1. Fetch Metadata & Episode List
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
            
            setStreamUrl(findVideoUrlFromObj(firstEp));
            setSubtitleUrl(findSubtitleUrl(firstEp) || findSubtitleUrl(detailData));

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
    return () => { isMounted = false; };
  }, [primaryId, platform]);

  // 2. HLS.js Binding untuk Android / Brave tanpa Strict CORS
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
    setStreamUrl(findVideoUrlFromObj(ep));
    setSubtitleUrl(findSubtitleUrl(ep));
    
    // Tutup menu overlay jika di mode portrait setelah pilih episode
    if (!isLandscape) setIsPortraitMenuOpen(false);

    onSaveHistory({
      id: primaryId,
      title: drama.title || drama.name,
      cover: drama.cover || drama.poster,
      platform,
      episode: idx + 1
    });
  };

  // Komponen Grid Episode yang Reusable
  const renderEpisodeGrid = () => (
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
  );

  return (
    <div className="fixed top-[56px] left-0 right-0 bottom-0 z-40 bg-black/95 flex flex-col max-w-lg mx-auto overflow-hidden">
      {/* Sub-Header Modal */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex-shrink-0 z-50">
        <span className="text-xs font-bold text-purple-400 uppercase tracking-widest">{platform}</span>
        <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-full bg-slate-800">
          <X className="w-5 h-5" />
        </button>
      </div>

      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 bg-black">
          <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
          <span className="text-xs text-slate-400">Memuat data provider...</span>
        </div>
      ) : isLandscape ? (
        // ==========================================
        // LAYOUT LANDSCAPE (iQIYI & WeTV)
        // ==========================================
        <>
          <div className="w-full aspect-video bg-black flex items-center justify-center relative flex-shrink-0">
            {streamUrl ? (
              <video
                ref={videoRef}
                controls
                autoPlay
                playsInline
                referrerPolicy="no-referrer"
                className="w-full h-full object-contain"
              >
                {subtitleUrl && <track kind="captions" src={subtitleUrl} srcLang="id" label="Indonesia" default />}
              </video>
            ) : (
              <div className="text-center p-4 text-xs text-slate-400">URL video tidak ditemukan.</div>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-black">
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
              {episodes.length === 0 ? (
                <p className="text-xs text-slate-500 italic">Daftar episode tidak tersedia.</p>
              ) : (
                renderEpisodeGrid()
              )}
            </div>
          </div>
        </>
      ) : (
        // ==========================================
        // LAYOUT PORTRAIT (Full Height / Short Drama)
        // ==========================================
        <div className="flex-1 relative w-full h-full bg-black flex flex-col">
          <div className="absolute inset-0 flex items-center justify-center">
            {streamUrl ? (
              <video
                ref={videoRef}
                controls
                autoPlay
                playsInline
                referrerPolicy="no-referrer"
                className="w-full h-full object-contain"
              >
                {subtitleUrl && <track kind="captions" src={subtitleUrl} srcLang="id" label="Indonesia" default />}
              </video>
            ) : (
              <div className="text-center p-4 text-xs text-slate-400">URL video tidak ditemukan.</div>
            )}
          </div>

          {/* Overlay Info Judul di Bawah Video */}
          {!isPortraitMenuOpen && (
            <div className="absolute bottom-6 left-4 right-16 z-30 pointer-events-none drop-shadow-md">
              <h2 className="text-white font-bold text-sm line-clamp-1">{drama.title || drama.name}</h2>
              <p className="text-xs text-slate-300 font-semibold drop-shadow-lg">
                Episode {currentEpisode?.episode || currentEpisode?.index || 1}
              </p>
            </div>
          )}

          {/* Tombol Hamburger Overlay */}
          <button
            onClick={() => setIsPortraitMenuOpen(!isPortraitMenuOpen)}
            className="absolute right-4 bottom-6 z-50 bg-purple-600/90 p-3 rounded-full text-white backdrop-blur shadow-xl border border-purple-400/50 active:scale-95 transition"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Drawer Menu Episode */}
          {isPortraitMenuOpen && (
            <div className="absolute inset-x-0 bottom-0 top-[35%] bg-slate-900/95 backdrop-blur-xl z-40 rounded-t-3xl border-t border-slate-700 flex flex-col overflow-hidden shadow-[0_-10px_40px_rgba(0,0,0,0.5)] animate-in slide-in-from-bottom-full duration-300">
              <div className="flex justify-between items-center p-4 border-b border-slate-800">
                <div>
                  <h3 className="text-sm font-bold text-slate-200">Pilih Episode ({episodes.length})</h3>
                  <p className="text-[10px] text-slate-400">{drama.title || drama.name}</p>
                </div>
                <button onClick={() => setIsPortraitMenuOpen(false)} className="p-2 bg-slate-800 rounded-full text-slate-300 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 pb-24">
                {episodes.length === 0 ? (
                  <p className="text-xs text-slate-500 italic text-center mt-10">Daftar episode tidak tersedia.</p>
                ) : (
                  renderEpisodeGrid()
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
