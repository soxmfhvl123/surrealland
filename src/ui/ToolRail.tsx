export type Tool = 'photo' | 'ai' | 'presets' | 'effects' | 'select';

export const TOOLS: { id: Tool; label: string }[] = [
  { id: 'photo', label: '사진' },
  { id: 'ai', label: 'AI' },
  { id: 'presets', label: '프리셋' },
  { id: 'effects', label: '효과' },
  { id: 'select', label: '선택' },
];

interface Props {
  tool: Tool;
  badges: Partial<Record<Tool, number>>;
  onTool: (t: Tool) => void;
}

/** Text tabs at the top of the tool panel; the count rides as a superscript. Keys 1–5 switch too. */
export function ToolRail({ tool, badges, onTool }: Props) {
  return (
    <nav className="tool-tabs" aria-label="도구">
      {TOOLS.map(({ id, label }, i) => (
        <button key={id} className={`tool-tab ${tool === id ? 'on' : ''}`} onClick={() => onTool(id)} title={`${label} (${i + 1})`} aria-pressed={tool === id}>
          {label}
          {badges[id] !== undefined && <sup>{badges[id]}</sup>}
        </button>
      ))}
    </nav>
  );
}
