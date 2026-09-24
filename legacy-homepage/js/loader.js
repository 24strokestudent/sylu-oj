/* ============================================================
   SYLU OJ · 页面加载动画（Rose Curve 玫瑰曲线）
   动画逻辑来自 math-curve-loaders（Rose Curve）
   页面加载完成后淡出并移出 DOM
   ============================================================ */

(function () {
  'use strict';

  var preloader = document.getElementById('preloader');
  if (!preloader) return;

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var group = preloader.querySelector('#loaderGroup');
  var path = preloader.querySelector('#loaderPath');
  if (!group || !path) return;

  /* ---------- 曲线参数 ---------- */
  var config = {
    particleCount: 100,
    trailSpan: 0.32,
    durationMs: 5400,
    rotationDurationMs: 28000,
    pulseDurationMs: 4600,
    strokeWidth: 4.5,
    roseA: 9.2,
    roseABoost: 0.6,
    roseBreathBase: 0.72,
    roseBreathBoost: 0.28,
    roseK: 5,
    roseScale: 3.25,
  };

  /* ---------- 曲线公式：r(t) = (a + bs)(c + ds)·cos(kt) ---------- */
  function point(progress, detailScale) {
    var t = progress * Math.PI * 2;
    var a = config.roseA + detailScale * config.roseABoost;
    var k = Math.round(config.roseK);
    var r = a * (config.roseBreathBase + detailScale * config.roseBreathBoost) * Math.cos(k * t);
    return {
      x: 50 + Math.cos(t) * r * config.roseScale,
      y: 50 + Math.sin(t) * r * config.roseScale,
    };
  }

  path.setAttribute('stroke-width', String(config.strokeWidth));

  /* ---------- 粒子 ---------- */
  var particles = [];
  for (var i = 0; i < config.particleCount; i++) {
    var circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('fill', 'currentColor');
    group.appendChild(circle);
    particles.push(circle);
  }

  function normalizeProgress(p) {
    return ((p % 1) + 1) % 1;
  }

  function getDetailScale(time) {
    var pulseProgress = (time % config.pulseDurationMs) / config.pulseDurationMs;
    var pulseAngle = pulseProgress * Math.PI * 2;
    return 0.52 + ((Math.sin(pulseAngle + 0.55) + 1) / 2) * 0.48;
  }

  function getRotation(time) {
    return -((time % config.rotationDurationMs) / config.rotationDurationMs) * 360;
  }

  function buildPath(detailScale, steps) {
    steps = steps || 480;
    var d = '';
    for (var i = 0; i <= steps; i++) {
      var pt = point(i / steps, detailScale);
      d += (i === 0 ? 'M' : 'L') + ' ' + pt.x.toFixed(2) + ' ' + pt.y.toFixed(2) + ' ';
    }
    return d;
  }

  function getParticle(index, progress, detailScale) {
    var tailOffset = index / (config.particleCount - 1);
    var pt = point(normalizeProgress(progress - tailOffset * config.trailSpan), detailScale);
    var fade = Math.pow(1 - tailOffset, 0.56);
    return {
      x: pt.x,
      y: pt.y,
      radius: 0.9 + fade * 2.7,
      opacity: 0.04 + fade * 0.96,
    };
  }

  /* ---------- 渲染循环 ---------- */
  var startedAt = performance.now();
  var rafId = null;

  function render(now) {
    var time = now - startedAt;
    var progress = (time % config.durationMs) / config.durationMs;
    var detailScale = getDetailScale(time);

    group.setAttribute('transform', 'rotate(' + getRotation(time) + ' 50 50)');
    path.setAttribute('d', buildPath(detailScale));

    for (var i = 0; i < particles.length; i++) {
      var p = getParticle(i, progress, detailScale);
      particles[i].setAttribute('cx', p.x.toFixed(2));
      particles[i].setAttribute('cy', p.y.toFixed(2));
      particles[i].setAttribute('r', p.radius.toFixed(2));
      particles[i].setAttribute('opacity', p.opacity.toFixed(3));
    }
    rafId = requestAnimationFrame(render);
  }
  rafId = requestAnimationFrame(render);

  /* ---------- 页面加载完成后隐藏（最少展示 900ms 防闪烁） ---------- */
  var MIN_SHOW_MS = 900;
  var shownAt = Date.now();
  var hidden = false;

  function hide() {
    if (hidden) return;
    hidden = true;
    var wait = Math.max(0, MIN_SHOW_MS - (Date.now() - shownAt));
    setTimeout(function () {
      cancelAnimationFrame(rafId);
      preloader.classList.add('hide');
      // 等淡出过渡结束后移出 DOM
      setTimeout(function () {
        if (preloader.parentNode) preloader.parentNode.removeChild(preloader);
      }, 600);
    }, wait);
  }

  if (document.readyState === 'complete') {
    hide();
  } else {
    window.addEventListener('load', hide);
    // 兜底：最长展示 5 秒
    setTimeout(hide, 5000);
  }
})();
