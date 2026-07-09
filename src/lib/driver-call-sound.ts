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
  osc.type = "square";
  osc.frequency.setValueAtTime(frequency, startAt);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.35, startAt + 0.02);
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
  pulseTone(ctx, now, 0.28, 880);
  pulseTone(ctx, now + 0.34, 0.28, 1100);
  pulseTone(ctx, now + 0.68, 0.36, 880);
}

let alertAudio: HTMLAudioElement | null = null;

/** Fallback com elemento audio (alguns Androids). */
export function playDriverCallSoundFallback() {
  if (typeof window === "undefined") return;
  try {
    if (!alertAudio) {
      alertAudio = new Audio(
        "data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YUtvT18="
      );
      alertAudio.volume = 1;
    }
    alertAudio.currentTime = 0;
    void alertAudio.play().catch(() => undefined);
  } catch {
    // noop
  }
}

export async function playDriverCallAlert() {
  unlockDriverCallSound();
  await playDriverCallSound();
  playDriverCallSoundFallback();
}
