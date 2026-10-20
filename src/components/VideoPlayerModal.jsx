"use client";

import { useState, useEffect, useRef } from "react";
import { X, Loader2 } from "lucide-react";

export default function VideoPlayerModal({ drama, platform, onClose, onSaveHistory }) {
  const [detail, setDetail] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [currentEpisode, setCurrentEpisode] = useState(null);
  const [streamUrl, setStreamUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [streamLoading, setStreamLoading] = useState(false);

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

  // Helper pencari URL video dari SELURUH kemungkinan nama kunci Hoshiyomi API
  const extractVideoUrl = (obj) => {
    if (!obj) return "";
    if (typeof obj === "string") return obj;

    // Cek array bertingkat (qualities, streams, video_list, urls)
    if (Array.isArray(obj.qualities) && obj.qualities.length > 0) {
      const q = obj.qualities[0];
      return typeof q === "string" ? q : q?.url || q?.video_url || "";
    }
    if (Array.isArray(obj.streams) && obj.streams.length > 0) {
      const s = obj.streams[0];
      return typeof s === "string" ? s : s?.url || s?.video_url || "";
    }
    if (Array.isArray(obj.video_list) && obj.video_list.length > 0) {
      const v = obj.video_list[0];
      return typeof v === "string" ? v : v?.url || v?.video_url || "";
    }
    if (Array.isArray(obj.urls) && obj.urls.length > 0) {
      return typeof obj.urls[0] === "string" ? obj.urls[0] : obj.urls[0]?.url || "";
    }

    // Cek properti langsung
    return (
      obj.video_url ||
      obj.play_url ||
      obj.url ||
      obj.hls_url ||
      obj.stream_url ||
      obj.m3u8 ||
      obj.m3u8_url ||
      obj.link ||
      obj.video ||
      obj.cdn_url ||
      obj.download_url ||
      obj.media_url ||
      obj.main_url ||
      obj.src ||
      ""
    );
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

  // 1. Fetch Metadata & Daftar Episode
  useEffect(() => {
    let isMounted = true;

    async function loadDramaData() {
      if (!primaryId) {
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        // Ambil detail
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

        // Ambil daftar episode
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
            setCurrentEpisode(epsList[0]);
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

  // 2. Fetch URL Stream Setiap Kali Episode Berubah
  useEffect(() => {
    if (!currentEpisode) return;

    let isMounted = true;
    const directUrl = extractVideoUrl(currentEpisode);

    if (directUrl) {
      setStreamUrl(directUrl);
      return;
    }

    // Jika di dalam objek episode tidak ada URL stream langsung, panggil endpoint play/stream
    async function fetchEpisodeStream() {
      setStreamLoading(true);
      setStreamUrl("");

      const epId =
        currentEpisode.episode_id ||
        currentEpisode.id ||
        currentEpisode.chapter_id ||
        currentEpisode.ep_id ||
        "";
      const epNum =
        currentEpisode.episode_number ||
        currentEpisode.index ||
        currentEpisode.episode ||
        1;

      try {
        let res = await fetch(
          `/api/hoshiyomi/${platform}/play?id=${encodeURIComponent(primaryId)}&episode_id=${encodeURIComponent(epId)}&episode=${epNum}`
        );

        if (!res.ok) {
          res = await fetch(
            `/api/hoshiyomi/${platform}/stream?id=${encodeURIComponent(primaryId)}&episode_id=${encodeURIComponent(epId)}&episode=${epNum}`
          );
        }

        if (res.ok) {
          const jsonStream = await res.json();
          const fetchedUrl = extractVideoUrl(jsonStream.data || jsonStream);
          if (isMounted && fetchedUrl) {
            setStreamUrl(fetchedUrl);
          }
        }
      } catch (err) {
        console.error("Error fetching episode stream link:", err);
      } finally {
        if (isMounted) setStreamLoading(false);
      }
    }

    fetchEpisodeStream();

    return () => {
      isMounted = false;
    };
  }, [currentEpisode, primaryId, platform]);

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
        {loading || streamLoading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
            <span className="text-xs text-slate-400">Memuat video episode...</span>
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
              ? "Gagal memuat URL video episode ini dari provider."
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
