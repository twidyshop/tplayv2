"use client";

import { useState, useEffect } from "react";
import { PLATFORMS } from "@/config/platforms";
import { Search, Clock, Play, Plus, Loader2 } from "lucide-react";
import SearchBar from "@/components/SearchBar";
import WatchHistoryModal from "@/components/WatchHistoryModal";
import VideoPlayerModal from "@/components/VideoPlayerModal";

export default function Home() {
  const [selectedPlatform, setSelectedPlatform] = useState(PLATFORMS[0]);
  const [activeEndpoint, setActiveEndpoint] = useState(PLATFORMS[0].endpoints[0].id);

  const [heroDrama, setHeroDrama] = useState(null);
  const [dramas, setDramas] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals state
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [selectedDramaForPlayer, setSelectedDramaForPlayer] = useState(null);
  const [watchHistory, setWatchHistory] = useState([]);

  // Load history from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("tplay_history");
    if (saved) setWatchHistory(JSON.parse(saved));
  }, []);

  const saveHistory = (item) => {
    const updated = [item, ...watchHistory.filter((h) => h.id !== item.id)].slice(0, 30);
    setWatchHistory(updated);
    localStorage.setItem("tplay_history", JSON.stringify(updated));
  };

  const clearHistory = () => {
    setWatchHistory([]);
    localStorage.removeItem("tplay_history");
  };

  // Switch platform
  const handlePlatformChange = (platform) => {
    setSelectedPlatform(platform);
    setActiveEndpoint(platform.endpoints[0].id);
  };

  // Fetch drama items based on current platform & dynamic endpoint
  useEffect(() => {
    async function fetchContent() {
      setLoading(true);
      try {
        const res = await fetch(`/api/hoshiyomi/${selectedPlatform.id}/${activeEndpoint}`);
        const data = await res.json();
        const list = data.data || data.items || data.results || [];

        setDramas(list);
        if (list.length > 0) {
          setHeroDrama(list[0]);
        }
      } catch (err) {
        console.error("Failed fetching contents:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchContent();
  }, [selectedPlatform, activeEndpoint]);

  return (
    <main className="min-h-screen bg-[#0b0c10] text-slate-100 max-w-lg mx-auto relative pb-20 shadow-2xl">
      {/* 1. HEADER BERSIH TANPA TAGLINE */}
      <header className="sticky top-0 z-40 bg-[#0b0c10]/90 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b border-slate-900/50">
        <h1 className="text-2xl font-black tracking-wider bg-gradient-to-r from-purple-400 via-pink-500 to-red-500 bg-clip-text text-transparent">
          TPLAY
        </h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsSearchOpen(true)}
            className="p-2 text-slate-300 hover:text-white rounded-full bg-slate-900/80 border border-slate-800"
          >
            <Search className="w-5 h-5" />
          </button>
          <button
            onClick={() => setIsHistoryOpen(true)}
            className="p-2 text-slate-300 hover:text-white rounded-full bg-slate-900/80 border border-slate-800 relative"
          >
            <Clock className="w-5 h-5" />
            {watchHistory.length > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-purple-500" />
            )}
          </button>
        </div>
      </header>

      {/* 2. HERO BANNER */}
      <section className="px-4 pt-3 pb-4">
        {heroDrama ? (
          <div className="relative w-full aspect-[16/10] rounded-2xl overflow-hidden border border-slate-800/80 shadow-2xl bg-slate-900">
            <img
              src={heroDrama.cover || heroDrama.poster || "/placeholder.jpg"}
              alt={heroDrama.title || heroDrama.name}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0b0c10] via-[#0b0c10]/40 to-transparent flex flex-col justify-end p-4">
              <span className="text-[10px] font-bold text-purple-400 uppercase tracking-widest mb-1">
                {selectedPlatform.name} • Featured
              </span>
              <h2 className="text-white font-black text-lg line-clamp-1">
                {heroDrama.title || heroDrama.name}
              </h2>
              <p className="text-xs text-slate-300 line-clamp-2 mt-1 mb-3">
                {heroDrama.description || heroDrama.intro || "Streaming drama favorit gratis di TPLAY."}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedDramaForPlayer(heroDrama)}
                  className="flex-1 bg-white text-black font-bold py-2 rounded-xl flex items-center justify-center gap-1.5 text-xs hover:bg-slate-200 transition"
                >
                  <Play className="w-4 h-4 fill-black" /> Mulai Nonton
                </button>
                <button className="p-2 bg-slate-900/80 backdrop-blur-md text-white rounded-xl border border-slate-700">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="w-full aspect-[16/10] bg-slate-900/50 rounded-2xl animate-pulse flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-purple-500 animate-spin" />
          </div>
        )}
      </section>

      {/* 3. PLATFORM SELECTOR (1 BARIS HORIZONTAL KESAMPING) */}
      <section className="px-4 py-2">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Platform</span>
          <span className="text-[10px] text-slate-500">Geser &gt;</span>
        </div>

        {/* Single Horizontal Row Scroll */}
        <div className="flex items-center gap-3 overflow-x-auto no-scrollbar py-1">
          {PLATFORMS.map((platform) => {
            const isSelected = selectedPlatform.id === platform.id;
            return (
              <button
                key={platform.id}
                onClick={() => handlePlatformChange(platform)}
                className={`flex-shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-full border transition-all ${
                  isSelected
                    ? "bg-purple-600/20 border-purple-500 text-white shadow-lg shadow-purple-500/10 scale-105"
                    : "bg-slate-900/80 border-slate-800 text-slate-400 hover:border-slate-700"
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-gradient-to-tr ${platform.iconColor} flex items-center justify-center text-[9px] font-black text-white`}
                >
                  {platform.name.charAt(0)}
                </div>
                <span className="text-xs font-semibold whitespace-nowrap">{platform.name}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 4. SUB-MENU DINAMIS SESUAI ENDPOINTS PLATFORM DARI DOKUMENTASI HOSHIYOMI */}
      <section className="px-4 pt-3 pb-2">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar border-b border-slate-900 pb-2">
          {selectedPlatform.endpoints.map((ep) => {
            const isActive = activeEndpoint === ep.id;
            return (
              <button
                key={ep.id}
                onClick={() => setActiveEndpoint(ep.id)}
                className={`text-xs font-medium px-3 py-1.5 rounded-lg whitespace-nowrap transition ${
                  isActive
                    ? "bg-slate-800 text-purple-400 font-bold border border-purple-500/30"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {ep.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* 5. GRID CONTENT DRAMA */}
      <section className="px-4 py-3">
        {loading ? (
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="aspect-[3/4] bg-slate-900 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {dramas.map((drama, idx) => (
              <div
                key={drama.id || drama.book_id || idx}
                onClick={() => setSelectedDramaForPlayer(drama)}
                className="group relative cursor-pointer flex flex-col"
              >
                <div className="w-full aspect-[3/4] rounded-xl overflow-hidden bg-slate-900 border border-slate-800/80 relative">
                  <img
                    src={drama.cover || drama.poster || "/placeholder.jpg"}
                    alt={drama.title || drama.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                  />
                  <span className="absolute top-1.5 right-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-md text-purple-300 uppercase">
                    {selectedPlatform.name}
                  </span>
                </div>
                <h3 className="text-xs font-semibold text-slate-200 truncate mt-1.5">
                  {drama.title || drama.name}
                </h3>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* MODALS */}
      <SearchBar
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        activePlatform={selectedPlatform.id}
        onSelectDrama={(item) => setSelectedDramaForPlayer(item)}
      />

      <WatchHistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        history={watchHistory}
        onSelectDrama={(item) => setSelectedDramaForPlayer(item)}
        onClearHistory={clearHistory}
      />

      {selectedDramaForPlayer && (
        <VideoPlayerModal
          drama={selectedDramaForPlayer}
          platform={selectedPlatform.id}
          onClose={() => setSelectedDramaForPlayer(null)}
          onSaveHistory={saveHistory}
        />
      )}
    </main>
  );
}
