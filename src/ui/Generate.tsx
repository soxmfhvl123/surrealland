import { useEffect, useRef, useState } from 'react';
import type { Project, SourceImage } from '../engine/types';
import * as hf from './hf';
import { HF_MODELS, nearestAspect } from './hfModels';
import { toSource } from './images';
import { SCENES, STYLE_SUFFIX } from './scenes';

export interface PromptRequest {
  prompt: string;
  nonce: number;
}

interface Props {
  project: Project;
  onAdd: (imgs: SourceImage[], makeBase: boolean) => void;
  incoming?: PromptRequest | null;
}

interface Job {
  key: string;
  model: string;
  prompt: string;
  status: string;
  error?: string;
  started: number;
  finished?: number;
  ids: string[];
  thumbs: string[];
}

const STATUS_LABEL: Record<string, string> = {
  uploading: '참고 사진 올리는 중',
  submitting: '요청 보내는 중',
  queued: '대기 중',
  in_progress: '생성 중',
  completed: '완료',
  failed: '실패',
  nsfw: '검열로 막힘',
  canceled: '취소됨',
  cancelled: '취소됨',
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function Generate({ project, onAdd, incoming }: Props) {
  const [cfg, setCfg] = useState<{ env: boolean; reachable: boolean } | null>(null);
  const [cred, setCred] = useState(hf.getCreds());
  const [credInput, setCredInput] = useState('');
  const [modelId, setModelId] = useState(HF_MODELS[0].id);
  const model = HF_MODELS.find((m) => m.id === modelId) ?? HF_MODELS[0];
  const [sceneId, setSceneId] = useState(SCENES[0].id);
  const [subject, setSubject] = useState('');
  const [prompt, setPrompt] = useState(SCENES[0].prompt.replace('{subject}', SCENES[0].subject));
  const [styled, setStyled] = useState(true);
  const [aspect, setAspect] = useState(() => nearestAspect(project.format, model.aspects));
  const [resolution, setResolution] = useState(model.resolutions[0]);
  const [count, setCount] = useState(1);
  const [enhance, setEnhance] = useState(false);
  const [refId, setRefId] = useState('');
  const [asBase, setAsBase] = useState(true);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [, tick] = useState(0);
  const alive = useRef(true);

  // a feed preset sends its full prompt here; it already carries its own style words
  useEffect(() => {
    if (!incoming) return;
    setPrompt(incoming.prompt);
    setStyled(false);
    setSceneId('');
  }, [incoming]);

  useEffect(() => {
    hf.hfConfig().then(setCfg);
    return () => {
      alive.current = false;
    };
  }, []);

  // keep aspect/resolution valid when the model or format changes
  useEffect(() => {
    setAspect(nearestAspect(project.format, model.aspects));
    setResolution((r) => (model.resolutions.includes(r) ? r : model.resolutions[0]));
    if (!model.edit) setRefId('');
  }, [modelId, project.format]);

  const running = jobs.some((j) => !hf.TERMINAL.includes(j.status) && !j.error);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  const applyScene = (id: string, subj = subject) => {
    const sc = SCENES.find((s) => s.id === id)!;
    setSceneId(id);
    setPrompt(sc.prompt.replace('{subject}', subj.trim() || sc.subject));
  };

  const finalPrompt = () => (styled ? `${prompt.trim()}, ${STYLE_SUFFIX}` : prompt.trim());
  const requests = model.batch?.includes(count) ? 1 : count;
  const perReq = model.batch?.includes(count) ? count : 1;
  const priceEach = parseFloat(model.price.replace(/[^0-9.]/g, '')) || 0;
  const hasKey = !!cfg?.env || !!cred;

  const patch = (key: string, p: Partial<Job>) => setJobs((js) => js.map((j) => (j.key === key ? { ...j, ...p } : j)));

  const run = async () => {
    const key = Math.random().toString(36).slice(2);
    const job: Job = { key, model: model.label, prompt: finalPrompt(), status: 'submitting', started: Date.now(), ids: [], thumbs: [] };
    setJobs((js) => [job, ...js].slice(0, 12));
    let first = asBase;
    try {
      const imageUrls: string[] = [];
      if (model.edit && refId) {
        patch(key, { status: 'uploading' });
        const img = project.images.find((i) => i.id === refId);
        if (img) imageUrls.push(await hf.upload(await (await fetch(img.url)).blob()));
      }
      patch(key, { status: 'submitting' });
      const input = model.build({ prompt: job.prompt, aspect, resolution, count: perReq, enhance, imageUrls });
      const subs = await Promise.all(Array.from({ length: requests }, () => hf.submit(model.id, input)));
      const ids = subs.map((s) => s.request_id);
      patch(key, { ids, status: 'queued' });

      const pending = new Set(ids);
      const thumbs: string[] = [];
      let lastStatus = 'queued';
      while (pending.size && alive.current) {
        await sleep(2500);
        for (const id of [...pending]) {
          const st = await hf.status(id);
          const s = String(st.status ?? 'queued');
          lastStatus = s;
          if (!hf.TERMINAL.includes(s)) continue;
          pending.delete(id);
          if (s !== 'completed') continue;
          for (const url of hf.extractMedia(st)) {
            if (/\.(mp4|mov)(\?|$)/i.test(url)) continue;
            const blob = await hf.fetchMedia(url);
            const src = await toSource(blob, `AI · ${model.label}`);
            onAdd([src], first);
            first = false;
            thumbs.push(src.url);
          }
        }
        patch(key, { status: pending.size ? (lastStatus === 'queued' ? 'queued' : 'in_progress') : thumbs.length ? 'completed' : lastStatus, thumbs: [...thumbs] });
      }
      patch(key, { finished: Date.now(), status: thumbs.length ? 'completed' : lastStatus });
    } catch (err) {
      patch(key, { error: (err as Error).message, finished: Date.now(), status: 'failed' });
    }
  };

  const cancelJob = async (j: Job) => {
    await Promise.allSettled(j.ids.map((id) => hf.cancel(id)));
    patch(j.key, { status: 'canceled', finished: Date.now() });
  };

  return (
    <div className="gen">
      {cfg && !cfg.reachable && <p className="warn">AI 생성은 로컬 서버(<code>npm run dev</code>)로 열었을 때만 돼요.</p>}
      {cfg?.reachable && (
        <div className={`key-box ${hasKey ? 'ok' : ''}`}>
          {cfg.env ? (
            <span>● Higgsfield 연결됨 <em>(.env.local)</em></span>
          ) : cred ? (
            <>
              <span>● Higgsfield 키 저장됨 <em>(이 브라우저)</em></span>
              <button
                className="link"
                onClick={() => {
                  hf.setCreds('');
                  setCred('');
                }}
              >
                지우기
              </button>
            </>
          ) : (
            <>
              <span className="muted small">
                <a href="https://open.higgsfield.ai/api-keys" target="_blank" rel="noreferrer">
                  open.higgsfield.ai/api-keys
                </a>{' '}
                에서 API 키를 만들어 그대로 붙여넣으세요. 키는 이 컴퓨터의 로컬 서버로만 가요.
              </span>
              <div className="key-row">
                <input
                  type="password"
                  className="text-input"
                  placeholder="API 키 붙여넣기"
                  value={credInput}
                  onChange={(e) => setCredInput(e.target.value.trim())}
                  autoComplete="off"
                />
                <button
                  className="primary small"
                  disabled={credInput.trim().length < 8}
                  onClick={() => {
                    hf.setCreds(credInput);
                    setCred(credInput);
                    setCredInput('');
                  }}
                >
                  저장
                </button>
              </div>
            </>
          )}
        </div>
      )}

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
          placeholder="예: lone figure in a red coat, old cathedral, 해녀"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          onBlur={() => applyScene(sceneId)}
          onKeyDown={(e) => e.key === 'Enter' && applyScene(sceneId)}
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

      <div className="gen-grid">
        <label className="ctl">
          <span className="ctl-head">
            <span>모델</span>
          </span>
          <select value={modelId} onChange={(e) => setModelId(e.target.value)}>
            {HF_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} · {m.price}
              </option>
            ))}
          </select>
        </label>
        <label className="ctl">
          <span className="ctl-head">
            <span>비율</span>
          </span>
          <select value={aspect} onChange={(e) => setAspect(e.target.value)}>
            {model.aspects.map((a) => (
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
          <select value={resolution} onChange={(e) => setResolution(e.target.value)}>
            {model.resolutions.map((r) => (
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

      {model.edit && (
        <div className="ctl">
          <div className="ctl-head">
            <label>참고 사진 (고쳐 그리기)</label>
          </div>
          <div className="minithumbs">
            <button className={`mini text ${refId === '' ? 'on' : ''}`} onClick={() => setRefId('')}>
              없음
            </button>
            {project.images.map((img) => (
              <button key={img.id} className={`mini ${refId === img.id ? 'on' : ''}`} onClick={() => setRefId(img.id)} title={img.name}>
                <img src={img.url} alt={img.name} />
              </button>
            ))}
          </div>
        </div>
      )}

      <label className="ctl toggle-row">
        <span>프롬프트 다듬기 (모델 자동 보강)</span>
        <input type="checkbox" checked={enhance} onChange={(e) => setEnhance(e.target.checked)} />
        <i className="toggle" />
      </label>
      <label className="ctl toggle-row">
        <span>완성되면 바로 베이스로</span>
        <input type="checkbox" checked={asBase} onChange={(e) => setAsBase(e.target.checked)} />
        <i className="toggle" />
      </label>

      <div className="btn-row">
        <button className="primary" disabled={!hasKey || !prompt.trim()} onClick={run}>
          생성하기 · 약 ${(priceEach * count).toFixed(3)}
        </button>
        <button className="ghost small" onClick={() => navigator.clipboard?.writeText(finalPrompt())} title="Higgsfield 웹에 붙여넣을 수 있어요">
          프롬프트 복사
        </button>
      </div>
      {!hasKey && cfg?.reachable && <p className="muted tiny">키가 없으면 프롬프트를 복사해서 Higgsfield 웹에서 만든 뒤, 결과를 “사진”에 끌어놓으세요.</p>}

      {jobs.length > 0 && (
        <div className="jobs">
          {jobs.map((j) => {
            const done = hf.TERMINAL.includes(j.status) || !!j.error;
            const secs = Math.round(((j.finished ?? Date.now()) - j.started) / 1000);
            return (
              <div key={j.key} className={`job ${j.status} ${j.error ? 'err' : ''}`}>
                <div className="job-head">
                  <span className={`dot ${done ? (j.status === 'completed' ? 'ok' : 'bad') : 'run'}`} />
                  <strong>{STATUS_LABEL[j.status] ?? j.status}</strong>
                  <span className="muted tiny">
                    {j.model} · {secs}s
                  </span>
                  <span className="spacer" />
                  {!done && j.ids.length > 0 && (
                    <button className="link" onClick={() => cancelJob(j)}>
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
