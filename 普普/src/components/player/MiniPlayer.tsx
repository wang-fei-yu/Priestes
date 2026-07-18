'use client'

import { useEffect, useRef } from 'react'
import { usePlayerStore } from '@/stores/usePlayerStore'
import { Music, X, Play } from 'lucide-react'
import { getBestTrackUrl } from '@/lib/music-source'

/**
 * MiniPlayer — "Now Playing" indicator for external music.
 * Shows what song was last requested and provides a "play" button
 * that the user clicks to open the music (avoids popup blocking).
 * Updated to match PrTS Mica purple theme (#7c3aed).
 */
export default function MiniPlayer() {
  const { nowPlaying, clearNowPlaying, pendingOpenUrl, setPendingOpenUrl, isNewTrack, clearNewTrackFlag } = usePlayerStore()
  const showPulseRef = useRef(false)

  // Clear the new-track flag when it arrives
  useEffect(() => {
    if (isNewTrack) {
      showPulseRef.current = true
      clearNewTrackFlag()
      const timer = setTimeout(() => { showPulseRef.current = false }, 4000)
      return () => clearTimeout(timer)
    }
  }, [isNewTrack, clearNewTrackFlag])

  if (!nowPlaying) return null

  const handlePlay = () => {
    const url = pendingOpenUrl || getBestTrackUrl(nowPlaying)
    // This is a user-initiated click, so window.open won't be blocked
    window.open(url, '_blank', 'noopener,noreferrer')
    setPendingOpenUrl(null)
  }

  const sourceLabel: Record<string, string> = {
    netease: '网易云',
    kugou: '酷狗',
    qqmusic: 'QQ音乐',
    web: '网页',
  }

  return (
    <div className="relative px-4 py-2 transition-all duration-300"
         style={{
           borderTop: '1px solid rgba(124,58,237,0.08)',
           background: 'rgba(240,232,250,0.50)',
         }}>
      <div className="flex items-center gap-2">
        {/* Music icon */}
        <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center"
             style={{ background: 'rgba(124,58,237,0.10)' }}>
          <Music className="w-3.5 h-3.5" style={{ color: '#7c3aed', opacity: 0.7 }} />
        </div>

        {/* Track info */}
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium text-[#3b1f6e] truncate">
            {nowPlaying.title}
          </p>
          <p className="text-[9px] text-[#9b8ab8] truncate">
            {nowPlaying.artist} · {sourceLabel[nowPlaying.source] || nowPlaying.source}
            {nowPlaying.needVip && (
              <span className="ml-1" style={{ color: '#7c3aed' }}>VIP</span>
            )}
          </p>
        </div>

        {/* Play button — click opens music (user gesture) */}
        <button
          onClick={handlePlay}
          className="h-7 px-2.5 flex items-center gap-1 rounded-full text-[10px] font-medium
                     text-white transition-all duration-200 cursor-pointer active:scale-95"
          style={{
            background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
            boxShadow: '0 2px 8px rgba(124,58,237,0.30)',
          }}
          onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 14px rgba(124,58,237,0.40)' }}
          onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(124,58,237,0.30)' }}
          title="点击播放"
        >
          <Play className="w-3 h-3 fill-current" />
          <span>播放</span>
        </button>

        {/* Close indicator */}
        <button
          onClick={clearNowPlaying}
          className="h-6 w-6 flex items-center justify-center rounded-md
                     text-[#b0a0c0] hover:text-[#7c3aed] transition-all duration-150 active:scale-95"
          style={{ hoverBackground: 'rgba(124,58,237,0.08)' }}
          title="关闭"
        >
          <X className="w-3 h-3" strokeWidth={1.5} />
        </button>
      </div>

      {/* Hint text */}
      <p className="text-[9px] mt-1 text-center" style={{ color: 'rgba(124,58,237,0.45)' }}>
        点击「播放」按钮打开音乐 ♪
      </p>
    </div>
  )
}
