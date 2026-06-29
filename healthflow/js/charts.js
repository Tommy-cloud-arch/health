/**
 * charts.js
 * HealthFlow SVG 차트 렌더링 유틸리티 (외부 라이브러리 없음)
 * window.HealthFlowCharts 네임스페이스로 노출한다.
 * - renderRingChart : 단일 값 링(도넛) 차트 — BMI, 달성률 등
 * - renderBarChart : 막대 차트 — 매크로 영양소 등
 * - renderLineChart : 라인 차트 — 체중 추이 등
 * - renderDonutChart : 다중 세그먼트 도넛 차트 — 매크로 비율 등
 * 모든 차트는 SVG로 그려지며 viewBox 기반으로 반응형이다.
 */

(function (global) {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';

  // ---------------------------------------------------------------------
  // 내부 유틸
  // ---------------------------------------------------------------------

  /**
   * 컨테이너 엘리먼트를 id로 안전하게 가져온다.
   * @param {string} containerId
   * @returns {HTMLElement|null}
   */
  function getContainer(containerId) {
    const el = document.getElementById(containerId);
    if (!el) {
      console.warn(`[HealthFlowCharts] 컨테이너 "#${containerId}"를 찾을 수 없습니다.`);
    }
    return el;
  }

  /**
   * SVG 엘리먼트를 생성한다.
   * @param {string} tag
   * @param {object} attrs
   * @returns {SVGElement}
   */
  function svgEl(tag, attrs) {
    const el = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach((key) => {
      el.setAttribute(key, attrs[key]);
    });
    return el;
  }

  /**
   * CSS 변수 색상값을 읽는다 (fallback 포함).
   * @param {string} varName
   * @param {string} fallback
   * @returns {string}
   */
  function cssVar(varName, fallback) {
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue(varName);
      return v && v.trim() !== '' ? v.trim() : fallback;
    } catch (err) {
      return fallback;
    }
  }

  // ---------------------------------------------------------------------
  // 1. 링 차트 (단일 값, 0~max)
  // ---------------------------------------------------------------------

  /**
   * 링(도넛) 차트를 렌더링한다. BMI, 주간 달성률 등 단일 값 표시에 사용.
   * @param {string} containerId
   * @param {number} value
   * @param {number} max
   * @param {object} options - { size, strokeWidth, color, label, unit, animate }
   */
  function renderRingChart(containerId, value, max, options) {
    const container = getContainer(containerId);
    if (!container) return;

    const opts = Object.assign(
      {
        size: 160,
        strokeWidth: 14,
        color: cssVar('--color-primary', '#0D9488'),
        label: '',
        unit: '',
        animate: true
      },
      options || {}
    );

    const safeMax = max > 0 ? max : 1;
    const ratio = Math.max(0, Math.min(1, value / safeMax));

    const size = opts.size;
    const sw = opts.strokeWidth;
    const radius = (size - sw) / 2;
    const center = size / 2;
    const circumference = 2 * Math.PI * radius;
    const dashTarget = circumference * ratio;

    container.innerHTML = '';

    const svg = svgEl('svg', {
      viewBox: `0 0 ${size} ${size}`,
      class: 'hf-chart-svg',
      role: 'img',
      'aria-label': `${opts.label} ${value}${opts.unit}`
    });

    const bg = svgEl('circle', {
      class: 'hf-ring-bg',
      cx: center,
      cy: center,
      r: radius,
      'stroke-width': sw
    });

    const fill = svgEl('circle', {
      class: 'hf-ring-fill',
      cx: center,
      cy: center,
      r: radius,
      stroke: opts.color,
      'stroke-width': sw,
      'stroke-dasharray': `${circumference} ${circumference}`,
      'stroke-dashoffset': circumference,
      transform: `rotate(-90 ${center} ${center})`
    });

    const valueText = svgEl('text', {
      class: 'hf-ring-center__value',
      x: center,
      y: opts.label ? center - 4 : center,
      'text-anchor': 'middle',
      'dominant-baseline': 'middle'
    });
    valueText.textContent = `${value}${opts.unit}`;

    svg.appendChild(bg);
    svg.appendChild(fill);
    svg.appendChild(valueText);

    if (opts.label) {
      const labelText = svgEl('text', {
        class: 'hf-ring-center__label',
        x: center,
        y: center + 16,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle'
      });
      labelText.textContent = opts.label;
      svg.appendChild(labelText);
    }

    container.appendChild(svg);

    // 애니메이션: 다음 프레임에 목표 dashoffset으로 전환
    if (opts.animate) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          fill.style.setProperty('stroke-dashoffset', circumference - dashTarget);
        });
      });
    } else {
      fill.setAttribute('stroke-dashoffset', circumference - dashTarget);
    }
  }

  // ---------------------------------------------------------------------
  // 2. 막대 차트
  // ---------------------------------------------------------------------

  /**
   * 막대 차트를 렌더링한다. 매크로 영양소 비교 등에 사용.
   * @param {string} containerId
   * @param {Array<{label:string, value:number, color:string}>} data
   * @param {object} options - { height, barWidth, showLabels, animate }
   */
  function renderBarChart(containerId, data, options) {
    const container = getContainer(containerId);
    if (!container) return;

    const opts = Object.assign(
      {
        height: 160,
        barWidth: 36,
        showLabels: true,
        animate: true
      },
      options || {}
    );

    if (!Array.isArray(data) || data.length === 0) {
      container.innerHTML = '';
      return;
    }

    const maxValue = Math.max(...data.map((d) => d.value), 1) * 1.15;

    container.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.className = 'hf-bar-chart';
    wrap.style.height = `${opts.height}px`;

    data.forEach((d) => {
      const col = document.createElement('div');
      col.className = 'hf-bar-chart__col';

      const valueLabel = document.createElement('div');
      valueLabel.className = 'hf-bar-chart__value';
      valueLabel.textContent = `${d.value}%`;

      const track = document.createElement('div');
      track.className = 'hf-bar-chart__track';

      const bar = document.createElement('div');
      bar.className = 'hf-bar-chart__bar';
      bar.style.backgroundColor = d.color || cssVar('--color-primary', '#0D9488');
      bar.style.maxWidth = `${opts.barWidth}px`;
      bar.style.height = opts.animate ? '0%' : `${(d.value / maxValue) * 100}%`;

      track.appendChild(bar);
      col.appendChild(valueLabel);
      col.appendChild(track);

      if (opts.showLabels) {
        const labelEl = document.createElement('div');
        labelEl.className = 'hf-bar-chart__label';
        labelEl.textContent = d.label;
        col.appendChild(labelEl);
      }

      wrap.appendChild(col);

      if (opts.animate) {
        const targetHeight = `${(d.value / maxValue) * 100}%`;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            bar.style.height = targetHeight;
          });
        });
      }
    });

    container.appendChild(wrap);
  }

  // ---------------------------------------------------------------------
  // 3. 라인 차트
  // ---------------------------------------------------------------------

  /**
   * 라인 차트를 렌더링한다. 체중 추이 등 시계열 데이터에 사용.
   * @param {string} containerId
   * @param {Array<{x:string, y:number}>} data
   * @param {object} options - { width, height, color, showDots, showGrid, animate }
   */
  function renderLineChart(containerId, data, options) {
    const container = getContainer(containerId);
    if (!container) return;

    const opts = Object.assign(
      {
        width: 320,
        height: 180,
        color: cssVar('--color-primary', '#0D9488'),
        showDots: true,
        showGrid: true,
        animate: true
      },
      options || {}
    );

    container.innerHTML = '';

    if (!Array.isArray(data) || data.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'chart-caption';
      empty.textContent = '표시할 데이터가 없습니다.';
      container.appendChild(empty);
      return;
    }

    const width = opts.width;
    const height = opts.height;
    const padding = { top: 24, right: 16, bottom: 24, left: 16 };
    const innerW = width - padding.left - padding.right;
    const innerH = height - padding.top - padding.bottom;

    const values = data.map((d) => d.y);
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (min === max) {
      min -= 1;
      max += 1;
    }
    const range = max - min;
    const pad = range * 0.15;
    min -= pad;
    max += pad;

    const stepX = data.length > 1 ? innerW / (data.length - 1) : 0;

    const coords = data.map((d, i) => {
      const x = padding.left + stepX * i;
      const y = padding.top + innerH - ((d.y - min) / (max - min)) * innerH;
      return { x, y, label: d.x, value: d.y };
    });

    const pathD = coords.map((c, i) => (i === 0 ? `M ${c.x} ${c.y}` : `L ${c.x} ${c.y}`)).join(' ');
    const areaD = `${pathD} L ${coords[coords.length - 1].x} ${padding.top + innerH} L ${coords[0].x} ${padding.top + innerH} Z`;

    const svg = svgEl('svg', {
      viewBox: `0 0 ${width} ${height}`,
      class: 'hf-chart-svg',
      preserveAspectRatio: 'xMidYMid meet'
    });

    // 그라디언트 정의
    const gradId = `hfLineGrad-${containerId}`;
    const defs = svgEl('defs', {});
    const gradient = svgEl('linearGradient', { id: gradId, x1: '0', y1: '0', x2: '0', y2: '1' });
    const stop1 = svgEl('stop', { offset: '0%', 'stop-color': opts.color, 'stop-opacity': '0.35' });
    const stop2 = svgEl('stop', { offset: '100%', 'stop-color': opts.color, 'stop-opacity': '0' });
    gradient.appendChild(stop1);
    gradient.appendChild(stop2);
    defs.appendChild(gradient);
    svg.appendChild(defs);

    // 그리드 라인
    if (opts.showGrid) {
      [0, 0.5, 1].forEach((t) => {
        const y = padding.top + innerH * t;
        svg.appendChild(
          svgEl('line', {
            class: 'hf-line-chart__grid',
            x1: padding.left,
            y1: y,
            x2: width - padding.right,
            y2: y
          })
        );
      });
    }

    // 영역 채우기
    const area = svgEl('path', { class: 'hf-line-chart__area', d: areaD, fill: `url(#${gradId})` });
    svg.appendChild(area);

    // 라인 패스
    const totalLength = pathD.length * 2; // 근사값(애니메이션용)
    const path = svgEl('path', {
      class: 'hf-line-chart__path',
      d: pathD,
      stroke: opts.color
    });
    svg.appendChild(path);

    // 점 + 라벨
    coords.forEach((c) => {
      if (opts.showDots) {
        svg.appendChild(
          svgEl('circle', {
            class: 'hf-line-chart__dot',
            cx: c.x,
            cy: c.y,
            r: 4,
            fill: opts.color
          })
        );
      }
      const valueLabel = svgEl('text', {
        class: 'hf-line-chart__value-label',
        x: c.x,
        y: c.y - 10,
        'text-anchor': 'middle'
      });
      valueLabel.textContent = c.value;
      svg.appendChild(valueLabel);

      const xLabel = svgEl('text', {
        class: 'hf-line-chart__label',
        x: c.x,
        y: height - 4,
        'text-anchor': 'middle'
      });
      xLabel.textContent = c.label;
      svg.appendChild(xLabel);
    });

    container.appendChild(svg);

    if (opts.animate) {
      try {
        const pathLength = path.getTotalLength();
        path.style.strokeDasharray = `${pathLength}`;
        path.style.strokeDashoffset = `${pathLength}`;
        area.style.opacity = '0';
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            path.style.transition = 'stroke-dashoffset 1s ease';
            path.style.strokeDashoffset = '0';
            area.style.transition = 'opacity 1s ease';
            area.style.opacity = '0.5';
          });
        });
      } catch (err) {
        // getTotalLength 미지원 환경 대비 (애니메이션 생략, 정상 렌더는 유지)
      }
    }
  }

  // ---------------------------------------------------------------------
  // 4. 도넛 차트 (다중 세그먼트)
  // ---------------------------------------------------------------------

  /**
   * 다중 세그먼트 도넛 차트를 렌더링한다. 매크로 비율(탄/단/지) 등에 사용.
   * @param {string} containerId
   * @param {Array<{label:string, value:number, color:string}>} segments
   * @param {object} options - { size, strokeWidth, animate }
   */
  function renderDonutChart(containerId, segments, options) {
    const container = getContainer(containerId);
    if (!container) return;

    const opts = Object.assign(
      {
        size: 160,
        strokeWidth: 18,
        animate: true
      },
      options || {}
    );

    container.innerHTML = '';

    if (!Array.isArray(segments) || segments.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'chart-caption';
      empty.textContent = '표시할 데이터가 없습니다.';
      container.appendChild(empty);
      return;
    }

    const size = opts.size;
    const sw = opts.strokeWidth;
    const radius = (size - sw) / 2;
    const center = size / 2;
    const circumference = 2 * Math.PI * radius;
    const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;

    const svg = svgEl('svg', {
      viewBox: `0 0 ${size} ${size}`,
      class: 'hf-chart-svg'
    });

    const bg = svgEl('circle', {
      class: 'hf-donut-bg',
      cx: center,
      cy: center,
      r: radius,
      'stroke-width': sw
    });
    svg.appendChild(bg);

    let offsetAccum = 0;
    const segmentEls = [];

    segments.forEach((seg) => {
      const ratio = seg.value / total;
      const dash = ratio * circumference;
      const gap = circumference - dash;
      const dashOffset = circumference * 0.25 - offsetAccum; // 12시 방향에서 시작
      offsetAccum += dash;

      const segEl = svgEl('circle', {
        class: 'hf-donut-segment',
        cx: center,
        cy: center,
        r: radius,
        stroke: seg.color,
        'stroke-width': sw,
        'stroke-dasharray': opts.animate ? `0 ${circumference}` : `${dash} ${gap}`,
        'stroke-dashoffset': dashOffset,
        transform: `rotate(-90 ${center} ${center})`
      });

      svg.appendChild(segEl);
      segmentEls.push({ el: segEl, dash, gap });
    });

    container.appendChild(svg);

    // 범례
    const legend = document.createElement('div');
    legend.className = 'chart-legend';
    segments.forEach((seg) => {
      const item = document.createElement('span');
      item.className = 'chart-legend__item';
      const dot = document.createElement('span');
      dot.className = 'chart-legend__dot';
      dot.style.backgroundColor = seg.color;
      const pct = Math.round((seg.value / total) * 100);
      item.appendChild(dot);
      item.appendChild(document.createTextNode(`${seg.label} ${pct}%`));
      legend.appendChild(item);
    });
    container.appendChild(legend);

    if (opts.animate) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          segmentEls.forEach(({ el, dash, gap }) => {
            el.setAttribute('stroke-dasharray', `${dash} ${gap}`);
          });
        });
      });
    }
  }

  // ---------------------------------------------------------------------
  // 전역 노출
  // ---------------------------------------------------------------------
  global.HealthFlowCharts = {
    renderRingChart,
    renderBarChart,
    renderLineChart,
    renderDonutChart
  };

})(typeof window !== 'undefined' ? window : globalThis);
