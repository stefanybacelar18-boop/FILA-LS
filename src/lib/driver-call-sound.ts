let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (audioContext) return audioContext;

  const AudioCtx =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;

  audioContext = new AudioCtx();
  return audioContext;
}

/** Desbloqueia audio no mobile — chamar no primeiro toque do usuario. */
export function unlockDriverCallSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  void ctx.resume().catch(() => undefined);
}

function pulseTone(ctx: AudioContext, startAt: number, duration: number, frequency: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(frequency, startAt);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.85, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + duration);
}

/** Som de alerta para chamada — funciona apos unlockDriverCallSound(). */
export async function playDriverCallSound() {
  const ctx = getAudioContext();
  if (!ctx) return;

  if (ctx.state === "suspended") {
    await ctx.resume().catch(() => undefined);
  }
  if (ctx.state !== "running") return;

  const now = ctx.currentTime + 0.02;
  pulseTone(ctx, now, 0.32, 880);
  pulseTone(ctx, now + 0.38, 0.32, 1100);
  pulseTone(ctx, now + 0.76, 0.42, 880);
  pulseTone(ctx, now + 1.14, 0.5, 1320);
}

/** Fallback — segunda tentativa de Web Audio. */
export async function playDriverCallSoundFallback() {
  await playDriverCallSound();
}

export async function playDriverCallAlert() {
  unlockDriverCallSound();
  await playDriverCallSound();
  await playDriverCallSoundFallback();
}
