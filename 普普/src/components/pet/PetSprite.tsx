'use client'

import { motion } from 'framer-motion'
import type { PetEmotion } from './types'
import { EMOTIONS } from './types'

const getEmotionAnim = (emotion: PetEmotion) => {
  if (emotion === 'normal') return { y: 0, x: 0, rotate: 0 }
  switch (emotion) {
    case 'angry':
    case 'angry2':
      return { y: [0, -0.8, 0, -0.8, 0], x: [0, -0.4, 0.4, -0.4, 0], rotate: 0 }
    case 'happy':
      return { y: [0, -1.5, 0, -1.5, 0], x: 0, rotate: [0, 0.3, 0, -0.3, 0] }
    case 'crying':
      return { y: [0, -0.3, 0, -0.3, 0], x: [0, 0.2, -0.2, 0.2, 0], rotate: 0 }
    default: return { y: 0, x: 0, rotate: 0 }
  }
}

const getEmotionTrans = (emotion: PetEmotion) => {
  if (emotion === 'normal') return { duration: 0.6, ease: 'easeOut' }
  return {
    y: { duration: 0.8, repeat: Infinity, ease: 'easeInOut' },
    x: { duration: 0.8, repeat: Infinity, ease: 'easeInOut' },
    rotate: { duration: 0.8, repeat: Infinity, ease: 'easeInOut' },
  }
}

/** All visible emotion keys for sprite rendering */
const SPRITE_EMOTIONS: PetEmotion[] = ['normal', 'angry', 'angry2', 'happy', 'crying']

export default function PetSprite({ emotion }: { emotion: PetEmotion }) {
  return (
    <motion.div
      animate={getEmotionAnim(emotion)}
      transition={getEmotionTrans(emotion)}
      className="relative w-full h-full"
    >
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-20 h-3 bg-[#9e8e9e]/10 rounded-full blur-sm" />
      {SPRITE_EMOTIONS.map(e => (
        <div
          key={e}
          className="absolute inset-0 flex items-center justify-center"
          style={{
            opacity: emotion === e ? 1 : 0,
            transform: emotion === e ? 'scale(1)' : 'scale(0.92)',
            transition: 'opacity 0.5s cubic-bezier(0.4,0,0.2,1), transform 0.5s cubic-bezier(0.4,0,0.2,1)',
            pointerEvents: 'none',
          }}
        >
          <img
            src={EMOTIONS[e].image}
            alt={`Priestes ${e}`}
            className="w-full h-full object-contain drop-shadow-lg"
            draggable={false}
          />
        </div>
      ))}
    </motion.div>
  )
}
