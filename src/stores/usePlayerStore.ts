import { create } from 'zustand'
import type { MusicTrack } from '@/types/music'

/**
 * Simplified Player Store — "Now Playing" indicator only.
 * Actual music playback is handled by external players (NetEase, Kugou, etc.)
 * or browser tabs. This store just tracks what was last requested.
 */
interface PlayerState {
  /** The track currently indicated as "playing" (actually playing externally) */
  nowPlaying: MusicTrack | null
  /** Whether the external player was recently launched */
  isActive: boolean
  /** URL that needs user click to open (to avoid popup blocking) */
  pendingOpenUrl: string | null
  /** Whether the pending URL was just set (for animation) */
  isNewTrack: boolean

  // Actions
  setNowPlaying: (track: MusicTrack) => void
  clearNowPlaying: () => void
  setActive: (active: boolean) => void
  setPendingOpenUrl: (url: string | null) => void
  clearNewTrackFlag: () => void
}

export const usePlayerStore = create<PlayerState>((set) => ({
  nowPlaying: null,
  isActive: false,
  pendingOpenUrl: null,
  isNewTrack: false,

  setNowPlaying: (track) => set({ nowPlaying: track, isActive: true, isNewTrack: true }),
  clearNowPlaying: () => set({ nowPlaying: null, isActive: false, pendingOpenUrl: null, isNewTrack: false }),
  setActive: (active) => set({ isActive: active }),
  setPendingOpenUrl: (url) => set({ pendingOpenUrl: url }),
  clearNewTrackFlag: () => set({ isNewTrack: false }),
}))
