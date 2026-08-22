/** Soft, whimsical procedural UI chimes via Web Audio — no asset files required. */

type UiSoundKind = 'tap' | 'add' | 'success' | 'soft'

let sharedCtx: AudioContext | null = null
let unlocked = false
/** Prevents two handlers on the same click from stacking sounds. */
let lastPlayAt = 0
const MIN_SOUND_GAP_MS = 55

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioCtx) return null
  if (!sharedCtx) sharedCtx = new AudioCtx()
  return sharedCtx
}

/** Call once from a user gesture so later sounds can play. */
export function unlockUiSounds(): void {
  const ctx = getCtx()
  if (!ctx) return
  if (ctx.state === 'suspended') {
    void ctx.resume()
  }
  unlocked = true
}

/** Soft bell / chime partial: sine + quiet overtone, long gentle decay. */
function chime(
  ctx: AudioContext,
  {
    frequency,
    duration = 0.38,
    gain = 0.045,
    delay = 0,
    brightness = 0.35,
  }: {
    frequency: number
    duration?: number
    gain?: number
    delay?: number
    brightness?: number
  },
) {
  const start = ctx.currentTime + delay
  const master = ctx.createGain()
  master.gain.setValueAtTime(0.0001, start)
  master.gain.exponentialRampToValueAtTime(gain, start + 0.018)
  master.gain.exponentialRampToValueAtTime(gain * 0.45, start + duration * 0.28)
  master.gain.exponentialRampToValueAtTime(0.0001, start + duration)

  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(Math.min(4200, frequency * 4.2), start)
  filter.Q.setValueAtTime(0.7, start)

  const fundamental = ctx.createOscillator()
  fundamental.type = 'sine'
  fundamental.frequency.setValueAtTime(frequency, start)

  const partial = ctx.createOscillator()
  partial.type = 'sine'
  partial.frequency.setValueAtTime(frequency * 2.01, start)

  const partialGain = ctx.createGain()
  partialGain.gain.setValueAtTime(gain * brightness * 0.55, start)
  partialGain.gain.exponentialRampToValueAtTime(0.0001, start + duration * 0.55)

  const sparkle = ctx.createOscillator()
  sparkle.type = 'triangle'
  sparkle.frequency.setValueAtTime(frequency * 3.02, start)

  const sparkleGain = ctx.createGain()
  sparkleGain.gain.setValueAtTime(gain * brightness * 0.12, start)
  sparkleGain.gain.exponentialRampToValueAtTime(0.0001, start + duration * 0.22)

  fundamental.connect(filter)
  partial.connect(partialGain)
  partialGain.connect(filter)
  sparkle.connect(sparkleGain)
  sparkleGain.connect(filter)
  filter.connect(master)
  master.connect(ctx.destination)

  fundamental.start(start)
  partial.start(start)
  sparkle.start(start)
  fundamental.stop(start + duration + 0.04)
  partial.stop(start + duration + 0.04)
  sparkle.stop(start + duration * 0.35)
}

export function playUiSound(kind: UiSoundKind = 'tap'): void {
  try {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced) return

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    if (now - lastPlayAt < MIN_SOUND_GAP_MS) return
    lastPlayAt = now

    const ctx = getCtx()
    if (!ctx) return
    if (ctx.state === 'suspended') {
      void ctx.resume()
    }
    void unlocked

    if (kind === 'soft') {
      chime(ctx, { frequency: 659.25, duration: 0.32, gain: 0.028, brightness: 0.4 })
      return
    }
    if (kind === 'tap') {
      chime(ctx, { frequency: 783.99, duration: 0.28, gain: 0.032, brightness: 0.45 })
      chime(ctx, {
        frequency: 987.77,
        duration: 0.34,
        gain: 0.018,
        delay: 0.04,
        brightness: 0.5,
      })
      return
    }
    if (kind === 'add') {
      chime(ctx, { frequency: 523.25, duration: 0.3, gain: 0.034, brightness: 0.35 })
      chime(ctx, {
        frequency: 659.25,
        duration: 0.34,
        gain: 0.03,
        delay: 0.07,
        brightness: 0.42,
      })
      chime(ctx, {
        frequency: 880,
        duration: 0.42,
        gain: 0.026,
        delay: 0.14,
        brightness: 0.55,
      })
      return
    }
    chime(ctx, { frequency: 523.25, duration: 0.36, gain: 0.03, brightness: 0.3 })
    chime(ctx, {
      frequency: 659.25,
      duration: 0.4,
      gain: 0.028,
      delay: 0.09,
      brightness: 0.4,
    })
    chime(ctx, {
      frequency: 783.99,
      duration: 0.48,
      gain: 0.026,
      delay: 0.18,
      brightness: 0.45,
    })
    chime(ctx, {
      frequency: 1046.5,
      duration: 0.55,
      gain: 0.02,
      delay: 0.28,
      brightness: 0.6,
    })
  } catch {
    // Ignore audio failures
  }
}

/** Unlock + play in one call for click handlers. */
export function uiClick(kind: UiSoundKind = 'tap'): void {
  unlockUiSounds()
  playUiSound(kind)
}

export type { UiSoundKind }
