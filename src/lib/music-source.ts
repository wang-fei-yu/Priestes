import type { MusicTrack, MusicSourceName } from '@/types/music'

// ─── Music Source Interface ───
export interface MusicSource {
  name: MusicSourceName
  label: string  // display name
  search(query: string, limit?: number): Promise<MusicTrack[]>
}

// ─── NetEase Cloud Music Source ───
// Uses NeteaseCloudMusicApi (self-hosted or third-party) for search + VIP detection
export class NeteaseMusicSource implements MusicSource {
  name: MusicSourceName = 'netease'
  label = '网易云音乐'
  private baseUrl: string

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ||
      (typeof process !== 'undefined' ? process.env.NETEASE_API_URL || '' : '')
  }

  async search(query: string, limit = 10): Promise<MusicTrack[]> {
    if (!this.baseUrl) return []
    try {
      // Search for songs
      const searchRes = await fetch(
        `${this.baseUrl}/search?keywords=${encodeURIComponent(query)}&limit=${limit}`,
        { next: { revalidate: 60 } }
      )
      const searchData = await searchRes.json()
      const songs = searchData.result?.songs || []
      if (songs.length === 0) return []

      // Get song details including fee/VIP info
      const songIds = songs.map((s: Record<string, unknown>) => s.id).join(',')
      let feeMap: Record<string, number> = {}
      try {
        const detailRes = await fetch(
          `${this.baseUrl}/song/detail?ids=${songIds}`,
          { next: { revalidate: 60 } }
        )
        const detailData = await detailRes.json()
        const detailSongs = detailData.songs || []
        feeMap = detailSongs.reduce((acc: Record<string, number>, s: Record<string, unknown>) => {
          acc[String(s.id)] = (s.fee as number) || 0
          return acc
        }, {})
      } catch {
        // If detail fetch fails, proceed without fee info
      }

      return songs.map((song: Record<string, unknown>) => {
        const songId = song.id as number
        const fee = feeMap[songId] || 0
        return {
          id: `netease-${songId}`,
          title: (song.name as string) || '未知',
          artist: ((song.artists as Record<string, string>[])?.map(a => a.name).join('/')) || '未知',
          album: (song.album as Record<string, string>)?.name,
          coverUrl: (song.album as Record<string, { picUrl?: string }>)?.picUrl,
          duration: song.duration as number,
          source: 'netease' as const,
          deepLink: `orpheus://song/play?id=${songId}`,
          webUrl: `https://music.163.com/#/song?id=${songId}`,
          needVip: fee === 1,
          fee,
        }
      })
    } catch (err) {
      console.error('[NeteaseMusicSource] search error:', err)
      return []
    }
  }
}

// ─── Kugou Music Source ───
// Uses Kugou's public search API (no API key needed for basic search)
export class KugouMusicSource implements MusicSource {
  name: MusicSourceName = 'kugou'
  label = '酷狗音乐'

  async search(query: string, limit = 10): Promise<MusicTrack[]> {
    try {
      const searchRes = await fetch(
        `https://mobileservice.kugou.com/api/v3/search/song?keyword=${encodeURIComponent(query)}&pagesize=${limit}&page=1`,
        { next: { revalidate: 60 } }
      )
      const data = await searchRes.json()
      const songs = data.data?.info || []
      return songs.map((song: Record<string, unknown>) => {
        const hash = song.hash as string
        const songId = song.songid as number
        return {
          id: `kugou-${songId}`,
          title: (song.songname as string) || '未知',
          artist: (song.singername as string) || '未知',
          album: song.album_name as string | undefined,
          duration: (song.duration as number) || undefined,
          source: 'kugou' as const,
          deepLink: `kugou://song/play?hash=${hash}`,
          webUrl: `https://www.kugou.com/song/#hash=${hash}`,
          needVip: song.privilege === 1, // 1 = VIP only
          fee: song.privilege as number,
        }
      })
    } catch (err) {
      console.error('[KugouMusicSource] search error:', err)
      return []
    }
  }
}

// ─── QQ Music Source ───
// Uses QQ Music's public search for basic results
export class QQMusicSource implements MusicSource {
  name: MusicSourceName = 'qqmusic'
  label = 'QQ音乐'

