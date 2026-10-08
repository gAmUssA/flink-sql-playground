'use strict';
// Text contrast as rendered, shared by the desktop and landscape specs.

/**
 * WCAG contrast of each element's text against the background it is drawn on, as rendered: the
 * element's own and its ancestors' background colours composited from the root down, with each
 * `opacity` below 1 blending its subtree into what lies behind it. Colours are resolved through a
 * canvas, so color-mix() and alpha work whatever syntax the browser reports.
 */
function measureContrast(targets) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 1;
  const g = cv.getContext('2d', { willReadFrequently: true });
  const rgba = (css) => {
    g.clearRect(0, 0, 1, 1); g.fillStyle = css; g.fillRect(0, 0, 1, 1);
    const [r, gr, b, a] = g.getImageData(0, 0, 1, 1).data; return [r, gr, b, a / 255];
  };
  const over = (top, under) => top.slice(0, 3).map((c, i) => c * top[3] + under[i] * (1 - top[3]));
  const mix = (a, b, t) => a.map((c, i) => c * t + b[i] * (1 - t));
  // The colour of one pixel of `content` (or of the background, when content is fully
  // transparent) drawn inside path[i..], with `under` showing behind path[i].
  const render = (path, i, under, content) => {
    const s = getComputedStyle(path[i]);
    const inside = over(rgba(s.backgroundColor), under);
    const drawn = i === path.length - 1 ? over(content, inside) : render(path, i + 1, inside, content);
    return mix(drawn, under, parseFloat(s.opacity));
  };
  const lum = (rgb) => {
    const [r, g2, b] = rgb.map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g2 + 0.0722 * b;
  };
  return targets.map(({ what, el }) => {
    const path = [];
    for (let n = el; n; n = n.parentElement) path.unshift(n);
    const bg = render(path, 0, [255, 255, 255], [0, 0, 0, 0]);
    const fg = render(path, 0, [255, 255, 255], rgba(getComputedStyle(el).color));
    const [hi, lo] = [lum(fg), lum(bg)].sort((x, y) => y - x);
    return { what, ratio: Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100, fg: fg.map(Math.round), bg: bg.map(Math.round) };
  });
}

/**
 * Waits for the page's finite animations (cards and rows fading in) to end, so opacity is settled.
 * An animation whose element a re-render removed is cancelled: nothing of it is left to settle.
 */
async function settleAnimations(page) {
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter((a) => a.effect.getComputedTiming().endTime !== Infinity)
    .map((a) => a.finished.catch((e) => { if (e.name !== 'AbortError') throw e; }))));
}

module.exports = { measureContrast, settleAnimations };
