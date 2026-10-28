import { hash1, mulberry32, noise1, smoothstep, TAU } from '../random';
import type { EffectDef } from '../types';
import { bool, hexToRgb, num, rect, rectPx, rgba, str } from './util';

export const dissolve: EffectDef = {
  type: 'dissolve',
  label: '조각 분해',
  english: 'Pixel Dissolve',
  description: '사람·얼굴·사물을 파란 창, 점, 픽셀 조각으로 부숴 흩날립니다.',
  category: 'data',
  kind: 'overlay',
  params: [
    { key: 'area', label: '부술 영역', type: 'rect', default: { x: 0.3, y: 0.25, w: 0.4, h: 0.55 }, color: '#3d6bff' },
    {
      key: 'mode',
      label: '조각 모양',
      type: 'select',
      default: 'blue',
      options: [
        { value: 'blue', label: '파란 창' },
        { value: 'pixels', label: '사진 픽셀' },
        { value: 'dots', label: '점' },
        { value: 'spectrum', label: '스펙트럼 점' },
      ],
    },
    { key: 'cell', label: '조각 크기', type: 'range', min: 4, max: 80, step: 1, default: 18 },
    { key: 'density', label: '부서지는 양', type: 'range', min: 0, max: 100, step: 1, default: 55, unit: '%' },
    { key: 'edgeBias', label: '가장자리부터 부서짐', type: 'range', min: 0, max: 100, step: 1, default: 60 },
    { key: 'scatter', label: '흩어짐', type: 'range', min: 0, max: 100, step: 1, default: 30 },
    { key: 'color', label: '창 색', type: 'color', default: '#2f5bff' },
    { key: 'drift', label: '날아가기', type: 'range', min: 0, max: 100, step: 1, default: 35, group: '모션' },
    {
      key: 'driftDir',
      label: '날아가는 방향',
      type: 'select',
      default: 'up',
      group: '모션',
      options: [
        { value: 'up', label: '위로' },
        { value: 'right', label: '오른쪽' },
        { value: 'left', label: '왼쪽' },
        { value: 'out', label: '바깥으로' },
      ],
    },
  ],
  render(rc, p) {
    const { ctx, s, t, seed } = rc;
    const R = rectPx(rect(p, 'area'), rc.w, rc.h);
    const cell = Math.max(2, num(p, 'cell') * s);
    const gw = Math.max(1, Math.round(R.w / cell));
    const gh = Math.max(1, Math.round(R.h / cell));
    const g = rc.scratch(0);
    g.ctx.drawImage(rc.snapshot(), R.x, R.y, R.w, R.h, 0, 0, gw, gh);
    const data = g.ctx.getImageData(0, 0, gw, gh).data;
    const density = num(p, 'density') / 100;
    const bias = num(p, 'edgeBias') / 100;
    const scatter = (num(p, 'scatter') / 100) * cell * 3;
    const drift = (num(p, 'drift') / 100) * Math.min(rc.w, rc.h) * 0.3;
    const dir = str(p, 'driftDir');
    const mode = str(p, 'mode');
    const color = str(p, 'color');
    const cw = R.w / gw;
    const ch = R.h / gh;
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const k = y * gw + x;
        // distance from the area's centre, 0 at centre → 1 at the edge
        const ex = Math.abs((x + 0.5) / gw - 0.5) * 2;
        const ey = Math.abs((y + 0.5) / gh - 0.5) * 2;
        const edge = Math.max(ex, ey);
        const chance = density * (1 - bias + bias * edge * 1.4);
        const r = hash1(k, seed);
        if (r > chance) continue;
        const life = hash1(k, seed ^ 0x51);
        const fly = drift * smoothstep(life * 0.6, 1, t) * (0.4 + life);
        let dx = (hash1(k, seed ^ 0x13) - 0.5) * scatter;
        let dy = (hash1(k, seed ^ 0x29) - 0.5) * scatter;
        if (dir === 'up') dy -= fly;
        else if (dir === 'right') dx += fly;
        else if (dir === 'left') dx -= fly;
        else {
          dx += (ex * Math.sign((x + 0.5) / gw - 0.5) || 0.1) * fly;
          dy += (ey * Math.sign((y + 0.5) / gh - 0.5) || 0.1) * fly;
        }
        const px = R.x + x * cw + dx;
        const py = R.y + y * ch + dy;
        const i = k * 4;
        if (data[i + 3] === 0) continue;
        if (mode === 'blue') {
          const sz = cw * (0.6 + life * 0.9);
          ctx.fillStyle = rgba(color, 0.92);
          ctx.fillRect(px, py, sz, sz * 0.75);
          ctx.strokeStyle = 'rgba(220,230,255,0.8)';
          ctx.lineWidth = Math.max(0.5, 0.6 * s);
          ctx.strokeRect(px + 0.5, py + 0.5, sz - 1, sz * 0.75 - 1);
          if (sz > 10 * s) {
            ctx.fillStyle = 'rgba(235,240,255,0.85)';
            for (let l = 0; l < 3; l++) ctx.fillRect(px + 2 * s, py + (3 + l * 3) * s, sz * (0.3 + hash1(k + l, seed) * 0.5), Math.max(1, s));
          }
        } else if (mode === 'pixels') {
          ctx.fillStyle = `rgb(${data[i]},${data[i + 1]},${data[i + 2]})`;
          ctx.fillRect(px, py, cw * 0.92, ch * 0.92);
        } else {
          const lum = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
          ctx.fillStyle = mode === 'spectrum' ? `hsl(${(lum * 300 + t * 120) % 360},90%,60%)` : `rgb(${data[i]},${data[i + 1]},${data[i + 2]})`;
          ctx.beginPath();
          ctx.arc(px + cw / 2, py + ch / 2, (cw / 2) * (0.35 + lum * 0.65), 0, TAU);
          ctx.fill();
        }
      }
    }
  },
};

