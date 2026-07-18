import { usePlayerStore } from '@/stores/usePlayerStore'
import type { ChatAction, MusicTrack } from '@/types/music'
import { getBestTrackUrl, buildWebSearchUrl } from '@/lib/music-source'

/**
 * Dispatch a chat action — opens music in external player or browser.
 * Uses iframe for deep links (avoids popup blocking) and stores URL
 * for user-initiated click for web URLs.
 */
export async function dispatchChatAction(action: ChatAction): Promise<string | null> {
  if (action.type !== 'play_music') return null

  const store = usePlayerStore.getState()

  switch (action.args.action) {
    case 'play': {
      // ── Try to open the found track in external player ──
      if (action.result?.tracks && action.result.tracks.length > 0) {
        const track = action.result.tracks[0]

        // Update "now playing" indicator
        store.setNowPlaying(track)

        // Try to open the track URL
        const url = getBestTrackUrl(track)
        await openExternalUrl(url, track)

        return track.title
      }

      // ── No tracks found — open web search as fallback ──
      if (action.result?.webSearchUrl) {
        const webTrack: MusicTrack = {
          id: `web-${Date.now()}`,
          title: action.args.query || '音乐搜索',
          artist: '网页搜索',
          source: 'web',
          webUrl: action.result.webSearchUrl,
          needVip: false,
          fee: 0,
        }
        store.setNowPlaying(webTrack)
        // For web search URLs, always need user click (no deep link)
        store.setPendingOpenUrl(action.result.webSearchUrl)

        return 'web-search'
      }

      return null
    }

    case 'pause':
    case 'resume':
    case 'next':
    case 'prev':
    case 'stop': {
      // These controls can't be sent to external players from the web
      // Just update the internal state indicator
      if (action.args.action === 'stop') {
        store.clearNowPlaying()
      }
      return action.args.action
    }

    case 'volume_up':
    case 'volume_down': {
      // Volume control is on the external player
      return action.args.action
    }

    default:
      return null
  }
}

/**
 * Open a URL in the system's default handler.
 * Strategy:
 * - Deep links (orpheus://, kugou://, qqmusic://): Use hidden iframe to trigger
 *   the OS protocol handler. This avoids popup blocking because it's not a popup.
 * - Web URLs (https://): Store as pending URL for user-initiated click.
 *   Browser blocks window.open() in async contexts, so we need the user to click.
 * - In Tauri: uses @tauri-apps/plugin-shell (always works)
 */
async function openExternalUrl(url: string, track?: MusicTrack): Promise<void> {
  // Check if running in Tauri environment
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    try {
      const { open } = await import('@tauri-apps/plugin-shell')
      await open(url)
      return
    } catch {
      // Tauri shell plugin not available, fall through to browser methods
    }
  }

  if (typeof window === 'undefined') return

  const isDeepLink = /^(orpheus|kugou|qqmusic):\/\//.test(url)

  if (isDeepLink) {
    // Deep links: use hidden iframe approach
    // This triggers the OS protocol handler without popup blocking
    try {
      const iframe = document.createElement('iframe')
      iframe.style.cssText = 'display:none;width:0;height:0;border:none;position:absolute;'
      iframe.src = url
      document.body.appendChild(iframe)

      // Also set the web URL as fallback for user click
      if (track?.webUrl) {
        const store = usePlayerStore.getState()
        store.setPendingOpenUrl(track.webUrl)
      }

      // Remove iframe after a few seconds
      setTimeout(() => {
        try { document.body.removeChild(iframe) } catch { /* already removed */ }
      }, 5000)
    } catch {
      // Iframe approach failed, store URL for user click
      const store = usePlayerStore.getState()
      store.setPendingOpenUrl(track?.webUrl || url)
    }
  } else {
    // Web URLs: store for user-initiated click
    // window.open() in async context gets blocked by browsers
    const store = usePlayerStore.getState()
    store.setPendingOpenUrl(url)
  }
}
