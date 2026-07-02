/**
 * Tiny dependency-free confetti burst, used by both the side panel (marking a
 * series Completed) and the watch page (auto-completion toast). Pure DOM +
 * Web Animations API — no canvas, no CSS injection — and it cleans up after
 * itself. Respects prefers-reduced-motion by doing nothing.
 */

const COLORS = ['#f47521', '#ff9550', '#34d27b', '#3aa0ff', '#f0b429', '#ff6b9d'];

export function confettiBurst(count = 70): void {
  if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  const root = document.createElement('div');
  Object.assign(root.style, {
    position: 'fixed',
    inset: '0',
    pointerEvents: 'none',
    zIndex: '2147483647',
    overflow: 'hidden',
  } satisfies Partial<CSSStyleDeclaration>);
  document.documentElement.appendChild(root);

  const w = window.innerWidth;
  let live = count;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    const size = 5 + Math.random() * 6;
    Object.assign(p.style, {
      position: 'absolute',
      top: '-12px',
      left: `${Math.random() * w}px`,
      width: `${size}px`,
      height: `${size * (0.4 + Math.random() * 0.8)}px`,
      background: COLORS[i % COLORS.length],
      borderRadius: Math.random() < 0.3 ? '50%' : '2px',
    } satisfies Partial<CSSStyleDeclaration>);
    root.appendChild(p);

    const fall = 900 + Math.random() * 1100;
    const drift = (Math.random() - 0.5) * 220;
    const anim = p.animate(
      [
        { transform: 'translate(0, 0) rotate(0deg)', opacity: 1 },
        {
          transform: `translate(${drift}px, ${window.innerHeight + 40}px) rotate(${540 + Math.random() * 540}deg)`,
          opacity: 0.9,
        },
      ],
      { duration: fall, delay: Math.random() * 250, easing: 'cubic-bezier(0.15, 0.45, 0.55, 1)', fill: 'forwards' },
    );
    anim.onfinish = () => {
      p.remove();
      if (--live === 0) root.remove();
    };
  }
  // Backstop: if onfinish is ever skipped (tab hidden), don't leak the overlay.
  window.setTimeout(() => root.remove(), 4000);
}