export const scanTerrain: EffectDef = {
  type: 'scanTerrain',
  label: '스캔라인 지형',
  english: 'Scanline Terrain',
  description: '밝기를 높이로 바꿔 가로선 지형도를 그립니다. 라이다 스캔·음파 지도 같은 화면.',
  category: 'data',
  kind: 'overlay',
  params: [
    { key: 'lines', label: '선 개수', type: 'range', min: 10, max: 300, step: 1, default: 90 },
    { key: 'height', label: '높이', type: 'range', min: 0, max: 300, step: 1, default: 70 },
    { key: 'color', label: '선 색', type: 'color', default: '#ffffff' },
    { key: 'photoColor', label: '사진 색으로 칠하기', type: 'bool', default: false },
    { key: 'width', label: '선 굵기', type: 'range', min: 0.5, max: 4, step: 0.1, default: 1.2 },
    {
      key: 'bg',
      label: '배경',
      type: 'select',
      default: 'black',
      options: [
        { value: 'black', label: '검정 (선만 보임)' },
        { value: 'dim', label: '사진 어둡게' },
        { value: 'none', label: '사진 그대로' },
      ],
    },
    { key: 'occlude', label: '앞 선이 뒤를 가림', type: 'bool', default: true },
    { key: 'tilt', label: '원근', type: 'range', min: 0, max: 100, step: 1, default: 35 },
    { key: 'scan', label: '스캔 진행', type: 'range', min: 0, max: 100, step: 1, default: 60, group: '모션' },
    { key: 'flow', label: '물결 흐름', type: 'range', min: 0, max: 100, step: 1, default: 0, group: '모션' },
  ],
  render(rc, p) {
    const { ctx, w, h, s, t } = rc;
    const cols = 160;
    const n = num(p, 'lines');
    const g = rc.scratch(0);
    g.ctx.drawImage(rc.snapshot(), 0, 0, cols, n);
    const data = g.ctx.getImageData(0, 0, cols, n).data;
    const bg = str(p, 'bg');
    const bgColor = bg === 'black' ? '#000' : bg === 'dim' ? 'rgba(0,0,0,0.75)' : null;
    if (bgColor) {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, w, h);
    }
    const amp = num(p, 'height') * s;
    const tilt = num(p, 'tilt') / 100;
    const scan = num(p, 'scan') / 100;
    const flow = num(p, 'flow') / 100;
    const reveal = scan > 0 ? (1 - scan) + scan * Math.min(1, t * 1.25) : 1;
    const [cr, cg, cb] = hexToRgb(str(p, 'color'));
    const photo = bool(p, 'photoColor');
    ctx.lineWidth = num(p, 'width') * s;
    ctx.lineJoin = 'round';
    for (let r = 0; r < n; r++) {
      const f = r / (n - 1);
      if (f > reveal) break;
      // perspective: rows bunch up toward the top
      const yf = tilt ? Math.pow(f, 1 + tilt * 1.2) : f;
      const y0 = h * 0.08 + yf * h * 0.9;
      const near = Math.abs(f - reveal) < 0.03 && reveal < 1;
      ctx.beginPath();
      let sr = 0;
      let sg = 0;
      let sb = 0;
      for (let c = 0; c < cols; c++) {
        const i = (r * cols + c) * 4;
        const lum = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
        sr += data[i];
        sg += data[i + 1];
        sb += data[i + 2];
        const wob = flow ? Math.sin(c * 0.15 + TAU * t * 2 + r * 0.3) * flow * 0.15 : 0;
        const x = (c / (cols - 1)) * w;
        const y = y0 - (lum + wob) * amp * (0.4 + yf * 0.6);
        if (c === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      if (bool(p, 'occlude') && bgColor) {
        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        ctx.closePath();
        ctx.fillStyle = bg === 'black' ? '#000' : 'rgba(0,0,0,0.85)';
        ctx.fill();
      }
      const a = (0.35 + yf * 0.65) * (near ? 1 : 0.9);
      ctx.strokeStyle = near
        ? '#ffffff'
        : photo
          ? `rgba(${Math.min(255, (sr / cols) * 1.4)},${Math.min(255, (sg / cols) * 1.4)},${Math.min(255, (sb / cols) * 1.4)},${a})`
          : `rgba(${cr},${cg},${cb},${a})`;
      ctx.stroke();
    }
  },
};

export const pointCloud: EffectDef = {
  type: 'pointCloud',
  label: '포인트 클라우드',
  english: 'Point Cloud',
  description: '사진을 3D 점구름으로 바꿔 천천히 돌립니다. 밝은 곳이 앞으로 튀어나와요.',
  category: 'data',
  kind: 'overlay',
  params: [
    { key: 'step', label: '점 간격', type: 'range', min: 2, max: 24, step: 0.5, default: 6 },
    { key: 'depth', label: '깊이', type: 'range', min: 0, max: 600, step: 5, default: 220 },
    { key: 'size', label: '점 크기', type: 'range', min: 0.5, max: 6, step: 0.1, default: 1.6 },
    {
      key: 'colorMode',
      label: '색',
      type: 'select',
      default: 'photo',
      options: [
        { value: 'photo', label: '사진 색' },
        { value: 'mono', label: '한 가지 색' },
        { value: 'depth', label: '깊이에 따라' },
      ],
    },
    { key: 'color', label: '점 색', type: 'color', default: '#e8f4ff' },
    {
      key: 'bg',
      label: '배경',
      type: 'select',
      default: 'black',
      options: [
        { value: 'black', label: '검정' },
        { value: 'dim', label: '사진 어둡게' },
        { value: 'none', label: '사진 그대로' },
      ],
    },
    { key: 'drop', label: '빈 곳 솎아내기', type: 'range', min: 0, max: 100, step: 1, default: 25 },
    { key: 'yaw', label: '좌우 회전 (도)', type: 'range', min: 0, max: 60, step: 1, default: 18, group: '모션' },
    { key: 'pitch', label: '앞으로 기울기 (도)', type: 'range', min: -40, max: 60, step: 1, default: 20, group: '모션' },
  ],
  render(rc, p) {
    const { ctx, w, h, s, t } = rc;
    const step = Math.max(1.5, num(p, 'step') * s);
    const gw = Math.max(2, Math.round(w / step));
    const gh = Math.max(2, Math.round(h / step));
    const g = rc.scratch(0);
    g.ctx.drawImage(rc.snapshot(), 0, 0, gw, gh);
    const data = g.ctx.getImageData(0, 0, gw, gh).data;
    const bg = str(p, 'bg');
    if (bg !== 'none') {
      ctx.fillStyle = bg === 'black' ? '#000' : 'rgba(0,0,0,0.78)';
      ctx.fillRect(0, 0, w, h);
    }
    const depth = num(p, 'depth') * s;
    const yaw = ((num(p, 'yaw') * Math.PI) / 180) * Math.sin(TAU * t);
    const pitch = (num(p, 'pitch') * Math.PI) / 180;
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const focal = Math.max(w, h) * 1.6;
    const size = num(p, 'size') * s;
    const drop = num(p, 'drop') / 100;
    const mode = str(p, 'colorMode');
    const [mr, mg, mb] = hexToRgb(str(p, 'color'));
    const pts: [number, number, number, string][] = [];
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const i = (y * gw + x) * 4;
        const lum = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
        if (lum < drop * 0.5 && hash1(y * gw + x, rc.seed) < drop) continue;
        const X = (x / gw - 0.5) * w;
        const Y = (y / gh - 0.5) * h;
        const Z = (lum - 0.5) * depth;
        // yaw around Y, then pitch around X
        const x1 = X * cy + Z * sy;
        const z1 = -X * sy + Z * cy;
        const y2 = Y * cp - z1 * sp;
        const z2 = Y * sp + z1 * cp;
        const k = focal / (focal - z2);
        const color =
          mode === 'photo'
            ? `rgb(${data[i]},${data[i + 1]},${data[i + 2]})`
            : mode === 'mono'
              ? `rgba(${mr},${mg},${mb},${0.35 + lum * 0.65})`
              : `hsl(${220 - lum * 220},90%,${45 + lum * 25}%)`;
        pts.push([w / 2 + x1 * k, h / 2 + y2 * k, z2, color]);
      }
    }
    pts.sort((a, b) => a[2] - b[2]);
    for (const [x, y, z, c] of pts) {
      const k = focal / (focal - z);
      ctx.fillStyle = c;
      const r = Math.max(1, size * k);
      ctx.fillRect(x - r / 2, y - r / 2, r, r);
    }
  },
};

