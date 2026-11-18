import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';

/** Striped "foil" canvas over its children. Reveals once ~40% is scratched away. */
export function Scratch({ children, onReveal }: { children: ReactNode; onReveal?: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [revealed, setRevealedState] = useState(false);
  const done = useRef(false);
  const setRevealed = (v: boolean) => { if (!v || done.current) return; done.current = true; setRevealedState(true); onReveal?.(); };
  const down = useRef(false);
  const last = useRef<[number, number] | null>(null);
  const count = useRef(0);

  useEffect(() => {
    const c = ref.current; if (!c) return;
    const w = c.clientWidth, h = c.clientHeight, dpr = window.devicePixelRatio || 1;
    c.width = w * dpr; c.height = h * dpr;
    const ctx = c.getContext('2d')!; ctx.scale(dpr, dpr);
    // Cabana foil: sunshine and cream stripes with a soft sheen.
    for (let x = 0, i = 0; x < w; x += 24, i++) { ctx.fillStyle = i % 2 ? '#fff1cc' : '#f2b632'; ctx.fillRect(x, 0, 24, h); }
    const sheen = ctx.createLinearGradient(0, 0, w, h);
    sheen.addColorStop(0, 'rgba(255,255,255,.3)'); sheen.addColorStop(.5, 'rgba(255,255,255,0)'); sheen.addColorStop(1, 'rgba(120,80,0,.18)');
    ctx.fillStyle = sheen; ctx.fillRect(0, 0, w, h);
    const bw = Math.min(w - 40, 270), bh = 128, bx = (w - bw) / 2, by = h / 2 - 78;
    ctx.fillStyle = '#fffaf0'; ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 18); ctx.fill();
    ctx.textAlign = 'center'; ctx.fillStyle = '#5a3d00';
    ctx.font = '34px Georgia'; ctx.fillText('☀', w / 2, by + 44);
    ctx.font = 'italic 700 20px Fraunces, Georgia, serif'; ctx.fillText('A little luck, a little love.', w / 2, by + 80);
    ctx.font = '700 11px "DM Sans", sans-serif'; ctx.fillText('S C R A T C H   T O   R E V E A L', w / 2, by + 108);
  }, []);

  function draw(e: PointerEvent<HTMLCanvasElement>) {
    if (!down.current || revealed) return;
    const c = e.currentTarget, rect = c.getBoundingClientRect(), ctx = c.getContext('2d')!;
    const p: [number, number] = [e.clientX - rect.left, e.clientY - rect.top];
    ctx.globalCompositeOperation = 'destination-out'; ctx.lineWidth = 48; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(...(last.current || p)); ctx.lineTo(...p); ctx.stroke();
    ctx.beginPath(); ctx.arc(...p, 24, 0, Math.PI * 2); ctx.fill(); last.current = p;
    if (++count.current % 8 === 0) {
      const data = ctx.getImageData(0, 0, c.width, c.height).data; let clear = 0, total = 0;
      for (let i = 3; i < data.length; i += 64) { total++; if (data[i] === 0) clear++; }
      if (clear / total > .4) setRevealed(true);
    }
  }
  const stop = () => { down.current = false; last.current = null; };

  return (
    <div className="scratch-container">
      {children}
      {!revealed && <>
        <canvas
          ref={ref}
          aria-label="Scratch the foil to reveal your gift"
          onPointerDown={e => { down.current = true; last.current = null; e.currentTarget.setPointerCapture(e.pointerId); draw(e); }}
          onPointerMove={draw}
          onPointerUp={stop}
          onPointerCancel={stop}
        />
        <button className="scratch-access" onClick={() => setRevealed(true)}>Reveal without scratching</button>
      </>}
    </div>
  );
}
