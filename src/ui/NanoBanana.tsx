import { useEffect, useRef, useState } from 'react';
import { ClipboardCopy, ExternalLink, Layers, Wand } from 'lucide-react';
import { getFormat, Renderer } from '../engine/renderer';
import type { Project, SourceImage } from '../engine/types';
import { frameOf } from '../engine/video';
import * as g from './gemini';
import { toSource } from './images';
import { Seg } from './kit';
import { SCENES, STYLE_SUFFIX } from './scenes';
import type { PromptRequest } from './Generate';

interface Props {
  project: Project;
  time: number;
  onAdd: (imgs: SourceImage[], makeBase: boolean) => void;
  incoming?: PromptRequest | null;
}

/** Edits Nano Banana is good at, phrased for the mezotes look. */
const EDITS: { id: string; label: string; prompt: string }[] = [
  { id: 'tear', label: '하늘 찢기', prompt: 'Tear the sky open like burning paper. Through the jagged hole with glowing orange ember edges, show a bright blue daytime sky with white clouds. Keep everything else in the photo exactly the same. Photorealistic.' },
  { id: 'slab', label: '땅 띄우기', prompt: 'Cut a large rectangular block out of the ground and make it float in mid-air above the hole it left, its sides showing layered soil and rock strata, a soft shadow below. Keep the rest of the scene unchanged. Photorealistic, cinematic.' },
  { id: 'melt', label: '녹아내리기', prompt: 'Make the main building (or largest object) melt and pour downward like a waterfall of its own material, stretched into long vertical drips with mist at the bottom. Keep the rest of the scene unchanged. Photorealistic.' },
  { id: 'chrome', label: '액체 크롬', prompt: 'Turn the main subject into flowing liquid chrome, like mercury, with mirror reflections of the surroundings. Keep the background unchanged. Photorealistic.' },
  { id: 'pool', label: '하늘 비친 웅덩이', prompt: 'Add a large black, perfectly still reflective pool on the ground that mirrors the sky and clouds. Keep everything else unchanged. Photorealistic.' },
  { id: 'door', label: '빛의 문', prompt: 'Place a tall, glowing white rectangular doorway of pure light standing upright in the scene, with a dark human silhouette inside it and light spilling onto the ground. Night, cinematic. Keep the scene otherwise unchanged.' },
  { id: 'window', label: '하늘 속 다른 세계', prompt: 'Insert a large floating rectangular panel in the sky that shows an upside-down copy of this landscape, with a thin shadow under it. Keep everything else unchanged. Surreal but photorealistic.' },
  { id: 'circuit', label: '회로로 덮기', prompt: 'Cover the main subject in tiny electronic components, green circuit boards, chips and thin wires, as if it were built from them. Macro detail, studio-sharp. Keep the background.' },
  { id: 'glass', label: '유리 몸', prompt: 'Make the person transparent glass, revealing intricate internal machinery and soft refractions. Keep pose, lighting and background the same. Photorealistic.' },
  { id: 'unify', label: '진짜 사진처럼 합치기', prompt: 'Make this collage look like one real photograph taken on 35mm film: unify the light, shadows, colour and grain, and blend the edges, without changing the composition or adding anything.' },
];

interface Job {
  key: string;
  model: string;
  prompt: string;
  started: number;
  finished?: number;
  error?: string;
  thumbs: string[];
  ctrl: AbortController;
}

const CANVAS = '__canvas';

function nearestAspect(format: string) {
  return g.NANO_ASPECTS.includes(format) ? format : '4:5';
}