export const perspectiveGrid: EffectDef = {
  type: 'perspectiveGrid',
  label: '원근 그리드',
  english: 'Perspective Grid',
  description: '바닥·천장에 끝없이 이어지는 격자를 깝니다. 가상 공간·시뮬레이션 같은 느낌.',
  category: 'data',
  kind: 'overlay',
  params: [
    { key: 'horizon', label: '수평선 높이', type: 'range', min: 0, max: 100, step: 0.5, default: 48, unit: '%' },
    {
      key: 'plane',
      label: '위치',
      type: 'select',
      default: 'floor',
      options: [
        { value: 'floor', label: '바닥' },
        { value: 'ceiling', label: '천장' },
        { value: 'both', label: '바닥 + 천장' },
      ],
    },
    { key: 'cols', label: '세로선 수', type: 'range', min: 4, max: 80, step: 1, default: 24 },
    { key: 'rows', label: '가로선 수', type: 'range', min: 4, max: 60, step: 1, default: 18 },
    { key: 'color', label: '선 색', type: 'color', default: '#7dff9a' },
    { key: 'width', label: '선 굵기', type: 'range', min: 0.5, max: 4, step: 0.1, default: 1 },
    { key: 'glow', label: '빛 번짐', type: 'bool', default: true },
    { key: 'speed', label: '앞으로 흐르는 속도', type: 'range', min: 0, max: 4, step: 1, default: 1, group: '모션' },
  ],
  render(rc, p) {
    const { ctx, w, h, s, t } = rc;
    const hy = (num(p, 'horizon') / 100) * h;
    const color = str(p, 'color');
    const cols = num(p, 'cols');
    const rows = num(p, 'rows');
    const speed = num(p, 'speed');
    ctx.lineWidth = num(p, 'width') * s;
    if (bool(p, 'glow')) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 8 * s;
    }
    const draw = (sign: 1 | -1) => {
      const edge = sign === 1 ? h : 0;
      const depth = Math.abs(edge - hy);
      if (depth < 2) return;
      for (let c = -cols; c <= cols * 2; c++) {
        const x = (c / cols) * w;
        ctx.strokeStyle = rgba(color, 0.6);
        ctx.beginPath();
        ctx.moveTo(w / 2, hy);
        ctx.lineTo(w / 2 + (x - w / 2) * 3, edge);
        ctx.stroke();
      }
      const phase = (t * speed) % 1;
      for (let r = 0; r < rows; r++) {
        const z = (r + 1 - phase) / rows;
        const y = hy + sign * depth * Math.pow(z, 2.2);
        ctx.strokeStyle = rgba(color, 0.15 + 0.75 * z);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
    };
    const plane = str(p, 'plane');
    if (plane !== 'ceiling') draw(1);
    if (plane !== 'floor') draw(-1);
  },
};