  async search(query: string, limit = 10): Promise<MusicTrack[]> {
    try {
      // QQ Music search API (public, no auth needed)
      const searchRes = await fetch(
        `https://c.y.qq.com/soso/fcgi-bin/client_search_cp?w=${encodeURIComponent(query)}&n=${limit}&format=json`,
        { next: { revalidate: 60 } }
      )
      const data = await searchRes.json()
      const songs = data.data?.song?.list || []
      return songs.map((song: Record<string, unknown>) => {
        const songMid = song.songmid as string
        const songId = song.songid as number
        return {
          id: `qqmusic-${songId}`,
          title: (song.songname as string) || '未知',
          artist: ((song.singer as Record<string, string>[])?.map(s => s.name).join('/')) || '未知',
          album: (song.albumname as string) || undefined,
          duration: (song.interval as number) ? (song.interval as number) * 1000 : undefined,
          source: 'qqmusic' as const,
          deepLink: `qqmusic://qq.com/ui/songDetail?songid=${songId}&songmid=${songMid}`,
          webUrl: `https://y.qq.com/n/ryqq/songDetail/${songMid}`,
          needVip: (song.pay as Record<string, number>)?.payplay === 1,
          fee: (song.pay as Record<string, number>)?.payplay,
        }
      })
    } catch (err) {
      console.error('[QQMusicSource] search error:', err)
      return []
    }
  }
}

// ─── Web Music Source (fallback) ───
// Constructs search URLs for free music websites — no API needed
export class WebMusicSource implements MusicSource {
  name: MusicSourceName = 'web'
  label = '网页音乐'

  async search(query: string, _limit = 5): Promise<MusicTrack[]> {
    // This source doesn't search — it creates direct web search URLs
    // for the user to find and play music on free websites
    const encodedQuery = encodeURIComponent(query)
    return [{
      id: `web-search-${Date.now()}`,
      title: `搜索: ${query}`,
      artist: '网页搜索',
      source: 'web' as const,
      webUrl: `https://music.163.com/#/search/m/?s=${encodedQuery}`,
      deepLink: undefined,
      needVip: false,
      fee: 0,
    }]
  }
}

// ─── Music Source Manager ───
export class MusicSourceManager {
  private sources: MusicSource[] = []

  register(source: MusicSource) {
    this.sources.push(source)
  }

  getSource(name: MusicSourceName): MusicSource | undefined {
    return this.sources.find(s => s.name === name)
  }

  get allSources(): MusicSource[] {
    return this.sources
  }

  /** Search from a specific source */
  async searchFrom(sourceName: MusicSourceName, query: string, limit = 10): Promise<MusicTrack[]> {
    const source = this.getSource(sourceName)
    if (source) return source.search(query, limit)
    return []
  }

  /** Search all sources and merge results */
  async searchAll(query: string, limit = 10): Promise<MusicTrack[]> {
    const results = await Promise.allSettled(
      this.sources.map(s => s.search(query, limit))
    )
    return results
      .filter((r): r is PromiseFulfilledResult<MusicTrack[]> => r.status === 'fulfilled')
      .flatMap(r => r.value)
      .slice(0, limit)
  }

  /** Smart search: try specified source first, then fallback to all */
  async search(query: string, preferredSource?: MusicSourceName, limit = 10): Promise<MusicTrack[]> {
    // If user specified a preferred source, try that first
    if (preferredSource) {
      const sourceResults = await this.searchFrom(preferredSource, query, limit)
      if (sourceResults.length > 0) return sourceResults
    }

    // Fallback: search all sources
    return this.searchAll(query, limit)
  }
}

// ─── Singleton ───
let _manager: MusicSourceManager | null = null

export function getMusicSourceManager(): MusicSourceManager {
  if (!_manager) {
    _manager = new MusicSourceManager()

    // Register NetEase source (if API URL is configured)
    const neteaseUrl = typeof process !== 'undefined' ? process.env.NETEASE_API_URL || '' : ''
    _manager.register(new NeteaseMusicSource(neteaseUrl || undefined))

    // Register Kugou source (always available, public API)
    _manager.register(new KugouMusicSource())

    // Register QQ Music source (always available, public API)
    _manager.register(new QQMusicSource())

    // Register Web fallback (always available)
    _manager.register(new WebMusicSource())
  }
  return _manager
}

// ─── URL Construction Helpers ───
/** Build a search URL for a free music website */
export function buildWebSearchUrl(query: string, platform: MusicSourceName = 'netease'): string {
  const encoded = encodeURIComponent(query)
  switch (platform) {
    case 'netease':
      return `https://music.163.com/#/search/m/?s=${encoded}`
    case 'kugou':
      return `https://www.kugou.com/yy/html/search.html#searchType=song&searchKeyWord=${encoded}`
    case 'qqmusic':
      return `https://y.qq.com/n/ryqq/search?w=${encoded}&t=song`
    default:
      return `https://music.163.com/#/search/m/?s=${encoded}`
  }
}

/** Determine the best URL to open for a track */
export function getBestTrackUrl(track: MusicTrack): string {
  // Prefer deep link (opens in desktop player if installed)
  // Fallback to web URL
  return track.deepLink || track.webUrl || buildWebSearchUrl(`${track.title} ${track.artist}`, track.source)
}