export function NanoBanana({ project, time, onAdd, incoming }: Props) {
  const [cfg, setCfg] = useState<{ env: boolean; reachable: boolean } | null>(null);
  const [key, setKeyState] = useState(g.getKey());
  const [keyInput, setKeyInput] = useState('');
  const [mode, setMode] = useState<'create' | 'edit'>('create');
  const [modelId, setModelId] = useState(g.NANO_MODELS[0].id);
  const [custom, setCustom] = useState('');
  const model = g.NANO_MODELS.find((m) => m.id === modelId) ?? g.NANO_MODELS[0];
  const [sceneId, setSceneId] = useState(SCENES[0].id);
  const [subject, setSubject] = useState('');
  const [prompt, setPrompt] = useState(SCENES[0].prompt.replace('{subject}', SCENES[0].subject));
  const [editId, setEditId] = useState(EDITS[0].id);
  const [editPrompt, setEditPrompt] = useState(EDITS[0].prompt);
  const [styled, setStyled] = useState(true);
  const [aspect, setAspect] = useState(() => nearestAspect(project.format));
  const [size, setSize] = useState('2K');
  const [count, setCount] = useState(1);
  const [refs, setRefs] = useState<string[]>([]);
  const [asBase, setAsBase] = useState(true);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [, tick] = useState(0);
  const alive = useRef(true);

  useEffect(() => {
    g.geminiConfig().then(setCfg);
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => setAspect(nearestAspect(project.format)), [project.format]);
  useEffect(() => {
    if (model.sizes.length && !model.sizes.includes(size)) setSize(model.sizes[0]);
  }, [modelId]);

  // a feed preset sends its full prompt here too
  useEffect(() => {
    if (!incoming) return;
    setMode('create');
    setPrompt(incoming.prompt);
    setStyled(false);
    setSceneId('');
  }, [incoming]);

  // edit mode starts from the current base photo
  useEffect(() => {
    if (mode === 'edit' && !refs.length && project.baseImageId) setRefs([project.baseImageId]);
  }, [mode]);

  const running = jobs.some((j) => !j.finished);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  const hasKey = !!cfg?.env || !!key;
  const modelName = custom.trim() || model.id;
  const finalPrompt = () => {
    const base = mode === 'edit' ? editPrompt.trim() : prompt.trim();
    return mode === 'create' && styled ? `${base}, ${STYLE_SUFFIX}` : base;
  };

  const applyScene = (id: string, subj = subject) => {
    const sc = SCENES.find((s) => s.id === id)!;
    setSceneId(id);
    setPrompt(sc.prompt.replace('{subject}', subj.trim() || sc.subject));
  };

  const refImages = (): g.NanoImage[] =>
    refs.flatMap((id) => {
      if (id === CANVAS) {
        const fmt = getFormat(project.format);
        const c = new Renderer().render(project, time, Math.min(1, 1600 / Math.max(fmt.width, fmt.height)));
        return [g.toNanoImage(c, c.width, c.height)];
      }
      const src = project.images.find((i) => i.id === id);
      if (!src) return [];
      const f = frameOf(src);
      return [g.toNanoImage(f.img, f.w, f.h)];
    });

  const patch = (k: string, p: Partial<Job>) => setJobs((js) => js.map((j) => (j.key === k ? { ...j, ...p } : j)));

  const run = async () => {
    const k = Math.random().toString(36).slice(2);
    const ctrl = new AbortController();
    const text = finalPrompt();
    const job: Job = { key: k, model: custom.trim() || model.label, prompt: text, started: Date.now(), thumbs: [], ctrl };
    setJobs((js) => [job, ...js].slice(0, 12));
    let first = asBase;
    try {
      const images = mode === 'edit' || refs.length ? refImages() : [];
      if (mode === 'edit' && !images.length) throw new Error('고칠 사진을 하나 이상 골라주세요');
      const req = { model: modelName, prompt: text, images, aspect, size: model.sizes.length ? size : undefined };
      // several pictures = several independent requests in parallel
      const results = await Promise.allSettled(Array.from({ length: count }, () => g.nanoGenerate(req, ctrl.signal)));
      const thumbs: string[] = [];
      const errors: string[] = [];
      for (const r of results) {
        if (r.status === 'rejected') {
          errors.push((r.reason as Error).message);
          continue;
        }
        for (const im of r.value.images) {
          const blob = g.base64ToBlob(im);
          const src = await toSource(blob, `nano-${new Date().toISOString().slice(11, 19).replace(/:/g, '')}`);
          if (!alive.current) return;
          onAdd([src], first);
          first = false;
          thumbs.push(src.url);
        }
      }
      patch(k, { finished: Date.now(), thumbs, error: thumbs.length ? undefined : errors[0] ?? '이미지를 받지 못했어요' });
    } catch (err) {
      const e = err as Error;
      patch(k, { finished: Date.now(), error: e.name === 'AbortError' ? '취소했어요' : e.message });
    }
  };

  const [copied, setCopied] = useState('');
  /** Put the chosen reference (or the current canvas) on the clipboard as PNG, for pasting into Gemini / Higgsfield. */
  const copyImage = async () => {
    const id = refs[0] ?? CANVAS;
    let canvas: HTMLCanvasElement;
    if (id === CANVAS) {
      const fmt = getFormat(project.format);
      const r = new Renderer().render(project, time, Math.min(1, 2048 / Math.max(fmt.width, fmt.height)));
      canvas = document.createElement('canvas');
      canvas.width = r.width;
      canvas.height = r.height;
      canvas.getContext('2d')!.drawImage(r, 0, 0);
    } else {
      const src = project.images.find((i) => i.id === id);
      if (!src) return;
      const f = frameOf(src);
      canvas = document.createElement('canvas');
      canvas.width = f.w;
      canvas.height = f.h;
      canvas.getContext('2d')!.drawImage(f.img, 0, 0);
    }
    try {
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
      if (!blob) throw new Error('image');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopied(id === CANVAS ? '지금 캔버스를 복사했어요' : '사진을 복사했어요');
    } catch {
      setCopied('복사하지 못했어요 (브라우저가 막았어요). 사진을 다운로드해서 올려주세요');
    }
  };

  const toggleRef = (id: string) => setRefs((r) => (r.includes(id) ? r.filter((x) => x !== id) : [...r, id].slice(-6)));

  return (
    <div className="gen">
      {cfg && !cfg.reachable && <p className="warn">AI 생성은 로컬 서버(<code>npm run dev</code>)로 열었을 때만 돼요.</p>}
      {cfg?.reachable && (
        <div className={`key-box ${hasKey ? 'ok' : ''}`}>
          {cfg.env ? (
            <span>
              ● Google 연결됨 <em>(.env.local)</em>
            </span>
          ) : key ? (
            <>
              <span>
                ● Gemini 키 저장됨 <em>(이 브라우저)</em>
              </span>
              <button
                className="link"
                onClick={() => {
                  g.setKey('');
                  setKeyState('');
                }}
              >
                지우기
              </button>
            </>
          ) : (
            <>
              <span className="muted small">
                <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
                  aistudio.google.com/apikey
                </a>{' '}
                에서 API 키를 만들어 붙여넣으세요. 키는 이 컴퓨터의 로컬 서버로만 가요. 사용료는 Google 계정에 청구돼요.
              </span>
              <div className="key-row">
                <input type="password" className="text-input" placeholder="Gemini API 키 붙여넣기" value={keyInput} onChange={(e) => setKeyInput(e.target.value.trim())} autoComplete="off" />
                <button
                  className="primary small"
                  disabled={keyInput.length < 20}
                  onClick={() => {
                    g.setKey(keyInput);
                    setKeyState(keyInput);
                    setKeyInput('');
                  }}
                >
                  저장
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <Seg
        value={mode}
        onChange={setMode}
        options={[
          { value: 'create', label: <><Wand size={14} /> 새로 만들기</> },
          { value: 'edit', label: <><Layers size={14} /> 사진 고치기</> },
        ]}
      />

      {mode === 'create' ? (
        <>
          <div className="ctl">
            <div className="ctl-head">
              <label>장면 레시피</label>
              <span className="muted tiny">mezotes 피드 분석 기반</span>
            </div>
            <div className="chips">
              {SCENES.map((s) => (
                <button key={s.id} className={`chip ${s.id === sceneId ? 'on' : ''}`} onClick={() => applyScene(s.id)} title={s.hint}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <label className="ctl">
            <span className="ctl-head">
              <span>주제 (선택)</span>
            </span>
            <input
              className="text-input"
              placeholder="예: lone figure in a red coat, old cathedral"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              onBlur={() => sceneId && applyScene(sceneId)}
              onKeyDown={(e) => e.key === 'Enter' && sceneId && applyScene(sceneId)}
            />
          </label>
          <label className="ctl">
            <span className="ctl-head">
              <span>프롬프트</span>
              <span className="muted tiny">{prompt.length}자</span>
            </span>
            <textarea rows={5} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
          </label>
          <label className="ctl toggle-row">
            <span>필름·다큐 톤 꼬리말 붙이기</span>
            <input type="checkbox" checked={styled} onChange={(e) => setStyled(e.target.checked)} />
            <i className="toggle" />
          </label>
        </>
      ) : (
        <>
          <div className="ctl">
            <div className="ctl-head">
              <label>고치는 방법</label>
              <span className="muted tiny">글로 직접 써도 돼요</span>
            </div>
            <div className="chips">
              {EDITS.map((e) => (
                <button
                  key={e.id}
                  className={`chip ${e.id === editId ? 'on' : ''}`}
                  onClick={() => {
                    setEditId(e.id);
                    setEditPrompt(e.prompt);
                  }}
                >
                  {e.label}
                </button>
              ))}
            </div>
          </div>
          <label className="ctl">
            <span className="ctl-head">
              <span>지시문</span>
              <span className="muted tiny">영어가 가장 정확해요</span>
            </span>
            <textarea rows={5} value={editPrompt} onChange={(e) => setEditPrompt(e.target.value)} />
          </label>
        </>
      )}

      <div className="ctl">
        <div className="ctl-head">
          <label>{mode === 'edit' ? '고칠 사진 (여러 장이면 합쳐서 그려요)' : '참고 사진 (선택, 최대 6장)'}</label>
        </div>
        <div className="minithumbs">
          <button className={`mini text ${refs.includes(CANVAS) ? 'on' : ''}`} onClick={() => toggleRef(CANVAS)} title="효과까지 적용된 지금 캔버스">
            지금
            <br />
            캔버스
          </button>
          {project.images.map((img) => (
            <button key={img.id} className={`mini ${refs.includes(img.id) ? 'on' : ''}`} onClick={() => toggleRef(img.id)} title={img.name}>
              <img src={img.url} alt={img.name} />
            </button>
          ))}
        </div>
      </div>

      <div className="gen-grid">
        <label className="ctl">
          <span className="ctl-head">
            <span>모델</span>
          </span>
          <select value={modelId} onChange={(e) => setModelId(e.target.value)}>
            {g.NANO_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="ctl">
          <span className="ctl-head">
            <span>비율</span>
          </span>
          <select value={aspect} onChange={(e) => setAspect(e.target.value)}>
            {g.NANO_ASPECTS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="ctl">
          <span className="ctl-head">
            <span>해상도</span>
          </span>
          <select value={size} onChange={(e) => setSize(e.target.value)} disabled={!model.sizes.length}>
            {(model.sizes.length ? model.sizes : ['기본']).map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="ctl">
          <span className="ctl-head">
            <span>장수</span>
          </span>
          <select value={count} onChange={(e) => setCount(+e.target.value)}>
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n}장
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted tiny">{model.note}</p>
      <details className="adv">
        <summary>다른 모델 이름 직접 쓰기</summary>
        <input className="text-input" placeholder="예: gemini-3-pro-image" value={custom} onChange={(e) => setCustom(e.target.value.trim())} />
        <p className="muted tiny">Google이 새 모델을 내면 이름만 바꿔 넣으면 돼요.</p>
      </details>

      <label className="ctl toggle-row">
        <span>완성되면 바로 베이스로</span>
        <input type="checkbox" checked={asBase} onChange={(e) => setAsBase(e.target.checked)} />
        <i className="toggle" />
      </label>

      <div className="sub-route">
        <strong>API 없이 구독으로 쓰기</strong>
        <p className="muted tiny">
          Gemini 앱(Google AI 구독)이나 Higgsfield 웹(구독 크레딧)의 나노바나나에서 만들고 가져와요: ① 사진·프롬프트 복사 → ② 열어서 붙여넣고 생성 → ③ 결과 이미지를 복사(우클릭 → 이미지 복사)해서 이 창에서 <kbd>⌘V</kbd>, 또는 다운로드해서 끌어놓기.
        </p>
        <div className="btn-row">
          <button className="ghost small" onClick={() => void copyImage()} title="고른 참고 사진(없으면 지금 캔버스)을 클립보드로">
            <ClipboardCopy size={13} /> 사진 복사
          </button>
          <button
            className="ghost small"
            onClick={() => {
              void navigator.clipboard?.writeText(finalPrompt());
              setCopied('프롬프트를 복사했어요');
            }}
          >
            <ClipboardCopy size={13} /> 프롬프트 복사
          </button>
          <a className="ghost small" href="https://gemini.google.com/app" target="_blank" rel="noreferrer">
            <ExternalLink size={13} /> Gemini
          </a>
          <a className="ghost small" href="https://higgsfield.ai/" target="_blank" rel="noreferrer">
            <ExternalLink size={13} /> Higgsfield
          </a>
        </div>
        {copied && <p className="muted tiny">{copied}</p>}
      </div>

      <div className="btn-row">
        <button className="primary" disabled={!hasKey || !finalPrompt()} onClick={() => void run()}>
          {mode === 'edit' ? '고치기' : '생성하기'}
        </button>
        <button className="ghost small" onClick={() => navigator.clipboard?.writeText(finalPrompt())} title="Gemini 앱·AI Studio에 붙여넣을 수 있어요">
          프롬프트 복사
        </button>
      </div>

      {jobs.length > 0 && (
        <div className="jobs">
          {jobs.map((j) => {
            const secs = Math.round(((j.finished ?? Date.now()) - j.started) / 1000);
            return (
              <div key={j.key} className={`job ${j.error ? 'err' : ''}`}>
                <div className="job-head">
                  <span className={`dot ${j.finished ? (j.error ? 'bad' : 'ok') : 'run'}`} />
                  <strong>{j.finished ? (j.error ? '실패' : '완료') : '만드는 중'}</strong>
                  <span className="muted tiny">
                    {j.model} · {secs}s
                  </span>
                  <span className="spacer" />
                  {!j.finished && (
                    <button className="link" onClick={() => j.ctrl.abort()}>
                      취소
                    </button>
                  )}
                </div>
                <div className="job-prompt">{j.prompt}</div>
                {j.error && <div className="job-err">{j.error}</div>}
                {j.thumbs.length > 0 && (
                  <div className="job-thumbs">
                    {j.thumbs.map((u) => (
                      <img key={u} src={u} alt="" />
                    ))}
                    <span className="muted tiny">사진 목록에 추가됨</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
