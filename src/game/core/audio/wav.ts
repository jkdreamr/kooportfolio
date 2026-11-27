/** 16-bit PCM WAV encoder for audition renders (people listen to these). */
export function encodeWav(sampleRate: number, channels: Float32Array[]): Uint8Array {
  const frames = channels[0]?.length ?? 0,
    count = channels.length;
  const bytes = new Uint8Array(44 + frames * count * 2);
  const view = new DataView(bytes.buffer);
  const text = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) bytes[at + i] = s.charCodeAt(i);
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + frames * count * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, count, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * count * 2, true);
  view.setUint16(32, count * 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, frames * count * 2, true);
  let at = 44;
  for (let i = 0; i < frames; i++)
    for (let c = 0; c < count; c++) {
      const v = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(at, Math.round(v < 0 ? v * 32768 : v * 32767), true);
      at += 2;
    }
  return bytes;
}
