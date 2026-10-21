"use client";

import { useState, useEffect, useRef } from "react";
import { X, Loader2, Menu, Captions } from "lucide-react";

export default function VideoPlayerModal({ drama, platform, onClose, onSaveHistory }) {
  const [detail, setDetail] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [currentEpisode, setCurrentEpisode] = useState(null);
  const [streamUrl, setStreamUrl] = useState("");
  const [subtitleUrl, setSubtitleUrl] = useState("");
  
  const [loading, setLoading] = useState(true);
  const [streamLoading, setStreamLoading] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [captionMenuOpen, setCaptionMenuOpen] = useState(false);
  const [captionsEnabled, setCaptionsEnabled] = useState(true);

  const videoRef = useRef(null);
  const hlsInstanceRef = useRef(null);
  const requestSeqRef = useRef(0);

  const isLandscape = platform === "iqiyi" || platform === "wetv";

  // Ambil semua kemungkinan ID agar endpoint play tidak 400 Bad Request
  const primaryId = drama?.id || drama?.book_id || drama?.cid || drama?.album_id || "";
  const vid = drama?.vid || "";

  // 1. Ekstraktor Video: Selalu cari kualitas tertinggi (1080p / array terakhir)
  const extractBestVideo = (obj) => {
    if (!obj) return "";
    let urls = [];

    const findUrls = (node) => {
      if (typeof node === 'string' && (node.startsWith('http') || node.startsWith('//')) && !node.match(/\.(jpg|png|webp|vtt|srt|ass)$/i)) {
        urls.push(node);
      } else if (Array.isArray(node)) {
        node.forEach(findUrls);
      } else if (typeof node === 'object' && node !== null) {
        for (const k in node) {
          if (!k.match(/cover|poster|image|thumb/i)) findUrls(node[k]);
        }
      }
    };
    findUrls(obj);

    if (urls.length === 0) return "";
    const mediaUrls = urls.filter(u => /\.(m3u8|mp4)(?:[?#]|$)|\/api\/stream\?/i.test(u));
    const m3u8s = mediaUrls.filter(u => /\.m3u8(?:[?#]|$)/i.test(u));
    if (m3u8s.length > 0) return m3u8s[0];
    const mp4s = mediaUrls.filter(u => /\.mp4(?:[?#]|$)/i.test(u));
    if (mp4s.length > 0) return mp4s[0];
    return "";
  };

  // 2. Ekstraktor Subtitle: Paksa cari yang mengandung 'id' atau 'ind'
  const extractSubtitle = (obj) => {
    if (!obj) return "";
    let subs = [];
    
    const findSubs = (node) => {
      if (typeof node === 'string' && /^https:\/\//i.test(node) && /\.(vtt|srt|ass)(?:[?#]|$)/i.test(node)) {
        subs.push(node);
      } else if (Array.isArray(node)) {
        node.forEach(findSubs);
      } else if (typeof node === 'object' && node !== null) {
        for (const k in node) {
          if (k.match(/subtitle|caption|sub/i) && typeof node[k] === 'string' && /^https:\/\//i.test(node[k])) subs.push(node[k]);
          findSubs(node[k]);
        }
      }
    };
    findSubs(obj);

    const indoSub = subs.find(u => u.toLowerCase().includes('id') || u.toLowerCase().includes('ind'));
    return indoSub || (subs.length > 0 ? subs[0] : "");
  };

  // 3. Ekstraktor List Episode
  const extractEpisodes = (data) => {
    if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object') return data;
    const keys = ["episodes", "chapter_list", "list", "items", "episode_list", "data"];
    for (const k of keys) {
      if (data && Array.isArray(data[k]) && data[k].length > 0) return data[k];
    }
    return [];
  };

  // INIT: Load Metadata & Episodes
  useEffect(() => {
    const controller = new AbortController();
    let isMounted = true;
    // Reset every piece of player state when the selected drama/source changes.
    requestSeqRef.current += 1;
    setLoading(true);
    setDetail(null);
    setEpisodes([]);
    setCurrentEpisode(null);
    setStreamUrl("");
    setSubtitleUrl("");

    async function initData() {
      try {
        let epsList = [];
        let detailData = null;
        const base = `/api/hoshiyomi/${platform}`;
        const params = new URLSearchParams();
        if (primaryId) params.set("id", primaryId);
        if (vid) params.set("vid", vid);
        params.set("lang", "id");

        const resDetail = await fetch(`${base}/detail?${params}`, { signal: controller.signal, cache: "no-store" });
        if (resDetail.ok) {
          detailData = await resDetail.json();
          epsList = extractEpisodes(detailData);
        }

        if (epsList.length === 0) {
          // Hoshiyomi's main API calls this endpoint "allepisode"; keep
          // the "episodes" alias as a compatibility fallback for providers.
          for (const endpoint of ["allepisode", "episodes"]) {
            const resEps = await fetch(`${base}/${endpoint}?${params}`, { signal: controller.signal, cache: "no-store" });
            if (resEps.ok) {
              epsList = extractEpisodes(await resEps.json());
              if (epsList.length) break;
            }
          }
        }

        if (!isMounted) return;
        setDetail(detailData);
        setEpisodes(epsList);
        if (epsList.length > 0) handleSelectEpisode(epsList[0], 0, detailData);
      } catch (err) {
        if (err.name !== "AbortError") console.error("Init Error:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    if (primaryId) initData();
    else setLoading(false);
    return () => {
      isMounted = false;
      controller.abort();
      requestSeqRef.current += 1;
    };
  }, [primaryId, platform, vid]);

  // ON-DEMAND PLAY: Tembak video per episode
  const handleSelectEpisode = async (ep, idx, fallbackDetail = detail) => {
    const requestSeq = ++requestSeqRef.current;
    setCurrentEpisode(ep);
    setIsMenuOpen(false);
    setStreamLoading(true);
    setStreamUrl("");
    setSubtitleUrl("");

    onSaveHistory({
      id: primaryId,
      title: drama.title || drama.name,
      cover: drama.cover || drama.poster,
      platform,
      episode: idx + 1
    });

    let bestUrl = extractBestVideo(ep);
    let bestSub = extractSubtitle(ep) || extractSubtitle(fallbackDetail);

    // Jika video belum ada di dalam object episode (iQIYI, DramaBox, Freereels), request ke /play
    if (!bestUrl) {
      const epId = ep.id || ep.episode_id || ep.chapter_id || primaryId;
      const epNum = ep.episode || ep.index || ep.order || (idx + 1);
      
      try {
        // Tembak endpoint play dengan query super lengkap agar tidak di-400 oleh Hoshiyomi
        const resPlay = await fetch(`/api/hoshiyomi/${platform}/play?id=${primaryId}&vid=${vid}&episode_id=${epId}&episode=${epNum}`);
        if (resPlay.ok) {
          const playData = await resPlay.json();
          bestUrl = extractBestVideo(playData);
          const foundSub = extractSubtitle(playData);
          if (foundSub) bestSub = foundSub;
        }
      } catch (e) {
        console.error("Legacy play endpoint error:", e);
      }
    }

    // Normalized V2 episodes include their actual media URL. Try this when
    // legacy /play does not return a playable MP4/HLS URL.
    if (!bestUrl) {
      try {
        const v2Url = "/api/hoshiyomi/v2/dramas/" + encodeURIComponent(platform) + "/" + encodeURIComponent(primaryId) + "/episodes?lang=id";
        const v2Res = await fetch(v2Url, { cache: "no-store" });
        if (v2Res.ok) {
          const v2Data = await v2Res.json();
          const v2Episodes = extractEpisodes(v2Data);
          const wantedNum = Number(ep.episode || ep.index || ep.order || idx + 1);
          const matched = v2Episodes.find((item, i) => Number(item.episode || item.episode_number || item.index || i + 1) === wantedNum) || v2Episodes[idx];
          if (matched) {
            bestUrl = extractBestVideo(matched);
            const v2Sub = extractSubtitle(matched);
            if (v2Sub) bestSub = v2Sub;
          }
        }
      } catch (e) {
        console.error("V2 episode fallback error:", e);
      }
    }

    // Ignore late responses from a previous episode selection.
    if (requestSeq !== requestSeqRef.current) return;
    setStreamUrl(bestUrl);
    // Proxy Subtitle agar CC Muncul & Tidak kena CORS
    setSubtitleUrl(bestSub ? `/api/hoshiyomi/proxy-sub?url=${encodeURIComponent(bestSub)}` : "");
    setCaptionsEnabled(Boolean(bestSub));
    setStreamLoading(false);
  };

  // Apply the custom CC toggle to the browser text track.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !video.textTracks) return;
    for (let i = 0; i < video.textTracks.length; i++) {
      video.textTracks[i].mode = subtitleUrl && captionsEnabled ? "showing" : "disabled";
    }
  }, [subtitleUrl, captionsEnabled, streamUrl]);

  // HLS Player Binding
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!streamUrl || !videoEl) return;
    let cancelled = false;

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
          if (cancelled) return;
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
    return () => {
      cancelled = true;
      if (hlsInstanceRef.current) {
        hlsInstanceRef.current.destroy();
        hlsInstanceRef.current = null;
      }
      videoEl.pause();
      videoEl.removeAttribute("src");
      videoEl.load();
    };
  }, [streamUrl]);

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
    <div className="fixed inset-x-0 top-[56px] bottom-0 z-[40] bg-black flex flex-col max-w-lg mx-auto overflow-hidden">
      {/* Tombol Close Transparan */}
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
        // LAYOUT LANDSCAPE (iQIYI & WeTV)
        <div className="flex flex-col h-full mt-14">
          <div className="w-full aspect-video bg-black flex items-center justify-center relative flex-shrink-0">
            {streamLoading ? (
              <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
            ) : streamUrl ? (
              // PERHATIKAN: Tidak ada crossOrigin di sini karena track dipanggil via Proxy satu domain
              <video ref={videoRef} controls autoPlay playsInline referrerPolicy="no-referrer" className="w-full h-full object-contain">
                {subtitleUrl && <track kind="captions" src={subtitleUrl} srcLang="id" label="Indonesia" default />}
              </video>
            ) : (
              <div className="text-center p-4 text-xs text-slate-400">URL video diblokir atau tidak ditemukan.</div>
            )}
            <div className="absolute bottom-3 right-3 z-30">
              <button onClick={() => setCaptionMenuOpen(!captionMenuOpen)} className="flex items-center gap-1 rounded-lg bg-black/75 border border-white/20 px-3 py-2 text-xs font-semibold text-white">
                <Captions className="w-4 h-4" /> CC
              </button>
              {captionMenuOpen && <div className="absolute bottom-11 right-0 min-w-44 rounded-xl border border-slate-700 bg-slate-950 p-2 text-xs text-white shadow-xl">
                <button onClick={() => { setCaptionsEnabled(false); setCaptionMenuOpen(false); }} className="block w-full rounded px-3 py-2 text-left hover:bg-slate-800">Nonaktif</button>
                <button disabled={!subtitleUrl} onClick={() => { setCaptionsEnabled(true); setCaptionMenuOpen(false); }} className="block w-full rounded px-3 py-2 text-left hover:bg-slate-800 disabled:opacity-40">Indonesia {!subtitleUrl ? "(tidak tersedia)" : ""}</button>
              </div>}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#0b0c10]">
            <div>
              <h2 className="text-white font-bold text-lg">{drama.title || drama.name}</h2>
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">Pilih Episode ({episodes.length})</h3>
              {episodes.length === 0 ? <p className="text-xs text-slate-500 italic">Episode kosong.</p> : renderEpisodeGrid()}
            </div>
          </div>
        </div>
      ) : (
        // LAYOUT PORTRAIT FULLSCREEN LELUASA (Mini Series)
        <div className="relative w-full h-full bg-black">
          {streamLoading ? (
             <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="w-8 h-8 text-purple-500 animate-spin" /></div>
          ) : streamUrl ? (
            <video ref={videoRef} controls autoPlay playsInline referrerPolicy="no-referrer" className="absolute inset-0 w-full h-full object-contain">
              {subtitleUrl && <track kind="captions" src={subtitleUrl} srcLang="id" label="Indonesia" default />}
            </video>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-400">URL video diblokir atau tidak ditemukan.</div>
          )}

          <div className="absolute top-16 right-4 z-30">
            <button onClick={() => setCaptionMenuOpen(!captionMenuOpen)} className="flex items-center gap-1 rounded-lg bg-black/75 border border-white/20 px-3 py-2 text-xs font-semibold text-white">
              <Captions className="w-4 h-4" /> CC
            </button>
            {captionMenuOpen && <div className="absolute top-11 right-0 min-w-44 rounded-xl border border-slate-700 bg-slate-950 p-2 text-xs text-white shadow-xl">
              <button onClick={() => { setCaptionsEnabled(false); setCaptionMenuOpen(false); }} className="block w-full rounded px-3 py-2 text-left hover:bg-slate-800">Nonaktif</button>
              <button disabled={!subtitleUrl} onClick={() => { setCaptionsEnabled(true); setCaptionMenuOpen(false); }} className="block w-full rounded px-3 py-2 text-left hover:bg-slate-800 disabled:opacity-40">Indonesia {!subtitleUrl ? "(tidak tersedia)" : ""}</button>
            </div>}
          </div>

          {/* Info Judul Melayang di Bawah Kiri */}
          {!isMenuOpen && (
            <div className="absolute bottom-6 left-4 right-20 z-30 pointer-events-none drop-shadow-md">
              <h2 className="text-white font-bold text-sm line-clamp-1">{drama.title || drama.name}</h2>
              <p className="text-xs text-slate-300 font-semibold mt-0.5">
                Episode {currentEpisode?.episode || currentEpisode?.index || 1}
              </p>
            </div>
          )}

          {/* Tombol Hamburger Kanan Bawah */}
          <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="absolute right-4 bottom-6 z-50 bg-purple-600/90 p-3.5 rounded-full text-white backdrop-blur shadow-2xl border border-purple-400/50 active:scale-90 transition">
            <Menu className="w-5 h-5" />
          </button>

          {/* Drawer Episode Naik dari Bawah */}
          {isMenuOpen && (
            <div className="absolute inset-x-0 bottom-0 h-[60%] bg-[#0b0c10]/95 backdrop-blur-2xl z-40 rounded-t-3xl border-t border-slate-700/50 flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-300">
              <div className="flex justify-between items-center p-4 border-b border-slate-800">
                <div>
                  <h3 className="text-sm font-bold text-white">Daftar Episode</h3>
                </div>
                <button onClick={() => setIsMenuOpen(false)} className="p-2 bg-slate-800 rounded-full text-slate-300 hover:text-white transition">
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
