'use client'

import { AnimatePresence, motion } from 'framer-motion'
import type { PetEmotion } from './types'
import { EMOTIONS } from './types'

export default function EmotionBubble({ emotion }: { emotion: PetEmotion }) {
  return (
    <AnimatePresence>
      {emotion !== 'normal' && (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.5 }}
          animate={{ opacity: 1, y: -10, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.8 }}
          className="absolute -top-10 left-1/2 -translate-x-1/2
                     px-3 py-1.5 rounded-2xl whitespace-nowrap z-10
                     bg-white/70 backdrop-blur-xl border border-white/40
                     text-sm text-[#5b4b5b] shadow-md shadow-[#9e8e9e]/15"
        >
          <span className="mr-1 text-xs">{EMOTIONS[emotion].kaomoji}</span>
          {EMOTIONS[emotion].label}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
