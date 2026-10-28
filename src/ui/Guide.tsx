import { createPortal } from 'react-dom';
import { Check, X } from 'lucide-react';
import type { Tool } from './ToolRail';

interface Props {
  hasPhoto: boolean;
  selections: number;
  layers: number;
  onGo: (tool: Tool) => void;
  onAddEffect: () => void;
  onExport: () => void;
}

export const SHORTCUTS: [string, string][] = [
  ['1 – 5', '왼쪽 도구 바꾸기'],
  ['Space', '재생 / 정지'],
  ['⌘Z · ⇧⌘Z', '되돌리기 · 다시'],
  ['⌘D', '레이어 복제'],
  ['Delete', '레이어 · 선택 삭제'],
  ['Esc', '고른 것 해제'],
  ['← ↑ → ↓', '영역 상자 미세 이동 (Shift 크게)'],
  ['Shift+클릭', '선택에 더하기'],
  ['Option+클릭', '선택에서 빼기 · 브러시 지우개'],
];

/** Right panel when nothing is selected: the four steps, with progress. */
export function Guide({ hasPhoto, selections, layers, onGo, onAddEffect, onExport }: Props) {
  const steps = [
    { done: hasPhoto, title: '사진 고르기', text: '올리거나, 샘플이나 AI로 만들어요.', action: () => onGo('photo'), label: '사진' },
    { done: selections > 0, title: '물체 선택 (선택 사항)', text: '사진에서 물체를 클릭하면 이름 붙은 선택이 생겨요.', action: () => onGo('select'), label: '선택' },
    { done: layers > 0, title: '효과 넣기', text: '전체에, 또는 고른 물체에만. 프리셋으로 한 번에 깔아도 돼요.', action: onAddEffect, label: '효과 추가' },
    { done: false, title: '내보내기', text: 'PNG 이미지나 MP4 영상으로 저장해요.', action: onExport, label: '내보내기' },
  ];
  const next = steps.findIndex((s) => !s.done);
  return (
    <div className="inspector guide">
      <h3>이렇게 만들어요</h3>
      <ol className="steps">
        {steps.map((s, i) => (
          <li key={s.title} className={`${s.done ? 'done' : ''} ${i === next ? 'next' : ''}`}>
            <span className="step-num">{s.done ? <Check size={13} /> : i + 1}</span>
            <div>
              <strong>{s.title}</strong>
              <p>{s.text}</p>
              {i === next && (
                <button className="primary small" onClick={s.action}>
                  {s.label}
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>
      <p className="hint">왼쪽 목록에서 효과나 선택을 누르면, 여기서 자세히 조절할 수 있어요.</p>
      <div className="shortcuts">
        {SHORTCUTS.map(([k, v]) => (
          <div key={k}>
            <kbd>{k}</kbd>
            <span>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HelpModal({ onClose }: { onClose: () => void }) {
  return createPortal(
    <div className="sl-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sl-modal help-modal" role="dialog" aria-label="도움말">
        <div className="sl-modal-head">
          <h2>사용법</h2>
          <button className="icon-btn" onClick={onClose} aria-label="닫기">
            <X size={18} />
          </button>
        </div>
        <ol className="help-list">
          <li>
            <b>사진</b> — 사진을 올리고 크기(4:5, 9:16…)와 구도를 정해요.
          </li>
          <li>
            <b>선택</b> — 캔버스에서 물체를 클릭하면 “물체 1”처럼 저장돼요. 하늘·사람·밝은 곳은 버튼 한 번. 브러시로 다듬고, Shift/Option+클릭으로 더하거나 빼요.
          </li>
          <li>
            <b>효과</b> — “효과 추가”에서 내 사진으로 미리 보고 골라요. 선택에서 “효과 넣기”를 누르면 그 물체에만 들어가요. 레이어마다 오른쪽 “적용 대상”에서 언제든 바꿀 수 있어요.
          </li>
          <li>
            <b>오려서 띄우기</b> — 고른 물체를 오려 옮기고, 키우고, 여러 개로 복제하고, 둥둥 띄워요.
          </li>
          <li>
            <b>영상에서 따라가기</b> — 영상을 베이스로 올리고 물체를 고른 뒤 “따라가기”를 누르면, 마스크가 프레임마다 물체를 따라가요 (로토스코프).
          </li>
          <li>
            <b>프리셋</b> — 레시피 22개와 @mezotes 피드 프리셋 854개로 한 번에 시작해요.
          </li>
          <li>
            <b>내보내기</b> — 지금 프레임을 PNG로, 전체를 MP4 영상으로.
          </li>
        </ol>
        <div className="shortcuts">
          {SHORTCUTS.map(([k, v]) => (
            <div key={k}>
              <kbd>{k}</kbd>
              <span>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
