// ─── External Music Types ───
// No internal audio playback — all music is launched via external players or websites

export type MusicSourceName = 'netease' | 'kugou' | 'qqmusic' | 'web'

export interface MusicTrack {
  id: string
  title: string
  artist: string
  album?: string
  coverUrl?: string
  duration?: number
  source: MusicSourceName
  /** Deep link to open in desktop player, e.g. orpheus://song/play?id=123 */
  deepLink?: string
  /** Web URL for browser playback, e.g. https://music.163.com/#/song?id=123 */
  webUrl?: string
  /** Whether this track requires VIP/paid subscription */
  needVip?: boolean
  /** Fee type: 0=free, 1=VIP, 4=paid album, 8=free low-quality only */
  fee?: number
}

export type PlayAction = 'play' | 'pause' | 'resume' | 'next' | 'prev' | 'stop' | 'volume_up' | 'volume_down'

export interface ChatAction {
  type: 'play_music'
  args: {
    query?: string
    action?: PlayAction
    source?: MusicSourceName
  }
  result: Record<string, unknown>
}
