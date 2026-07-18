'use client'

import { AnimatePresence, motion } from 'framer-motion'

export default function IdleBubble({ message }: { message: string | null }) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 5, scale: 0.95 }}
          className="absolute -top-14 left-1/2 -translate-x-1/2
                     px-4 py-2 rounded-2xl whitespace-nowrap
                     bg-white/60 backdrop-blur-xl border border-white/40
                     text-sm text-[#6b5b6b] shadow-lg shadow-[#9e8e9e]/10"
        >
          {message}
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4
                          bg-white/60 backdrop-blur-xl border-r border-b border-white/40
                          rotate-45 rounded-sm" />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
