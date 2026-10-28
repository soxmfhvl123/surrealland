import { useState } from 'react';
import { FlipHorizontal, Film, ImagePlus, Images, X } from 'lucide-react';
import { FORMATS } from '../engine/renderer';
import type { Crop, Project } from '../engine/types';
import { PanelHeader, Seg, Slider, Toggle } from './kit';

interface Props {
  project: Project;
  busy: string;
  onUpload: () => void;
  onFiles: (files: FileList | File[]) => void;
  onSamples: () => void;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onCrop: (crop: Crop) => void;
  onFormat: (id: string) => void;
}

export function PhotoPanel({ project, busy, onUpload, onFiles, onSamples, onSelect, onRemove, onCrop, onFormat }: Props) {
  const [drag, setDrag] = useState(false);
  const { crop } = project;

  return (
    <div className="panel">
      <PanelHeader title="사진 · 영상" sub="작업할 사진이나 영상(베이스)을 고르고, 크기와 구도를 맞춰요." />

      <div
        className={`dropzone ${drag ? 'over' : ''}`}
        onClick={onUpload}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDrag(false);
          onFiles(e.dataTransfer.files);
        }}
      >
        <ImagePlus size={22} strokeWidth={1.6} />
        <strong>사진 · 영상 올리기</strong>
        <span>클릭하거나 끌어놓기 · 여러 개 가능 · MP4·MOV·WebM</span>
      </div>
      <div className="row-between">
        <button className="ghost small" onClick={onSamples}>
          <Images size={14} /> 샘플 사진
        </button>
        {busy && <span className="muted small">{busy}</span>}
      </div>

      {project.images.length > 0 && (
        <div className="block">
          <div className="block-title">
            내 소스 <span className="count">{project.images.length}</span>
            <span className="spacer" />
            <span className="muted tiny">누르면 베이스로</span>
          </div>
          <div className="gallery">
            {project.images.map((img) => (
              <div
                key={img.id}
                className={`thumb ${img.id === project.baseImageId ? 'active' : ''}`}
                onClick={() => onSelect(img.id)}
                title={`${img.name} · ${img.width}×${img.height}${img.video ? ` · ${img.duration?.toFixed(1)}초 영상` : ''}`}
              >
                <img src={img.url} alt={img.name} draggable={false} />
                {img.video && (
                  <span className="vid-badge">
                    <Film size={10} /> {img.duration?.toFixed(1)}s
                  </span>
                )}
                {img.id === project.baseImageId && <span className="badge">베이스</span>}
                <button
                  className="thumb-x"
                  aria-label="삭제"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(img.id);
                  }}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
          <p className="hint">다른 사진·영상은 “합성·흩뿌리기·사진 채우기” 같은 효과의 재료로 쓸 수 있어요. 영상을 베이스로 고르면 타임라인 길이가 영상 길이에 맞춰져요 (소리는 빠져요).</p>
        </div>
      )}

      <div className="block">
        <div className="block-title">크기</div>
        <Seg small value={project.format} onChange={onFormat} options={FORMATS.map((f) => ({ value: f.id, label: f.id, title: f.label }))} />
      </div>

      {project.baseImageId && (
        <div className="block">
          <div className="block-title">구도</div>
          <Slider label="확대" value={crop.zoom} min={1} max={3} step={0.01} format={(v) => `${v.toFixed(2)}×`} onChange={(zoom) => onCrop({ ...crop, zoom })} />
          <Slider label="좌우 위치" value={crop.x} min={0} max={1} step={0.005} format={(v) => `${Math.round(v * 100)}`} onChange={(x) => onCrop({ ...crop, x })} />
          <Slider label="상하 위치" value={crop.y} min={0} max={1} step={0.005} format={(v) => `${Math.round(v * 100)}`} onChange={(y) => onCrop({ ...crop, y })} />
          <Toggle label={<><FlipHorizontal size={14} /> 좌우 뒤집기</>} checked={!!crop.flip} onChange={(flip) => onCrop({ ...crop, flip })} />
          <p className="hint">캔버스를 직접 끌어도 사진이 움직여요. 물체를 선택한 뒤에 구도를 바꾸면 선택이 어긋나니, 구도를 먼저 정하세요.</p>
        </div>
      )}
    </div>
  );
}
