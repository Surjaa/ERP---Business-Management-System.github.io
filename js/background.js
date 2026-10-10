/* background.js: interactive black-and-white background. Each module group has its own scene.
   The pointer pulls on every scene and a click sends out a ripple. The colour comes from the
   --fx-rgb token, so it follows light and dark mode. Pauses when the tab is hidden; respects reduced motion. */
(function (global) {
  'use strict';

  const canvas = document.getElementById('bg');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const reduce = global.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rnd = (a, b) => a + Math.random() * (b - a);

  let w = 0, h = 0, dpr = 1, raf = 0, t = 0, frameNo = 0, scene = null;
  let rgb = '20,20,20';
  const mouse = { x: -9999, y: -9999, sx: 0, sy: 0 };
  const ripples = [];

  const SCENES = {
    network: {
      init(s) {
        const n = Math.min(120, Math.max(30, Math.floor((w * h) / 16000)));
        s.dots = Array.from({ length: n }, () => ({ x: rnd(0, w), y: rnd(0, h), vx: rnd(-.18, .18), vy: rnd(-.18, .18), r: rnd(.6, 2.2) }));
      },
      draw(s) {
        s.dots.forEach((d) => {
          d.x += d.vx; d.y += d.vy;
          if (d.x < 0 || d.x > w) d.vx *= -1;
          if (d.y < 0 || d.y > h) d.vy *= -1;
          const dx = d.x - mouse.x, dy = d.y - mouse.y, dist = Math.hypot(dx, dy);
          if (dist < 160) { d.x += (dx / dist) * 1.2; d.y += (dy / dist) * 1.2; }
        });
        for (let i = 0; i < s.dots.length; i++) {
          const a = s.dots[i];
          for (let j = i + 1; j < s.dots.length; j++) {
            const b = s.dots[j], d = Math.hypot(a.x - b.x, a.y - b.y);
            if (d < 130) { ctx.strokeStyle = `rgba(${rgb},${(1 - d / 130) * .3})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
          }
          ctx.fillStyle = `rgba(${rgb},.7)`; ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, 7); ctx.fill();
        }
      },
    },

    grid: {
      init(s) { s.step = 40; },
      draw(s) {
        for (let x = 0; x < w + s.step; x += s.step) {
          for (let y = 0; y < h + s.step; y += s.step) {
            const wave = Math.sin(x * .02 + t) + Math.cos(y * .025 - t * .8);
            const near = Math.max(0, 1 - Math.hypot(x - mouse.x, y - mouse.y) / 180);
            const k = (wave + 2) / 4 * .5 + near * .8;
            const size = 2 + k * 9;
            ctx.fillStyle = `rgba(${rgb},${.1 + k * .45})`;
            ctx.fillRect(x - size / 2, y - size / 2, size, size);
          }
        }
      },
    },

    flow: {
      init(s) { s.lines = 8; },
      draw(s) {
        for (let i = 0; i < s.lines; i++) {
          const base = (h / (s.lines + 1)) * (i + 1);
          const near = Math.max(0, 1 - Math.abs(mouse.y - base) / 160);
          ctx.beginPath();
          for (let x = 0; x <= w; x += 12) {
            const y = base + Math.sin(x * .006 + t + i) * (28 + near * 40) + Math.sin(x * .013 - t * 1.3 + i * 2) * 10;
            x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
          }
          ctx.strokeStyle = `rgba(${rgb},${.15 + near * .4})`;
          ctx.lineWidth = 1.4 + near * 1.6;
          ctx.stroke();
        }
      },
    },

    rise: {
      init(s) {
        s.bubbles = Array.from({ length: 70 }, () => ({ x: rnd(0, w), y: rnd(0, h), r: rnd(2, 7), v: rnd(.3, 1.1), o: rnd(0, 6) }));
        s.bars = 16;
      },
      draw(s) {
        const bw = w / s.bars;
        for (let i = 0; i < s.bars; i++) {
          const ht = (Math.sin(t * .8 + i * .7) + 1.2) * 0.5 * h * .14 + 20;
          ctx.fillStyle = `rgba(${rgb},.08)`;
          ctx.fillRect(i * bw + bw * .18, h - ht, bw * .64, ht);
        }
        s.bubbles.forEach((b) => {
          b.y -= b.v; b.x += Math.sin(t + b.o) * .4;
          if (b.y < -10) { b.y = h + 10; b.x = rnd(0, w); }
          const dist = Math.hypot(b.x - mouse.x, b.y - mouse.y);
          const r = b.r + (dist < 120 ? (1 - dist / 120) * 4 : 0);
          ctx.strokeStyle = `rgba(${rgb},.5)`; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, 7); ctx.stroke();
        });
      },
    },

    orbit: {
      init(s) {
        s.rings = [{ r: 90, n: 5, speed: .6 }, { r: 170, n: 8, speed: -.35 }, { r: 260, n: 12, speed: .2 }];
      },
      draw(s) {
        mouse.sx += ((mouse.x > 0 ? mouse.x : w / 2) - mouse.sx) * .05;
        mouse.sy += ((mouse.y > 0 ? mouse.y : h / 2) - mouse.sy) * .05;
        const cx = mouse.sx, cy = mouse.sy;
        s.rings.forEach((ring, ri) => {
          ctx.strokeStyle = `rgba(${rgb},.14)`; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(cx, cy, ring.r, 0, 7); ctx.stroke();
          for (let i = 0; i < ring.n; i++) {
            const a = (i / ring.n) * Math.PI * 2 + t * ring.speed + ri;
            const x = cx + Math.cos(a) * ring.r, y = cy + Math.sin(a) * ring.r;
            ctx.fillStyle = `rgba(${rgb},.75)`; ctx.beginPath(); ctx.arc(x, y, 4 - ri * .6, 0, 7); ctx.fill();
            ctx.strokeStyle = `rgba(${rgb},.1)`; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke();
          }
        });
        ctx.fillStyle = `rgba(${rgb},.9)`; ctx.beginPath(); ctx.arc(cx, cy, 6, 0, 7); ctx.fill();
      },
    },

    aurora: {
      init(s) {
        s.blobs = Array.from({ length: 4 }, (_, i) => ({ x: rnd(0, w), y: rnd(0, h), r: rnd(260, 420), p: i * 1.7 }));
      },
      draw(s) {
        ctx.globalCompositeOperation = 'lighter';
        s.blobs.forEach((b) => {
          const x = b.x + Math.sin(t * .4 + b.p) * 120 + (mouse.x - w / 2) * .05;
          const y = b.y + Math.cos(t * .3 + b.p) * 90 + (mouse.y - h / 2) * .05;
          const g = ctx.createRadialGradient(x, y, 0, x, y, b.r);
          g.addColorStop(0, `rgba(${rgb},.14)`); g.addColorStop(1, `rgba(${rgb},0)`);
          ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        });
        ctx.globalCompositeOperation = 'source-over';
      },
    },

    dots: {
      init(s) { s.step = 28; },
      draw(s) {
        for (let x = s.step / 2; x < w; x += s.step) {
          for (let y = s.step / 2; y < h; y += s.step) {
            const near = Math.max(0, 1 - Math.hypot(x - mouse.x, y - mouse.y) / 150);
            ctx.fillStyle = `rgba(${rgb},${.14 + near * .6})`;
            ctx.beginPath(); ctx.arc(x, y, 1 + near * 1.8, 0, 7); ctx.fill();
          }
        }
      },
    },

    hex: {
      init(s) { s.size = 30; },
      draw(s) {
        const r = s.size, dx = r * 1.5, dy = r * Math.sqrt(3);
        for (let col = -1, x = -r; x < w + r; col++, x += dx) {
          for (let y = (col % 2 ? dy / 2 : 0) - dy; y < h + dy; y += dy) {
            const near = Math.max(0, 1 - Math.hypot(x - mouse.x, y - mouse.y) / 170);
            const pulse = (Math.sin(t * 1.5 + x * .01 + y * .01) + 1) / 2;
            ctx.beginPath();
            for (let k = 0; k < 6; k++) {
              const a = Math.PI / 3 * k + Math.PI / 6;
              const px = x + Math.cos(a) * (r * .9), py = y + Math.sin(a) * (r * .9);
              k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
            }
            ctx.closePath();
            ctx.strokeStyle = `rgba(${rgb},${.12 + near * .5})`; ctx.lineWidth = 1; ctx.stroke();
            if (pulse > .8 || near > .3) { ctx.fillStyle = `rgba(${rgb},${.04 + near * .25 + (pulse > .8 ? .08 : 0)})`; ctx.fill(); }
          }
        }
      },
    },

    pulse: {
      init(s) { s.rows = 9; },
      draw(s) {
        for (let i = 0; i < s.rows; i++) {
          const base = (h / (s.rows + 1)) * (i + 1);
          const near = Math.max(0, 1 - Math.abs(mouse.y - base) / 140);
          ctx.beginPath();
          for (let x = 0; x <= w; x += 4) {
            const phase = ((x + t * 180 + i * 97) % 260) / 260;
            const spike = phase > .48 && phase < .56 ? Math.sin((phase - .48) / .08 * Math.PI) * (46 + near * 30) : 0;
            const y = base + Math.sin(x * .01 + t + i) * 2 - spike;
            x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
          }
          ctx.strokeStyle = `rgba(${rgb},${.14 + near * .45})`; ctx.lineWidth = 1.2 + near; ctx.stroke();
        }
      },
    },
  };

  // group name -> scene
  const DEPT = {
    Overview: 'network', Sales: 'rise', Purchase: 'flow', Accounting: 'aurora', Inventory: 'grid',
    Manufacturing: 'hex', Attendance: 'orbit', Maintenance: 'pulse', FMS: 'dots', Contacts: 'network',
    Documents: 'dots', Reports: 'aurora', System: 'dots',
  };

  function resize() {
    dpr = Math.min(global.devicePixelRatio || 1, 2);
    w = global.innerWidth; h = global.innerHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    if (scene) SCENES[scene.name].init(scene.state);
  }

  function readRGB() {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--fx-rgb').trim();
    if (v) rgb = v;
  }

  function frame() {
    frameNo++;
    if (frameNo % 30 === 1) readRGB();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    t += reduce ? 0 : .012;
    if (scene) SCENES[scene.name].draw(scene.state);
    // click ripples
    for (let i = ripples.length - 1; i >= 0; i--) {
      const rp = ripples[i];
      rp.r += 6; rp.life -= .02;
      if (rp.life <= 0) { ripples.splice(i, 1); continue; }
      ctx.strokeStyle = `rgba(${rgb},${rp.life * .6})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(rp.x, rp.y, rp.r, 0, 7); ctx.stroke();
    }
    if (!reduce) raf = requestAnimationFrame(frame);
  }

  // Public: switch the scene for a module group ("Sales", "Manufacturing", ...)
  function setDepartment(group) {
    const name = DEPT[group] || DEPT.Overview;
    if (!scene || scene.name !== name) {
      scene = { name, state: {} };
      SCENES[name].init(scene.state);
    }
    document.body.dataset.dept = group || 'Overview';
    readRGB();
    if (reduce) frame();
  }

  global.addEventListener('resize', resize);
  global.addEventListener('pointermove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
  global.addEventListener('pointerdown', (e) => { ripples.push({ x: e.clientX, y: e.clientY, r: 4, life: 1 }); });
  document.addEventListener('visibilitychange', () => {
    cancelAnimationFrame(raf);
    if (!document.hidden && !reduce) raf = requestAnimationFrame(frame);
  });

  resize();
  setDepartment('Overview');
  if (!reduce) raf = requestAnimationFrame(frame);

  global.Background = { setDepartment };
})(window);
