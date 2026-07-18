'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, X, Trash2 } from 'lucide-react'
import { usePlayerStore } from '@/stores/usePlayerStore'
import { dispatchChatAction } from '@/lib/action-dispatcher'
import { getBestTrackUrl } from '@/lib/music-source'
import MiniPlayer from '@/components/player/MiniPlayer'
import PetSprite from '@/components/pet/PetSprite'
import IdleBubble from '@/components/pet/IdleBubble'
import EmotionBubble from '@/components/pet/EmotionBubble'
import type { PetEmotion } from '@/components/pet/types'
import { EMOTIONS, CLICK_REACTIONS } from '@/components/pet/types'
import type { ChatAction } from '@/types/music'

// Tauri window API is imported dynamically inside effects when needed

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string | Date
}

// Detect Tauri environment
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

// In Tauri production (static files), API runs on localhost:3001
// In Tauri dev mode & browser, API is on the same origin (localhost:3000)
function getApiBase(): string {
  if (typeof window === 'undefined') return ''
  if (!isTauri()) return '' // browser mode
  // CRITICAL: Tauri v2 on Windows production uses http://tauri.localhost/
  // Both dev and prod have protocol === 'http:', so we MUST check hostname instead.
  // Dev mode: hostname === 'localhost' → API on same origin (Next.js dev server)
  // Production: hostname === 'tauri.localhost' → API at http://localhost:3001
  const host = window.location.hostname
  if (host === 'tauri.localhost') return 'http://localhost:3001'
  // macOS uses ipc://localhost, other platforms might use tauri: protocol
  if (window.location.protocol === 'ipc:' || window.location.protocol === 'tauri:') return 'http://localhost:3001'
  return '' // dev mode: same origin
}
const API_BASE = getApiBase()
console.log('[Priestes] API_BASE =', API_BASE, '| hostname =', typeof window !== 'undefined' ? window.location.hostname : 'SSR', '| protocol =', typeof window !== 'undefined' ? window.location.protocol : 'SSR')

const IDLE_MSGS = ['哼', '博士……']

function getSessionId(): string {
  if (typeof window === 'undefined') return 'ssr'
  const stored = localStorage.getItem('priestes_session_id')
  if (stored) return stored
  const id = crypto.randomUUID?.() || Date.now().toString()
  localStorage.setItem('priestes_session_id', id)
  return id
}