export const cctv: EffectDef = {
  type: 'cctv',
  label: '감시 카메라',
  english: 'CCTV Overlay',
  description: 'REC 표시, 시간, 카메라 번호, 모서리 괄호를 얹습니다. 감시 화면·파운드 푸티지.',
  category: 'data',
  kind: 'overlay',
  params: [
    { key: 'label', label: '카메라 이름', type: 'text', default: 'CAM_04  NORTH RIDGE' },
    { key: 'date', label: '날짜', type: 'text', default: '1999-10-21' },
    { key: 'color', label: '글자 색', type: 'color', default: '#f2f2f2' },
    { key: 'size', label: '글자 크기', type: 'range', min: 8, max: 48, step: 1, default: 22 },
    { key: 'margin', label: '여백', type: 'range', min: 10, max: 120, step: 1, default: 46 },
    { key: 'brackets', label: '모서리 괄호', type: 'bool', default: true },
    { key: 'cross', label: '가운데 조준선', type: 'bool', default: true },
    { key: 'rec', label: 'REC 깜빡임', type: 'bool', default: true },
    { key: 'track', label: '추적 박스', type: 'range', min: 0, max: 8, step: 1, default: 2 },
  ],
  render(rc, p) {
    const { ctx, w, h, s, t } = rc;
    const color = str(p, 'color');
    const fs = num(p, 'size') * s;
    const m = num(p, 'margin') * s;
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, 2 * s);
    ctx.font = `500 ${fs}px "IBM Plex Mono", monospace`;
    ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 4 * s;

    if (p.rec && Math.floor(rc.time * 2) % 2 === 0) {
      ctx.fillStyle = '#ff2a2a';
      ctx.beginPath();
      ctx.arc(m + fs * 0.45, m + fs * 0.55, fs * 0.38, 0, TAU);
      ctx.fill();
      ctx.fillStyle = color;
    }
    ctx.fillText('REC', m + fs * 1.1, m);
    const secs = 17 * 3600 + 42 * 60 + 8 + rc.time;
    const hh = String(Math.floor(secs / 3600) % 24).padStart(2, '0');
    const mm = String(Math.floor(secs / 60) % 60).padStart(2, '0');
    const ss = String(Math.floor(secs) % 60).padStart(2, '0');
    const ff = String(Math.floor((secs % 1) * 30)).padStart(2, '0');
    ctx.textAlign = 'right';
    ctx.fillText(`${str(p, 'date')}  ${hh}:${mm}:${ss}:${ff}`, w - m, m);
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${Math.round(t * 100)}%  ▮▮▮▯`, w - m, h - m);
    ctx.textAlign = 'left';
    ctx.fillText(str(p, 'label'), m, h - m);

    if (p.brackets) {
      const L = Math.min(w, h) * 0.07;
      const b = m * 0.55;
      const corners: [number, number, number, number][] = [
        [b, b, 1, 1],
        [w - b, b, -1, 1],
        [b, h - b, 1, -1],
        [w - b, h - b, -1, -1],
      ];
      ctx.beginPath();
      for (const [x, y, dx, dy] of corners) {
        ctx.moveTo(x, y + dy * L);
        ctx.lineTo(x, y);
        ctx.lineTo(x + dx * L, y);
      }
      ctx.stroke();
    }
    if (p.cross) {
      const c = Math.min(w, h) * 0.03;
      ctx.beginPath();
      ctx.moveTo(w / 2 - c, h / 2);
      ctx.lineTo(w / 2 + c, h / 2);
      ctx.moveTo(w / 2, h / 2 - c);
      ctx.lineTo(w / 2, h / 2 + c);
      ctx.stroke();
    }
    const nTrack = num(p, 'track');
    ctx.font = `500 ${fs * 0.6}px "IBM Plex Mono", monospace`;
    ctx.textBaseline = 'bottom';
    for (let i = 0; i < nTrack; i++) {
      const rng = mulberry32(rc.seed + i * 97);
      const bw = w * (0.12 + rng() * 0.18);
      const bh = bw * (1.2 + rng() * 0.8);
      const x = w * 0.1 + rng() * (w * 0.8 - bw) + noise1(t * 3 + i * 10, rc.seed) * 20 * s;
      const y = h * 0.2 + rng() * (h * 0.6 - bh) + noise1(t * 3 + i * 10 + 5, rc.seed) * 14 * s;
      ctx.strokeStyle = i % 2 ? '#43ff6b' : color;
      ctx.fillStyle = ctx.strokeStyle;
      ctx.strokeRect(x, y, bw, bh);
      ctx.fillText(`ID ${String(1000 + Math.floor(rng() * 8999))}  ${(0.7 + rng() * 0.29).toFixed(2)}`, x, y - 3 * s);
    }
  },
};

export const editorial: EffectDef = {
  type: 'editorial',
  label: '에디토리얼 라벨',
  english: 'Editorial Labels',
  description: '모서리에 작은 제목·번호·좌표·바코드를 얹어 포스터/매거진처럼 정리합니다.',
  category: 'text',
  kind: 'overlay',
  params: [
    { key: 'title', label: '왼쪽 위', type: 'text', default: 'WHERE MACHINES DREAM' },
    { key: 'index', label: '오른쪽 위', type: 'text', default: 'N°042' },
    { key: 'foot', label: '왼쪽 아래', type: 'text', default: '45.8150° N, 15.9819° E' },
    { key: 'note', label: '오른쪽 아래', type: 'text', default: 'SOUND / IDENTITY / 2026' },
    { key: 'color', label: '글자 색', type: 'color', default: '#ffffff' },
    { key: 'size', label: '글자 크기', type: 'range', min: 8, max: 40, step: 1, default: 17 },
    { key: 'margin', label: '여백', type: 'range', min: 10, max: 140, step: 1, default: 44 },
    { key: 'frame', label: '안쪽 테두리 선', type: 'bool', default: false },
    { key: 'barcode', label: '바코드', type: 'bool', default: true },
    { key: 'marks', label: '재단 표시', type: 'bool', default: true },
  ],
  render(rc, p) {
    const { ctx, w, h, s } = rc;
    const color = str(p, 'color');
    const fs = num(p, 'size') * s;
    const m = num(p, 'margin') * s;
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, s);
    ctx.font = `500 ${fs}px "IBM Plex Mono", monospace`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${fs * 0.08}px`;
    ctx.textBaseline = 'top';
    ctx.fillText(str(p, 'title'), m, m);
    ctx.textAlign = 'right';
    ctx.fillText(str(p, 'index'), w - m, m);
    ctx.textBaseline = 'bottom';
    ctx.fillText(str(p, 'note'), w - m, h - m);
    ctx.textAlign = 'left';
    ctx.fillText(str(p, 'foot'), m, h - m);
    if (p.frame) ctx.strokeRect(m * 0.6, m * 0.6, w - m * 1.2, h - m * 1.2);
    if (p.barcode) {
      const bw = w * 0.16;
      const bh = fs * 1.6;
      const bx = w - m - bw;
      const by = h - m - fs * 1.5 - bh;
      let x = 0;
      let i = 0;
      while (x < bw) {
        const lw = (1 + Math.floor(hash1(i, rc.seed) * 3)) * s;
        if (i % 2 === 0) ctx.fillRect(bx + x, by, lw, bh);
        x += lw + s;
        i++;
      }
    }
    if (p.marks) {
      const c = m * 0.35;
      const pts: [number, number][] = [
        [m * 0.5, m * 0.5],
        [w - m * 0.5, m * 0.5],
        [m * 0.5, h - m * 0.5],
        [w - m * 0.5, h - m * 0.5],
      ];
      ctx.beginPath();
      for (const [x, y] of pts) {
        ctx.moveTo(x - c, y);
        ctx.lineTo(x + c, y);
        ctx.moveTo(x, y - c);
        ctx.lineTo(x, y + c);
      }
      ctx.stroke();
    }
  },
};

