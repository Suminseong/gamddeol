/**
 * 원고 판본 읽기 영역. 정규화 본문을 한 글자도 바꾸지 않고 그대로 보여 주고(공백·줄바꿈 보존),
 * 근거·검색 구간을 표시한다. 저장 오프셋은 코드포인트, 화면 강조 경계에서만 UTF-16으로 바꾼다.
 * 작가가 본문에서 고른 구간을 코드포인트 오프셋으로 돌려준다.
 */
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { cpSlice, cpToUtf16, utf16ToCp } from '../../domain/text';

export interface ReaderMark {
  id: string;
  startCp: number;
  endCp: number;
  tone: 'anchor' | 'search' | 'candidate';
}

export interface ReaderSelection {
  startCp: number;
  endCp: number;
  quote: string;
}

function offsetWithin(container: Node, node: Node, offset: number): number {
  const range = document.createRange();
  range.selectNodeContents(container);
  range.setEnd(node, offset);
  return range.toString().length;
}

export function ManuscriptReader({
  text,
  marks,
  label,
  activeMarkId,
  focusMarkId,
  onSelect,
}: {
  text: string;
  marks: ReaderMark[];
  label: string;
  activeMarkId?: string | null;
  /** 바뀔 때마다 그 표시 위치로 화면을 옮긴다. */
  focusMarkId?: string | null;
  onSelect?: (selection: ReaderSelection | null) => void;
}) {
  const textRef = useRef<HTMLDivElement>(null);

  const pieces = useMemo(() => {
    const ranges = marks
      .map((mark) => ({ ...mark, start: cpToUtf16(text, mark.startCp), end: cpToUtf16(text, mark.endCp) }))
      .filter((mark) => mark.end > mark.start);
    const points = new Set<number>([0, text.length]);
    for (const mark of ranges) {
      points.add(mark.start);
      points.add(mark.end);
    }
    const sorted = [...points].sort((a, b) => a - b);
    const out: { start: number; end: number; ids: string[]; tones: Set<ReaderMark['tone']> }[] = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const start = sorted[i]!;
      const end = sorted[i + 1]!;
      const covering = ranges.filter((mark) => mark.start <= start && mark.end >= end);
      out.push({ start, end, ids: covering.map((mark) => mark.id), tones: new Set(covering.map((mark) => mark.tone)) });
    }
    return out;
  }, [text, marks]);

  useEffect(() => {
    if (!focusMarkId || !textRef.current) return;
    const target = textRef.current.querySelector<HTMLElement>(`[data-mark-ids~="${focusMarkId}"]`);
    if (target && typeof target.scrollIntoView === 'function') target.scrollIntoView({ block: 'center' });
  }, [focusMarkId, pieces]);

  const readSelection = () => {
    if (!onSelect) return;
    const container = textRef.current;
    const selection = window.getSelection();
    if (!container || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
      onSelect(null);
      return;
    }
    const range = selection.getRangeAt(0);
    if (!container.contains(range.startContainer) || !container.contains(range.endContainer)) {
      onSelect(null);
      return;
    }
    const start16 = offsetWithin(container, range.startContainer, range.startOffset);
    const end16 = offsetWithin(container, range.endContainer, range.endOffset);
    const startCp = utf16ToCp(text, Math.min(start16, end16));
    const endCp = utf16ToCp(text, Math.max(start16, end16));
    if (endCp <= startCp) {
      onSelect(null);
      return;
    }
    onSelect({ startCp, endCp, quote: cpSlice(text, startCp, endCp) });
  };

  const nodes: ReactNode[] = pieces.map((piece) => {
    const chunk = text.slice(piece.start, piece.end);
    if (piece.ids.length === 0) return chunk;
    const classes = ['reader-mark'];
    if (piece.tones.has('search')) classes.push('is-search');
    if (piece.tones.has('candidate')) classes.push('is-candidate');
    if (activeMarkId && piece.ids.includes(activeMarkId)) classes.push('is-active');
    return (
      <mark key={piece.start} className={classes.join(' ')} data-mark-ids={piece.ids.join(' ')}>
        {chunk}
      </mark>
    );
  });

  return (
    <div className="flat-reader-surface reader" role="region" aria-label={label} tabIndex={0}>
      <div ref={textRef} className="flat-reader-column reader-text" lang="ko" translate="no" onMouseUp={readSelection} onKeyUp={readSelection}>
        {nodes}
      </div>
    </div>
  );
}
