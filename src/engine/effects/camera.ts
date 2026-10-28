import { easeInOut, noise1, TAU } from '../random';
import type { EffectDef } from '../types';
import { bool, num, str } from './util';

export const camera: EffectDef = {
  type: 'camera',
  label: '카메라 무브',
  english: 'Camera Move',
  category: 'camera',
  description: '여기까지의 결과 전체를 천천히 줌·팬·흔들기. 이 레이어 아래(나중)에 있는 효과는 고정됩니다.',
  params: [
    {
      key: 'move',
      label: '움직임',
      type: 'select',
      default: 'zoomIn',
      options: [
        { value: 'zoomIn', label: '줌 인' },
        { value: 'zoomOut', label: '줌 아웃' },
        { value: 'panLeft', label: '← 팬' },
        { value: 'panRight', label: '→ 팬' },
        { value: 'panUp', label: '↑ 틸트' },
        { value: 'panDown', label: '↓ 틸트' },
        { value: 'drift', label: '부유 (루프)' },
        { value: 'none', label: '없음' },
      ],
    },
    { key: 'amount', label: '움직임 크기', type: 'range', min: 0, max: 40, step: 0.5, default: 8, unit: '%' },
    { key: 'smooth', label: '부드러운 가감속', type: 'bool', default: true },
    { key: 'pingpong', label: '왕복 (루프용)', type: 'bool', default: false },
    { key: 'rotate', label: '회전 흔들림 (도)', type: 'range', min: 0, max: 5, step: 0.1, default: 0 },
    { key: 'shake', label: '핸드헬드 흔들림', type: 'range', min: 0, max: 30, step: 1, default: 0 },
  ],
  render(rc, p) {
    const { ctx, w, h, t, s } = rc;
    const move = str(p, 'move');
    const A = num(p, 'amount') / 100;
    let u = bool(p, 'pingpong') ? 0.5 - 0.5 * Math.cos(TAU * t) : t;
    if (bool(p, 'smooth') && !bool(p, 'pingpong')) u = easeInOut(u);

    let scale = 1;
    let fx = 0; // -1..1 of the available margin
    let fy = 0;
    switch (move) {
      case 'zoomIn':
        scale = 1 + A * u;
        break;
      case 'zoomOut':
        scale = 1 + A * (1 - u);
        break;
      case 'panLeft':
      case 'panRight':
        scale = 1 + A;
        fx = (move === 'panLeft' ? -1 : 1) * (1 - 2 * u);
        break;
      case 'panUp':
      case 'panDown':
        scale = 1 + A;
        fy = (move === 'panUp' ? -1 : 1) * (1 - 2 * u);
        break;
      case 'drift':
        scale = 1 + A;
        fx = Math.sin(TAU * t) * 0.8;
        fy = Math.sin(TAU * t * 2 + 1.1) * 0.5;
        break;
    }

    const rot = ((num(p, 'rotate') * Math.PI) / 180) * Math.sin(TAU * t + 0.6);
    const shake = num(p, 'shake') * s;
    const sx = shake * (noise1(rc.time * 6, rc.seed) - 0.5) * 2;
    const sy = shake * (noise1(rc.time * 6 + 50, rc.seed) - 0.5) * 2;
    // grow enough to keep the frame covered while rotated and shaken
    const ratio = Math.max(w / h, h / w);
    const cover = Math.abs(Math.cos(rot)) + ratio * Math.abs(Math.sin(rot)) + (2 * shake) / Math.min(w, h);
    const total = scale * cover;
    if (total === 1 && sx === 0 && sy === 0) return;

    const marginX = ((scale - 1) * w) / 2;
    const marginY = ((scale - 1) * h) / 2;
    const snap = rc.snapshot();
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingQuality = 'high';
    ctx.translate(w / 2 + fx * marginX + sx, h / 2 + fy * marginY + sy);
    ctx.rotate(rot);
    ctx.scale(total, total);
    ctx.drawImage(snap, -w / 2, -h / 2);
  },
};
