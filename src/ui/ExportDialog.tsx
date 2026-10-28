import { createPortal } from 'react-dom';
import { useRef, useState } from 'react';
import { exportPng, exportVideo, type VideoProgress } from '../engine/export';
import { seekVideos } from '../engine/video';
import { getFormat } from '../engine/renderer';
import type { Project } from '../engine/types';

interface Props {
  project: Project;
  time: number;
  onClose: () => void;
}

export function ExportDialog({ project, time, onClose }: Props) {
  const fmt = getFormat(project.format);
  const [pngScale, setPngScale] = useState(1);
  const [vidScale, setVidScale] = useState(1);
  const [quality, setQuality] = useState<'high' | 'max'>('high');
  const [progress, setProgress] = useState<VideoProgress | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);

  const png = async () => {
    setBusy(true);
    setStatus('PNG 렌더링 중…');
    try {
      await exportPng(project, time, pngScale);
      setStatus(`PNG 저장 완료 · ${Math.round(fmt.width * pngScale)}×${Math.round(fmt.height * pngScale)}`);
    } catch (err) {
      setStatus(`실패: ${(err as Error).message}`);
    }
    setBusy(false);
  };

  const video = async () => {
    setBusy(true);
    setStatus('');
    abort.current = new AbortController();
    try {
      const info = await exportVideo(project, {
        scale: vidScale,
        quality,
        onProgress: setProgress,
        signal: abort.current.signal,
      });
      setStatus(`영상 저장 완료 · ${info}`);
    } catch (err) {
      const e = err as Error;
      setStatus(e.name === 'AbortError' ? '취소했습니다.' : `실패: ${e.message}`);
    }
    // export moved the videos frame by frame; put them back on the preview's frame
    await seekVideos(project, time);
    setProgress(null);
    setBusy(false);
  };

  const frames = Math.round(project.duration * project.fps);
  const pct = progress ? Math.round((progress.frame / progress.total) * 100) : 0;

  return createPortal(
    <div className="sl-backdrop" onClick={() => !busy && onClose()}>
      <div className="sl-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sl-modal-head">
          <h2>최종 아트워크 내보내기</h2>
          <button className="ghost small" onClick={onClose} disabled={busy}>
            닫기
          </button>
        </div>

        {!project.baseImageId && <p className="warn">베이스 사진이 없어 빈 배경으로 저장됩니다.</p>}

        <div className="export-grid">
          <div className="export-card">
            <div className="export-kind">이미지</div>
            <h3>PNG 스틸</h3>
            <p className="muted small">타임라인의 현재 프레임({time.toFixed(2)}초)을 저장합니다.</p>
            <label className="tl-select block">
              해상도
              <select value={pngScale} onChange={(e) => setPngScale(+e.target.value)} disabled={busy}>
                <option value={1}>
                  1× · {fmt.width}×{fmt.height}
                </option>
                <option value={2}>
                  2× · {fmt.width * 2}×{fmt.height * 2} (인쇄용)
                </option>
              </select>
            </label>
            <button className="primary" onClick={png} disabled={busy}>
              PNG 저장
            </button>
          </div>

          <div className="export-card">
            <div className="export-kind">모션</div>
            <h3>MP4 영상</h3>
            <p className="muted small">
              {project.duration}초 · {project.fps}fps · {frames}프레임을 한 장씩 렌더링해서 인코딩합니다. 인스타 업로드용 H.264.
            </p>
            <label className="tl-select block">
              해상도
              <select value={vidScale} onChange={(e) => setVidScale(+e.target.value)} disabled={busy}>
                <option value={1}>
                  1× · {fmt.width}×{fmt.height}
                </option>
                <option value={2 / 3}>
                  ⅔ · {Math.round((fmt.width * 2) / 3)}×{Math.round((fmt.height * 2) / 3)} (빠름)
                </option>
              </select>
            </label>
            <label className="tl-select block">
              화질
              <select value={quality} onChange={(e) => setQuality(e.target.value as 'high' | 'max')} disabled={busy}>
                <option value="high">높음</option>
                <option value="max">최고 (용량 큼)</option>
              </select>
            </label>
            {progress ? (
              <div className="progress-wrap">
                <div className="progress">
                  <div style={{ width: `${pct}%` }} />
                </div>
                <div className="row-between">
                  <span className="mono tiny">
                    {progress.frame}/{progress.total} 프레임 · {pct}%
                  </span>
                  <button className="ghost small" onClick={() => abort.current?.abort()}>
                    취소
                  </button>
                </div>
              </div>
            ) : (
              <button className="primary" onClick={video} disabled={busy}>
                MP4 저장
              </button>
            )}
          </div>
        </div>
        {status && <p className="status">{status}</p>}
      </div>
    </div>,
    document.body,
  );
}
