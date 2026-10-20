"use client";

import { useState } from "react";
import { Search, X, Play, Loader2 } from "lucide-react";

export default function SearchBar({ isOpen, onClose, activePlatform, onSelectDrama }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/hoshiyomi/${activePlatform}/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setResults(data.data || data.items || data.results || []);
    } catch (err) {
      console.error("Search error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex flex-col p-4">
      <div className="flex items-center justify-between gap-3 mb-4">
        <form onSubmit={handleSearch} className="flex-1 relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Cari drama di ${activePlatform.toUpperCase()}...`}
            className="w-full bg-slate-900 border border-slate-700 text-white rounded-full py-3 pl-11 pr-4 focus:outline-none focus:border-purple-500 text-sm"
            autoFocus
          />
          <Search className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
        </form>
        <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-full bg-slate-800">
          <X className="w-6 h-6" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3">
        {loading && (
          <div className="flex items-center justify-center py-12 text-purple-400">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        )}

        {!loading && results.length === 0 && query && (
          <div className="text-center py-12 text-slate-400 text-sm">
            Tidak ada drama ditemukan untuk &quot;{query}&quot;
          </div>
        )}

        {results.map((item, idx) => (
          <div
            key={item.id || item.book_id || idx}
            onClick={() => {
              onSelectDrama(item);
              onClose();
            }}
            className="flex items-center gap-3 bg-slate-900/80 p-2.5 rounded-xl border border-slate-800 hover:border-purple-500 cursor-pointer transition"
          >
            <img
              src={item.cover || item.poster || item.image_url || "/placeholder.jpg"}
              alt={item.title || item.name}
              className="w-14 h-20 object-cover rounded-lg bg-slate-800"
            />
            <div className="flex-1 min-w-0">
              <h4 className="text-white text-sm font-semibold truncate">{item.title || item.name}</h4>
              <p className="text-xs text-slate-400 line-clamp-2 mt-1">{item.description || item.intro || "Drama Populer"}</p>
            </div>
            <Play className="w-5 h-5 text-purple-400 mr-2 flex-shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