export const lightLeak: EffectDef = {
  type: 'lightLeak',
  label: '빛 번짐',
  english: 'Light Leak',
  description: '필름에 빛이 새어 들어온 듯한 색 번짐이 화면을 천천히 지나갑니다.',
  category: 'color',
  kind: 'overlay',
  defaultBlend: 'screen',
  params: [
    {
      key: 'palette',
      label: '색',
      type: 'select',
      default: 'warm',
      options: [
        { value: 'warm', label: '따뜻한 주황' },
        { value: 'cool', label: '차가운 청록' },
        { value: 'rainbow', label: '무지개' },
        { value: 'custom', label: '직접 고르기' },
      ],
    },
    { key: 'custom', label: '직접 고른 색', type: 'color', default: '#ff3d6e' },
    { key: 'amount', label: '세기', type: 'range', min: 0, max: 100, step: 1, default: 55 },
    { key: 'size', label: '크기', type: 'range', min: 10, max: 150, step: 1, default: 70 },
    { key: 'blobs', label: '빛 덩어리 수', type: 'range', min: 1, max: 6, step: 1, default: 3 },
    { key: 'flash', label: '번쩍임', type: 'range', min: 0, max: 100, step: 1, default: 0, group: '모션' },
  ],
  render(rc, p) {
    const { ctx, w, h, t, seed } = rc;
    const pal = str(p, 'palette');
    const colors =
      pal === 'warm' ? ['#ff6a1f', '#ffb347', '#ff2e4d'] : pal === 'cool' ? ['#28e0ff', '#3d6bff', '#a0fff0'] : pal === 'rainbow' ? ['#ff2e63', '#ffd23f', '#3dffb0', '#3d6bff'] : [str(p, 'custom')];
    const amt = num(p, 'amount') / 100;
    const size = (num(p, 'size') / 100) * Math.max(w, h);
    const n = num(p, 'blobs');
    for (let i = 0; i < n; i++) {
      const ph = hash1(i, seed) * TAU;
      const x = w * (0.5 + 0.6 * Math.sin(TAU * t + ph));
      const y = h * (0.5 + 0.5 * Math.cos(TAU * t * 0.5 + ph * 1.7));
      const r = size * (0.5 + hash1(i, seed ^ 7) * 0.7);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const c = colors[i % colors.length];
      g.addColorStop(0, rgba(c, 0.85 * amt));
      g.addColorStop(0.45, rgba(c, 0.35 * amt));
      g.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    const flash = num(p, 'flash') / 100;
    if (flash > 0) {
      const f = Math.pow(Math.max(0, Math.sin(TAU * t)), 24);
      ctx.fillStyle = `rgba(255,248,235,${f * flash})`;
      ctx.fillRect(0, 0, w, h);
    }
  },
};