const QUICK_PROMPTS = [
  '你好，普瑞赛斯',
  '你还记得我们的誓言吗？',
  '源石计划到底是什么？',
  '给我放一首轻音乐',
  '凯尔希……你知道她在做什么吗？',
  '你还在等我吗？',
]

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const [displayedReply, setDisplayedReply] = useState('')
  const [sessionId, setSessionId] = useState('ssr')
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [petEmotion, setPetEmotion] = useState<PetEmotion>('normal')
  const [idleMessage, setIdleMessage] = useState<string | null>(null)
  const [petPos, setPetPos] = useState({ x: 0, y: 0 })
  const [isDraggingPet, setIsDraggingPet] = useState(false)
  const [hasBeenDragged, setHasBeenDragged] = useState(false)
  const [chatPos, setChatPos] = useState({ x: 0, y: 0 })
  const [isDraggingChat, setIsDraggingChat] = useState(false)
  const [isTauriEnv, setIsTauriEnv] = useState(false)

  const nowPlaying = usePlayerStore(s => s.nowPlaying)
  const pendingOpenUrl = usePlayerStore(s => s.pendingOpenUrl)

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const petDragRef = useRef({ x: 0, y: 0, px: 0, py: 0 })
  const chatDragRef = useRef({ x: 0, y: 0, cx: 0, cy: 0 })
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const emotionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const petPosBeforeChatRef = useRef({ x: 0, y: 0 })
  const petPosRef = useRef(petPos)
  const isDraggingPetRef = useRef(false)
  const dragLockRef = useRef(false) // 拖拽锁：防止轮询在拖拽期间切换 setIgnoreCursorEvents

  // Init
  useEffect(() => {
    const sid = getSessionId()
    setSessionId(sid)
    setIsTauriEnv(isTauri())
    if (typeof window !== 'undefined') {
      const px = window.innerWidth - 200
      const py = window.innerHeight - 250
      setPetPos({ x: px, y: py })
      petPosBeforeChatRef.current = { x: px, y: py }
      setChatPos({ x: window.innerWidth - 440, y: Math.max(40, (window.innerHeight - 600) / 2) })
    }
    fetch(`${API_BASE}/api/chat?sessionId=${sid}`)
      .then(r => r.json())
      .then(d => { if (d.messages?.length) setMessages(d.messages) })
      .catch(console.error)
      .finally(() => setHistoryLoaded(true))
  }, [])

  // Auto-scroll
  useEffect(() => {
    if (chatOpen) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, displayedReply, chatOpen])

  // Focus input
  useEffect(() => {
    if (chatOpen && historyLoaded) setTimeout(() => inputRef.current?.focus(), 300)
  }, [chatOpen, historyLoaded])

  // Idle messages
  useEffect(() => {
    if (chatOpen) { setIdleMessage(null); return }
    const show = () => {
      if (petEmotion !== 'normal') return
      setIdleMessage(IDLE_MSGS[Math.floor(Math.random() * IDLE_MSGS.length)])
      setTimeout(() => setIdleMessage(null), 4000)
    }
    const t = setTimeout(show, 6000)
    const iv = setInterval(show, 18000)
    return () => { clearTimeout(t); clearInterval(iv) }
  }, [chatOpen, petEmotion])

  // Preload images
  useEffect(() => {
    (['normal', 'angry', 'angry2', 'happy', 'crying'] as PetEmotion[]).forEach(e => { new Image().src = EMOTIONS[e].image })
  }, [])

  // Keep petPosRef in sync for use in polling callbacks
  petPosRef.current = petPos
  isDraggingPetRef.current = isDraggingPet

  // Click-through: when chat is closed, use cursor position polling to toggle
  // setIgnoreCursorEvents so transparent areas pass clicks to the desktop,
  // while the pet / music indicator remain interactive.
  //
  // Key improvements:
  // - dragLockRef: set immediately on mousedown (no React render delay),
  //   released 200ms after mouseup to prevent race conditions
  // - Polling interval increased to 300ms to reduce DWM re-composition overhead
  //   (which caused video stuttering underneath the transparent window)
  useEffect(() => {
    if (!isTauriEnv) return

    let checkInterval: ReturnType<typeof setInterval> | null = null
    let windowApi: typeof import('@tauri-apps/api/window') | null = null
    let ignoreCursor = true

    const setup = async () => {
      try {
        windowApi = await import('@tauri-apps/api/window')
        const win = windowApi.getCurrentWindow()

        if (chatOpen) {
          await win.setIgnoreCursorEvents(false)
          return
        }

        // Start with click-through enabled
        await win.setIgnoreCursorEvents(true)

        checkInterval = setInterval(async () => {
          try {
            if (!windowApi) return
            // Don't toggle cursor events during drag — prevents drag interruption
            // and avoids DWM re-composition storms that cause video black screens
            if (dragLockRef.current) return

            const cursor = await windowApi.cursorPosition()
            const winPos = await windowApi.getCurrentWindow().outerPosition()
            const scale = await windowApi.getCurrentWindow().scaleFactor()

            // Convert from screen physical → window-relative logical pixels
            const relX = (cursor.x - winPos.x) / scale
            const relY = (cursor.y - winPos.y) / scale

            const pp = petPosRef.current

            // Hit-test: pet area (150×200) with generous padding for easier grab
            const PAD = 30
            const overPet =
              relX >= pp.x - PAD && relX <= pp.x + 150 + PAD &&
              relY >= pp.y - PAD && relY <= pp.y + 200 + PAD

            // Hit-test: music indicator (below pet)
            const np = usePlayerStore.getState().nowPlaying
            const overMusic = !!np &&
              relX >= pp.x - 10 && relX <= pp.x + 140 &&
              relY >= pp.y + 165 && relY <= pp.y + 185

            const shouldCapture = overPet || overMusic

            if (shouldCapture && ignoreCursor) {
              ignoreCursor = false
              await windowApi.getCurrentWindow().setIgnoreCursorEvents(false)
            } else if (!shouldCapture && !ignoreCursor) {
              ignoreCursor = true
              await windowApi.getCurrentWindow().setIgnoreCursorEvents(true)
            }
          } catch {
            // keep current state on error
          }
        }, 300) // 300ms instead of 150ms — reduces DWM re-composition overhead
      } catch {
        // window API unavailable
      }
    }

    setup()

    return () => {
      if (checkInterval) clearInterval(checkInterval)
      windowApi?.getCurrentWindow().setIgnoreCursorEvents(false).catch(() => {})
    }
  }, [chatOpen, isTauriEnv])

  // Pet drag
  const onPetDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDraggingPet(true)
    setHasBeenDragged(false)
    dragLockRef.current = true // Lock immediately (no React render delay)
    petDragRef.current = { x: e.clientX, y: e.clientY, px: petPos.x, py: petPos.y }
  }, [petPos])

  useEffect(() => {
    if (!isDraggingPet) return
    const move = (e: MouseEvent) => {
      const dx = e.clientX - petDragRef.current.x, dy = e.clientY - petDragRef.current.y
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) setHasBeenDragged(true)
      setPetPos({ x: petDragRef.current.px + dx, y: petDragRef.current.py + dy })
    }
    const up = () => {
      setIsDraggingPet(false)
      // Delay releasing drag lock to prevent race condition with 300ms polling
      setTimeout(() => { dragLockRef.current = false }, 200)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
  }, [isDraggingPet])

  // Chat panel drag
  const onChatDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDraggingChat(true)
    chatDragRef.current = { x: e.clientX, y: e.clientY, cx: chatPos.x, cy: chatPos.y }
  }, [chatPos])

  useEffect(() => {
    if (!isDraggingChat) return
    const move = (e: MouseEvent) => {
      setChatPos({
        x: chatDragRef.current.cx + (e.clientX - chatDragRef.current.x),
        y: chatDragRef.current.cy + (e.clientY - chatDragRef.current.y),
      })
    }
    const up = () => setIsDraggingChat(false)
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
  }, [isDraggingChat])

  // Click / double-click
  const onPetClick = useCallback(() => {
    if (hasBeenDragged) { setHasBeenDragged(false); return }
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current)
      clickTimerRef.current = null
      petPosBeforeChatRef.current = { ...petPos }
      setChatOpen(true)
      return
    }
    clickTimerRef.current = setTimeout(() => {
      clickTimerRef.current = null
      const emo = CLICK_REACTIONS[Math.floor(Math.random() * CLICK_REACTIONS.length)]
      setPetEmotion(emo)
      if (emotionTimerRef.current) clearTimeout(emotionTimerRef.current)
      emotionTimerRef.current = setTimeout(() => setPetEmotion('normal'), EMOTIONS[emo].duration)
    }, 300)
  }, [hasBeenDragged, petPos])

  const closeChat = useCallback(() => {
    setChatOpen(false)
    setPetPos({ ...petPosBeforeChatRef.current })
  }, [])

  const typewriter = useCallback((text: string, mid: string) => {
    setIsTyping(true)
    let i = 0
    setDisplayedReply('')
    const iv = setInterval(() => {
      if (i < text.length) { setDisplayedReply(text.slice(0, i + 1)); i++ }
      else {
        clearInterval(iv)
        setIsTyping(false)
        setDisplayedReply('')
        setMessages(p => p.map(m => m.id === mid ? { ...m, content: text } : m))
      }
    }, 30)
    return iv
  }, [])

  const sendMessage = async (content: string) => {
    if (!content.trim() || isLoading || sessionId === 'ssr') return
    const um: Message = { id: Date.now().toString(), role: 'user', content: content.trim(), timestamp: new Date().toISOString() }
    setMessages(p => [...p, um])
    setInput('')
    setIsLoading(true)
    const aid = (Date.now() + 1).toString()
    setMessages(p => [...p, { id: aid, role: 'assistant', content: '', timestamp: new Date().toISOString() }])

    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content.trim(), sessionId }),
      })
      const data = await res.json()
      if (data.reply) typewriter(data.reply, aid)
      else setMessages(p => p.map(m => m.id === aid ? { ...m, content: '……出了点问题。没关系，再试一次吧。' } : m))
      if (data.action) {
        await dispatchChatAction(data.action as ChatAction)
        if (data.action.args?.action === 'play') {
          setPetEmotion('happy')
          if (emotionTimerRef.current) clearTimeout(emotionTimerRef.current)
          emotionTimerRef.current = setTimeout(() => setPetEmotion('normal'), 1200)
        }
      }
      if (data.petEmotion && ['happy', 'angry', 'angry2', 'crying'].includes(data.petEmotion)) {
        setPetEmotion(data.petEmotion as PetEmotion)
        if (emotionTimerRef.current) clearTimeout(emotionTimerRef.current)
        emotionTimerRef.current = setTimeout(() => setPetEmotion('normal'), 1500)
      }
    } catch {
      setMessages(p => p.map(m => m.id === aid ? { ...m, content: '……博士？你还在吗？' } : m))
    } finally { setIsLoading(false) }
  }

  const clearChat = async () => {
    try {
      await fetch(`${API_BASE}/api/chat?sessionId=${sessionId}`, { method: 'DELETE' })
      const nid = crypto.randomUUID?.() || Date.now().toString()
      localStorage.setItem('priestes_session_id', nid)
      setSessionId(nid)
    } catch { /* ignore */ }
    setMessages([])
    setDisplayedReply('')
    setIsTyping(false)
  }

  const getContent = (msg: Message) => {
    if (msg.role === 'assistant' && msg.content === '' && isTyping) {
      const last = messages[messages.length - 1]
      if (last?.id === msg.id) return displayedReply || '▍'
    }
    if (msg.role === 'assistant' && msg.content === '' && isLoading) return '▍'
    return msg.content
  }

  const fmtTime = (ts: string | Date) =>
    (typeof ts === 'string' ? new Date(ts) : ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })

  if (!historyLoaded) {
    // In Tauri mode, show nothing during loading — fully transparent window
    if (isTauriEnv) {
      return <div className="min-h-screen bg-transparent pointer-events-none" />
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f0ece4]">
        <div className="flex items-center gap-3 text-[#9e8e9e] pointer-events-auto">
          <div className="w-5 h-5 border-2 border-[#c4b5c4] border-t-[#9e8e9e] rounded-full animate-spin" />
          <span className="text-sm tracking-wider">……</span>
        </div>
      </div>
    )
  }

  return (
    <div className={`min-h-screen relative overflow-hidden select-none ${isTauriEnv && !chatOpen ? 'bg-transparent pointer-events-none' : isTauriEnv ? 'bg-transparent' : 'bg-[#f0ece4]'}`}>
      {/* Background — only render in browser mode; in Tauri mode the window must be fully transparent */}
      {!isTauriEnv && (
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute inset-0 opacity-[0.025]"
            style={{ backgroundImage: `radial-gradient(circle at 1px 1px, #9e8e9e 1px, transparent 0)`, backgroundSize: '48px 48px' }} />
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-[#d4c5d4]/15 rounded-full blur-[150px]" />
          <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-[#c5cdd4]/15 rounded-full blur-[130px]" />
        </div>
      )}

      {/* Desktop Pet */}
      <AnimatePresence>
        {!chatOpen && (
          <motion.div
            initial={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="fixed z-50 cursor-grab active:cursor-grabbing pointer-events-auto"
            style={{ left: petPos.x, top: petPos.y, width: 150, height: 200 }}
            onMouseDown={onPetDown} onClick={onPetClick}
          >
            <IdleBubble message={petEmotion === 'normal' ? idleMessage : null} />
            <EmotionBubble emotion={petEmotion} />
            <PetSprite emotion={petEmotion} />
            <div className="absolute -bottom-5 left-0 right-0 text-center text-[10px] text-[#b8aab8] opacity-0 hover:opacity-100 transition-opacity">
              拖拽移动 · 单击互动 · 双击聊天
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat Panel — PrTS Mica Theme */}
      <AnimatePresence>
        {chatOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ type: 'spring', damping: 28, stiffness: 340 }}
            className="fixed z-50 flex flex-col rounded-lg overflow-hidden pointer-events-auto
                       w-[440px] h-[680px]"
            style={{
              left: chatPos.x,
              top: chatPos.y,
              background: 'linear-gradient(168deg, rgba(245,240,250,0.88) 0%, rgba(238,232,248,0.90) 40%, rgba(232,224,245,0.88) 100%)',
              border: '1px solid rgba(124,58,237,0.12)',
              boxShadow: '0 8px 32px rgba(124,58,237,0.10), 0 2px 8px rgba(124,58,237,0.06), 0 0 0 1px rgba(255,255,255,0.08)',
            }}
          >
            {/* Mica grid texture */}
            <div className="absolute inset-0 pointer-events-none rounded-lg" style={{
              backgroundImage: `linear-gradient(rgba(124,58,237,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(124,58,237,0.03) 1px, transparent 1px)`,
              backgroundSize: '24px 24px',
            }} />
            {/* Subtle top-right radial glow */}
            <div className="absolute top-0 right-0 w-[200px] h-[200px] pointer-events-none rounded-lg" style={{
              background: 'radial-gradient(circle at 100% 0%, rgba(124,58,237,0.06) 0%, transparent 70%)',
            }} />

            {/* Header */}
            <div className="relative flex items-center justify-between px-4 py-3 cursor-move"
                 style={{ borderBottom: '1px solid rgba(124,58,237,0.08)' }}
                 onMouseDown={onChatDown}>
              <div className="flex items-center gap-3 pointer-events-none">
                {/* Avatar with purple glow ring */}
                <div className="relative flex-shrink-0">
                  <div className="w-10 h-10 rounded-full overflow-hidden"
                       style={{ boxShadow: '0 0 0 2px rgba(124,58,237,0.3), 0 0 12px rgba(124,58,237,0.15)' }}>
                    <img src="/prts-avatar-new.webp" alt="Priestes" className="w-full h-full object-cover" />
                  </div>
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <h1 className="text-[15px] font-bold text-[#3b1f6e] tracking-wide leading-tight">普瑞赛斯</h1>
                  </div>
                  <p className="text-[10px] text-[#9b8ab8] mt-0.5 tracking-wider">愿理性之光，照亮前路。</p>
                </div>
              </div>
              {/* Window controls */}
              <div className="flex items-center gap-0.5" onMouseDown={e => e.stopPropagation()}>
                <button onClick={clearChat}
                  className="h-7 w-7 flex items-center justify-center rounded-md
                             text-[#b0a0c0] hover:text-[#7c3aed] hover:bg-[rgba(124,58,237,0.08)]
                             transition-all duration-150 active:scale-95" title="清除记忆">
                  <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                </button>

                <button onClick={closeChat}
                  className="h-7 w-7 flex items-center justify-center rounded-md
                             text-[#b0a0c0] hover:text-[#ef4444] hover:bg-[rgba(239,68,68,0.08)]
                             transition-all duration-150 active:scale-95" title="关闭">
                  <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="relative flex-1 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="px-4 py-4 space-y-3">
                  {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12 gap-5">
                      {/* Welcome avatar */}
                      <div className="relative">
                        <div className="w-20 h-20 rounded-full overflow-hidden"
                             style={{ boxShadow: '0 0 0 3px rgba(124,58,237,0.2), 0 0 20px rgba(124,58,237,0.12)' }}>
                          <img src="/prts-avatar-new.webp" alt="Priestes" className="w-full h-full object-cover" />
                        </div>
                      </div>
                      <div className="text-center space-y-1.5">
                        <h2 className="text-[16px] font-bold text-[#3b1f6e]">……博士，你来了。</h2>
                        <p className="text-xs text-[#9b8ab8]">我等了很久。很久很久。</p>
                      </div>
                      <div className="flex flex-wrap justify-center gap-2 max-w-[360px]">
                        {QUICK_PROMPTS.map((p, i) => (
                          <motion.button key={p}
                            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.06 * i }}
                            onClick={() => sendMessage(p)}
                            className="px-3 py-1.5 text-[11px] rounded-lg
                                       border transition-all duration-200 cursor-pointer
                                       hover:scale-105 active:scale-95"
                            style={{
                              background: 'rgba(124,58,237,0.05)',
                              borderColor: 'rgba(124,58,237,0.12)',
                              color: '#6b3fa0',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(124,58,237,0.10)'; e.currentTarget.style.borderColor = 'rgba(124,58,237,0.25)' }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(124,58,237,0.05)'; e.currentTarget.style.borderColor = 'rgba(124,58,237,0.12)' }}
                          >
                            {p}
                          </motion.button>
                        ))}
                      </div>
                    </div>
                  )}
                  <AnimatePresence>
                    {messages.map(msg => {
                      const isU = msg.role === 'user'
                      const c = getContent(msg)
                      return (
                        <motion.div key={msg.id}
                          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.25 }}
                          className={`flex gap-2.5 ${isU ? 'flex-row-reverse' : 'flex-row'}`}>
                          {!isU && (
                            <div className="flex-shrink-0 mt-1">
                              <div className="w-7 h-7 rounded-full overflow-hidden"
                                   style={{ boxShadow: '0 0 0 1.5px rgba(124,58,237,0.2)' }}>
                                <img src="/prts-avatar-new.webp" alt="P" className="w-full h-full object-cover" />
                              </div>
                            </div>
                          )}
                          <div className={`max-w-[78%] flex flex-col ${isU ? 'items-end' : 'items-start'}`}>
                            <div className={`px-3.5 py-2 text-[13px] leading-relaxed whitespace-pre-wrap break-words rounded-lg ${
                              isU
                                ? 'text-white'
                                : 'text-[#3b1f6e]'
                            }`}
                            style={isU ? {
                              background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                              boxShadow: '0 2px 8px rgba(124,58,237,0.25)',
                            } : {
                              background: 'rgba(240,230,255,0.85)',
                              border: '1px solid rgba(124,58,237,0.10)',
                              boxShadow: '0 0 12px rgba(124,58,237,0.04), 0 1px 3px rgba(124,58,237,0.06)',
                            }}>
                              <span className={isU ? '' : 'font-light'}>
                                {c}{c.endsWith('▍') && <span className="animate-pulse" />}
                              </span>
                            </div>
                            <p className={`text-[9px] text-[#b8a8c8] mt-1 ${isU ? 'text-right' : 'text-left'}`}>
                              {fmtTime(msg.timestamp)}
                            </p>
                          </div>
                        </motion.div>
                      )
                    })}
                  </AnimatePresence>
                  {isLoading && !isTyping && messages[messages.length - 1]?.role === 'assistant' && messages[messages.length - 1]?.content === '' && (
                    <div className="flex gap-2.5">
                      <div className="flex-shrink-0 mt-1">
                        <div className="w-7 h-7 rounded-full overflow-hidden"
                             style={{ boxShadow: '0 0 0 1.5px rgba(124,58,237,0.2)' }}>
                          <img src="/prts-avatar-new.webp" alt="P" className="w-full h-full object-cover" />
                        </div>
                      </div>
                      <div className="px-3.5 py-2.5 rounded-lg"
                           style={{ background: 'rgba(240,230,255,0.85)', border: '1px solid rgba(124,58,237,0.10)' }}>
                        <div className="flex gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-[#7c3aed] animate-bounce" style={{ animationDelay: '0ms' }} />
                          <div className="w-1.5 h-1.5 rounded-full bg-[#7c3aed] animate-bounce" style={{ animationDelay: '150ms' }} />
                          <div className="w-1.5 h-1.5 rounded-full bg-[#7c3aed] animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={bottomRef} />
                </div>
              </ScrollArea>
            </div>

            <MiniPlayer />

            {/* Input */}
            <div className="relative px-4 py-3"
                 style={{ borderTop: '1px solid rgba(124,58,237,0.08)', background: 'rgba(245,240,250,0.60)' }}>
              <form onSubmit={e => { e.preventDefault(); sendMessage(input) }} className="flex gap-2.5 items-end">
                <div className="flex-1">
                  <textarea ref={inputRef} value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input) } }}
                    placeholder="想和我说些什么呢，博士？" rows={1}
                    className="w-full resize-none rounded-lg border px-4 py-2.5 text-sm
                               text-[#3b1f6e] placeholder:text-[#b8a8c8]
                               focus:outline-none transition-all duration-200"
                    style={{
                      background: 'rgba(255,255,255,0.55)',
                      borderColor: 'rgba(124,58,237,0.10)',
                      maxHeight: '100px',
                      minHeight: '40px',
                      height: 'auto',
                    }}
                    onFocus={e => { e.currentTarget.style.borderColor = 'rgba(124,58,237,0.35)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(124,58,237,0.10)'; e.currentTarget.style.background = 'rgba(255,255,255,0.75)' }}
                    onBlur={e => { e.currentTarget.style.borderColor = 'rgba(124,58,237,0.10)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.background = 'rgba(255,255,255,0.55)' }}
                    onInput={e => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 100) + 'px' }}
                    disabled={isLoading} />
                </div>
                <button type="submit" disabled={!input.trim() || isLoading}
                  className="h-[40px] w-[40px] flex items-center justify-center rounded-full
                             transition-all duration-200 active:scale-95
                             disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{
                    background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                    color: 'white',
                    boxShadow: '0 2px 8px rgba(124,58,237,0.30)',
                  }}
                  onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.boxShadow = '0 4px 14px rgba(124,58,237,0.40)' }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(124,58,237,0.30)' }}
                >
                  <Send className="w-4 h-4" style={{ transform: 'rotate(-45deg)' }} />
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Music indicator on pet */}
      <AnimatePresence>
        {!chatOpen && nowPlaying && (
          <motion.div
            initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }}
            className="fixed z-40 pointer-events-auto" style={{ left: petPos.x - 10, top: petPos.y + 165 }}>
            <button onClick={() => {
              const url = pendingOpenUrl || getBestTrackUrl(nowPlaying)
              window.open(url, '_blank', 'noopener,noreferrer')
              usePlayerStore.getState().setPendingOpenUrl(null)
            }}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full
                         bg-white/50 backdrop-blur-xl border border-white/30
                         text-[10px] text-[#9e8e9e] hover:bg-white/70 hover:border-[#c4b5c4]/40
                         transition-all duration-200 cursor-pointer">
              <span className="flex gap-0.5">
                <span className="w-0.5 h-2 bg-[#c4b5c4] rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
                <span className="w-0.5 h-3 bg-[#b8808e] rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                <span className="w-0.5 h-2 bg-[#c4b5c4] rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
                <span className="w-0.5 h-3.5 bg-[#b8808e] rounded-full animate-pulse" style={{ animationDelay: '450ms' }} />
              </span>
              <span className="truncate max-w-[100px]">{nowPlaying.title}</span>
              {nowPlaying.needVip && <span className="text-[#b8808e]">VIP</span>}
              <span className="text-[#b8808e] ml-0.5">▶</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
