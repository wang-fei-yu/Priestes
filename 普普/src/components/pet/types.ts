export type PetEmotion = 'normal' | 'angry' | 'angry2' | 'happy' | 'crying'

export const EMOTIONS: Record<PetEmotion, { image: string; kaomoji: string; label: string; duration: number }> = {
  normal:  { image: '/pet-normal-final.webp',  kaomoji: '',           label: '',          duration: 0 },
  angry:   { image: '/pet-angry-final.webp',   kaomoji: '(╬◣д◢)',    label: '生气气！',   duration: 1200 },
  angry2:  { image: '/pet-angry-final.webp',   kaomoji: '(╬◣д◢)',    label: '普瑞赛斯~光线——！', duration: 1200 },
  happy:   { image: '/pet-happy-final.webp',   kaomoji: "(〃'▽'〃)",  label: '嘿嘿~',     duration: 1200 },
  crying:  { image: '/pet-crying-final.webp',  kaomoji: '(╥﹏╥)',     label: '呜呜……',    duration: 1200 },
}

export const CLICK_REACTIONS: PetEmotion[] = ['angry', 'angry2', 'happy', 'crying']
