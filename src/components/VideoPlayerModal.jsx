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
  
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const videoRef = useRef(null);
  const hlsInstanceRef = useRef(null);

  const isLandscape = platform === "iqiyi" || platform === "wetv";

  const primaryId = String(drama?.id || drama?.book_id || drama?.album_id || drama?.cid || "").trim();

  // ALGORITMA 1: DEEP SEARCH URL VIDEO & SUBTITLE
  const extractAllUrls = (obj, urls = []) => {
    if (!obj) return urls;
    if (typeof obj === 'string') {
      if ((obj.startsWith('http') || obj.startsWith('//')) && !obj.match(/\.(jpg|jpeg|png|webp|gif|svg)$/i)) {
        urls.push(obj);
      }
    } else if (Array.isArray(obj)) {
      obj.forEach(item => extractAllUrls(item, urls));
    } else if (typeof obj === 'object') {
      for (const key in obj) {
        if (key.match(/cover|poster|image|thumb|pic|icon|logo/i)) continue;
        extractAllUrls(obj[key], urls);
      }
    }
    return urls;
  };

  const getBestVideoUrl = (obj) => {
    const urls = extractAllUrls(obj);
    if (urls.length === 0) return "";
    const m3u8s = urls.filter(u => u.includes('.m3u8'));
    if (m3u8s.length > 0) return m3u8s[m3u8s.length - 1]; // Ambil stream kualitas terbaik (terakhir)
    const mp4s = urls.filter(u => u.includes('.mp4'));
    if (mp4s.length > 0) return mp4s[mp4s.length - 1];
    const videoUrls = urls.filter(u => !u.match(/\.(vtt|srt|ass)$/i));
    return videoUrls.length > 0 ? videoUrls[videoUrls.length - 1] : "";
  };

  const getSubtitleUrl = (obj) => {
    const urls = extractAllUrls(obj);
    const subs = urls.filter(u => u.match(/\.(vtt|srt|ass)$/i) || u.includes("sub") || u.includes("caption"));
    const idSub = subs.find(u => u.toLowerCase().includes('id') || u.toLowerCase().includes('ind'));
    return idSub || (subs.length > 0 ? subs[0] : "");
  };

  // ALGORITMA 2: DEEP SEARCH ARRAY EPISODE
  const findEpisodeArray = (obj) => {
    if (!obj) return [];
    if (Array.isArray(obj) && obj.length > 0 && typeof obj[0] === 'object') {
       if (obj[0].episode !== undefined || obj[0].title !== undefined || obj[0].index !== undefined || obj[0].url !== undefined) {
         return obj;
       }
    }
    if (typeof obj === 'object') {
      const keys = ["episodes", "chapter_list", "list", "items", "episode_list", "data"];
      for (const k of keys) {
        if (Array.isArray(obj[k]) && obj[k].length > 0) return obj[k];
      }
      for (const k in obj) {
        if (typeof obj[k] === 'object') {
          const res = findEpisodeArray(obj[k]);
          if (res.length > 0) return res;
        }
      }
    }
    return [];
  };

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      if (!primaryId) return;
      setLoading(true);

      try {
        let epsList = [];
        let detailData = null;

        // Tembak 3 Endpoint Sekaligus Secara Berurutan (Abaikan 400 Bad Request)
        const endpointsToTry = [
          `/api/hoshiyomi/${platform}/allepisode?id=${encodeURIComponent(primaryId)}`,
          `/api/hoshiyomi/${platform}/episodes?id=${encodeURIComponent(primaryId)}`,
          `/api/hoshiyomi/${platform}/detail?id=${encodeURIComponent(primaryId)}`
        ];

        for (const url of endpointsToTry) {
          try {
            const res = await fetch(url);
            if (res.ok) {
              const data = await res.json();
              if (url.includes("detail")) detailData = data;
              
              const foundArray = findEpisodeArray(data);
              if (foundArray.length > 0) {
                epsList = foundArray;
                break; // Episode ketemu, hentikan pencarian
              }
            }
          } catch (e) {
            // Lanjut ke endpoint berikutnya jika gagal
          }
        }

        if (isMounted) {
          setDetail(detailData);
          setEpisodes(epsList);
          
          if (epsList.length > 0) {
            const firstEp = epsList[0];
            setCurrentEpisode(firstEp);
            setStreamUrl(getBestVideoUrl(firstEp));
            
            // Proksi Subtitle agar tidak diblokir browser
            const rawSub = getSubtitleUrl(firstEp) || getSubtitleUrl(detailData);
            setSubtitleUrl(rawSub ? `/api/hoshiyomi/proxy-sub?url=${encodeURIComponent(rawSub)}` : "");

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
        console.error("Fetch Error:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();
    return () => { isMounted = false; };
  }, [primaryId, platform]);

  // HLS.js Binding untuk Android/Brave
  useEffect(() => {
    if (!streamUrl || !videoRef.current) return;
    const videoEl = videoRef.current;

    if (hlsInstanceRef.current) {
      hlsInstanceRef.current.destroy();
      hlsInstanceRef.current = null;
    }

    if (streamUrl.includes(".m3u8")) {
      if (videoEl.canPlayType("application/vnd.apple.mpegurl")) {
        videoEl.src = streamUrl;
      } else {
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/hls.js@latest";
        script.onload = () => {
          if (window.Hls && window.Hls.isSupported()) {
            const hls = new window.Hls({ enableWorker: true, lowLatencyMode: true });
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
    setStreamUrl(getBestVideoUrl(ep));
    
    const rawSub = getSubtitleUrl(ep);
    setSubtitleUrl(rawSub ? `/api/hoshiyomi/proxy-sub?url=${encodeURIComponent(rawSub)}` : "");
    
    setIsMenuOpen(false); // Tutup drawer otomatis setelah pilih episode

    onSaveHistory({
      id: primaryId,
      title: drama.title || drama.name,
      cover: drama.cover || drama.poster,
      platform,
      episode: idx + 1
    });
  };

  const renderEpisodeGrid = () => (
    <div className="grid grid-cols-5 gap-2">
      {episodes.map((ep, idx) => (
        <button
          key={idx}
          onClick={() => handleSelectEpisode(ep, idx)}
          className={`py-2 text-xs font-medium rounded-lg border transition ${
            currentEpisode === ep
              ? "bg-purple-600 border-purple-400 text-white font-bold"
              : "bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700"
          }`}
        >
          {idx + 1}
        </button>
      ))}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col max-w-lg mx-auto overflow-hidden">
      
      {/* HEADER FLOATING */}
      <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between z-50 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
        <span className="text-xs font-black text-purple-400 uppercase tracking-widest drop-shadow-md pointer-events-auto">
          {platform}
        </span>
        <button onClick={onClose} className="p-2 bg-black/40 backdrop-blur-md rounded-full text-white pointer-events-auto active:scale-95 transition">
          <X className="w-5 h-5" />
        </button>
      </div>

      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-10 h-10 text-purple-500 animate-spin" />
          <span className="text-xs text-slate-400">Sedang menarik data dari provider...</span>
        </div>
      ) : isLandscape ? (
        // ==========================================
        // LAYOUT LANDSCAPE (iQIYI & WeTV)
        // ==========================================
        <div className="flex flex-col h-full mt-14">
          <div className="w-full aspect-video bg-black flex items-center justify-center relative flex-shrink-0">
            {streamUrl ? (
              <video ref={videoRef} controls autoPlay playsInline referrerPolicy="no-referrer" className="w-full h-full object-contain">
                {subtitleUrl && <track kind="captions" src={subtitleUrl} srcLang="id" label="Indonesia" default />}
              </video>
            ) : (
              <div className="text-center p-4 text-xs text-slate-400">URL video diblokir atau tidak ditemukan.</div>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#0b0c10]">
            <div>
              <h2 className="text-white font-bold text-lg">{drama.title || drama.name}</h2>
              <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                {detail?.description || detail?.intro || "Streaming drama favorit tanpa login di TPLAY."}
              </p>
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">Pilih Episode ({episodes.length})</h3>
              {episodes.length === 0 ? <p className="text-xs text-slate-500 italic">Episode kosong.</p> : renderEpisodeGrid()}
            </div>
          </div>
        </div>
      ) : (
        // ==========================================
        // LAYOUT PORTRAIT FULLSCREEN (Mini Series)
        // ==========================================
        <div className="relative w-full h-full bg-black">
          {streamUrl ? (
            <video ref={videoRef} controls autoPlay playsInline referrerPolicy="no-referrer" className="absolute inset-0 w-full h-full object-contain">
              {subtitleUrl && <track kind="captions" src={subtitleUrl} srcLang="id" label="Indonesia" default />}
            </video>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-400">URL video diblokir atau tidak ditemukan.</div>
          )}

          {/* Info Judul Melayang di Bawah */}
          {!isMenuOpen && (
            <div className="absolute bottom-6 left-4 right-16 z-30 pointer-events-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
              <h2 className="text-white font-bold text-sm line-clamp-1">{drama.title || drama.name}</h2>
              <p className="text-xs text-slate-300 font-semibold mt-0.5">
                Episode {currentEpisode?.episode || currentEpisode?.index || 1}
              </p>
            </div>
          )}

          {/* Tombol Hamburger Episode */}
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="absolute right-4 bottom-6 z-50 bg-purple-600/90 p-3.5 rounded-full text-white backdrop-blur shadow-2xl border border-purple-400/50 active:scale-90 transition"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Drawer Menu Episode (Muncul dari Bawah) */}
          {isMenuOpen && (
            <div className="absolute inset-x-0 bottom-0 h-[60%] bg-[#0b0c10]/95 backdrop-blur-2xl z-40 rounded-t-3xl border-t border-slate-700/50 flex flex-col shadow-[0_-10px_40px_rgba(0,0,0,0.7)] animate-in slide-in-from-bottom duration-300">
              <div className="flex justify-between items-center p-4 border-b border-slate-800">
                <div>
                  <h3 className="text-sm font-bold text-white">Daftar Episode ({episodes.length})</h3>
                  <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">{drama.title || drama.name}</p>
                </div>
                <button onClick={() => setIsMenuOpen(false)} className="p-2 bg-slate-800 rounded-full text-slate-300 hover:text-white active:scale-90 transition">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 pb-12">
                {episodes.length === 0 ? <p className="text-xs text-slate-500 italic text-center mt-10">Episode kosong.</p> : renderEpisodeGrid()}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
