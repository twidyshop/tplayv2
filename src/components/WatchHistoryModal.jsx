"use client";

import { X, Play, Trash2, Clock } from "lucide-react";

export default function WatchHistoryModal({ isOpen, onClose, history, onSelectDrama, onClearHistory }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex flex-col p-4">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-purple-400" />
          <h3 className="text-white font-bold text-lg">Riwayat Tonton</h3>
        </div>
        <div className="flex items-center gap-2">
          {history.length > 0 && (
            <button
              onClick={onClearHistory}
              className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 bg-red-950/40 px-3 py-1.5 rounded-lg border border-red-900/50"
            >
              <Trash2 className="w-3.5 h-3.5" /> Hapus
            </button>
          )}
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-full bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3">
        {history.length === 0 ? (
          <div className="text-center py-20 text-slate-500 text-sm">
            Belum ada drama yang Anda tonton.
          </div>
        ) : (
          history.map((item, idx) => (
            <div
              key={idx}
              onClick={() => {
                onSelectDrama(item);
                onClose();
              }}
              className="flex items-center gap-3 bg-slate-900/90 p-2.5 rounded-xl border border-slate-800 hover:border-purple-500 cursor-pointer transition"
            >
              <img
                src={item.cover || item.poster || "/placeholder.jpg"}
                alt={item.title}
                className="w-14 h-20 object-cover rounded-lg bg-slate-800"
              />
              <div className="flex-1 min-w-0">
                <span className="text-[10px] font-bold tracking-wider text-purple-400 uppercase">
                  {item.platform}
                </span>
                <h4 className="text-white text-sm font-semibold truncate">{item.title}</h4>
                <p className="text-xs text-slate-400 mt-1">Episode {item.episode || 1}</p>
              </div>
              <Play className="w-5 h-5 text-purple-400 mr-2 flex-shrink-0" />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
