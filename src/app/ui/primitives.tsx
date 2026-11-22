/** 공용 화면 조각: 머리말·패널·상태(빈/오류/낡음)·배지·입력 필드·하단 행동 바. */
import { useEffect, useId, useState, type ReactNode } from 'react';
import type { Assertion, ConflictStatus } from '../../domain/types';
import { APPROVAL_LABELS, CONFLICT_STATUS_LABELS } from '../../domain/labels';

export function PageHeader({
  title,
  description,
  actions,
  meta,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="page-header-text">
        <h1 id="page-title" tabIndex={-1}>
          {title}
        </h1>
        {meta && <div className="page-meta">{meta}</div>}
        {description && <p className="page-description">{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function Panel({
  title,
  children,
  actions,
  className,
  headingLevel = 2,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
  headingLevel?: 2 | 3;
}) {
  const id = useId();
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <section className={`panel${className ? ` ${className}` : ''}`} aria-labelledby={id}>
      <div className="panel-head">
        <Heading id={id}>{title}</Heading>
        {actions && <div className="panel-actions">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="empty-card">
      <p>{message}</p>
      {action}
    </div>
  );
}

export function ErrorBanner({
  title,
  message,
  onRetry,
  retryLabel = '다시 시도',
}: {
  title: string;
  message?: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div className="banner banner-error" role="alert">
      <p className="banner-title">{title}</p>
      {message && <p>{message}</p>}
      {onRetry && (
        <button type="button" className="button-secondary" onClick={onRetry}>
          {retryLabel}
        </button>
      )}
    </div>
  );
}

export function StaleBanner({ onReload }: { onReload: () => void }) {
  return (
    <div className="banner banner-warning" role="alert">
      <p className="banner-title">다른 작업으로 항목이 변경되었습니다.</p>
      <p>최신 내용을 확인한 뒤 다시 결정하세요. 입력한 내용은 지우지 않았습니다.</p>
      <button type="button" className="button-secondary" onClick={onReload}>
        최신 내용 불러오기
      </button>
    </div>
  );
}

export function InfoBanner({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warning' }) {
  return <div className={`banner banner-${tone}`}>{children}</div>;
}

export type BadgeTier = 'canon' | 'fact' | 'claim' | 'candidate' | 'warning' | 'deprecated' | 'danger' | 'neutral' | 'accent';

/** 색만으로 뜻을 전하지 않도록 항상 글자 이름표를 함께 쓴다. 글자색은 본문색(대비 확보), 상태색은 배경·테두리·점. */
export function Badge({ tier, children, title }: { tier: BadgeTier; children: ReactNode; title?: string }) {
  return (
    <span className={`status-badge tier-${tier}`} title={title}>
      <span className="status-dot" aria-hidden="true" />
      {children}
    </span>
  );
}

/** 진술 인식 상태 6단계 배지 (Gemini 명세 v0.3 매핑). */
export function epistemicOf(assertion: Pick<Assertion, 'approvalStatus' | 'sourceKind' | 'speakerUnresolved'>): {
  tier: BadgeTier;
  label: string;
} {
  if (assertion.approvalStatus === 'rejected') return { tier: 'deprecated', label: '폐기' };
  if (assertion.approvalStatus === 'revoked') return { tier: 'deprecated', label: '확정 취소' };
  if (assertion.sourceKind === 'ai_inference') {
    return { tier: 'candidate', label: assertion.approvalStatus === 'approved' ? 'AI 추론 · 확정' : 'AI 추출 후보' };
  }
  if (assertion.sourceKind === 'narration') return { tier: 'fact', label: '원고 사실' };
  if (assertion.sourceKind === 'character_speech') {
    return { tier: 'claim', label: assertion.speakerUnresolved ? '인물 발언 · 화자 미상' : '인물 발언' };
  }
  if (assertion.approvalStatus === 'candidate') return { tier: 'candidate', label: '후보' };
  return { tier: 'canon', label: assertion.sourceKind === 'author_idea' ? '작가 구상 · 확정' : '확정 설정' };
}

export function AssertionBadges({ assertion }: { assertion: Pick<Assertion, 'approvalStatus' | 'sourceKind' | 'speakerUnresolved'> }) {
  const { tier, label } = epistemicOf(assertion);
  const showApproval =
    (assertion.sourceKind === 'narration' || assertion.sourceKind === 'character_speech') ||
    (assertion.sourceKind === 'ai_inference' && assertion.approvalStatus === 'candidate');
  return (
    <span className="badge-row">
      <Badge tier={tier}>{label}</Badge>
      {showApproval && assertion.approvalStatus !== 'rejected' && assertion.approvalStatus !== 'revoked' && (
        <Badge tier={assertion.approvalStatus === 'approved' ? 'canon' : 'candidate'}>{APPROVAL_LABELS[assertion.approvalStatus]}</Badge>
      )}
    </span>
  );
}

export function ConflictBadge({ status }: { status: ConflictStatus }) {
  const tier: BadgeTier = status === 'open' || status === 'reopened' ? 'warning' : status === 'intentional' ? 'canon' : 'deprecated';
  return <Badge tier={tier}>{CONFLICT_STATUS_LABELS[status]}</Badge>;
}

export function SyntheticNotice() {
  return (
    <p className="synthetic-notice">
      <Badge tier="neutral">가상 시뮬레이션 · 실제 독자 지표 아님</Badge>
      <span>오락용 가상 실험입니다. 실제 독자 반응·매출·연독률을 예측하지 않습니다.</span>
    </p>
  );
}

interface FieldBase {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
}

function useFieldIds(hint: unknown, error: unknown) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return { id, describedBy: [hintId, errorId].filter(Boolean).join(' ') || undefined, hintId, errorId };
}

function FieldMessages({ hint, hintId, error, errorId }: { hint?: ReactNode; hintId?: string; error?: string | null; errorId?: string }) {
  return (
    <>
      {hint && (
        <p id={hintId} className="hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="field-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

export function TextField({
  label,
  hint,
  error,
  required,
  value,
  onChange,
  type = 'text',
  inputMode,
  placeholder,
  maxLength,
  autoFocus,
  disabled,
}: FieldBase & {
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'number' | 'search';
  inputMode?: 'decimal' | 'numeric' | 'text' | 'search';
  placeholder?: string;
  maxLength?: number;
  autoFocus?: boolean;
  disabled?: boolean;
}) {
  const ids = useFieldIds(hint, error);
  return (
    <div className="field">
      <label htmlFor={ids.id}>
        {label}
        {required && <span className="required"> (필수)</span>}
      </label>
      <input
        id={ids.id}
        className="text-input"
        type={type}
        inputMode={inputMode}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        autoFocus={autoFocus}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={ids.describedBy}
        aria-required={required || undefined}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="off"
        spellCheck={false}
      />
      <FieldMessages hint={hint} hintId={ids.hintId} error={error} errorId={ids.errorId} />
    </div>
  );
}

export function TextAreaField({
  label,
  hint,
  error,
  required,
  value,
  onChange,
  rows = 4,
  placeholder,
  manuscript,
}: FieldBase & { value: string; onChange: (value: string) => void; rows?: number; placeholder?: string; manuscript?: boolean }) {
  const ids = useFieldIds(hint, error);
  return (
    <div className="field">
      <label htmlFor={ids.id}>
        {label}
        {required && <span className="required"> (필수)</span>}
      </label>
      <textarea
        id={ids.id}
        className={manuscript ? 'manuscript-input flat-reader-surface' : 'text-input text-area'}
        value={value}
        rows={rows}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={ids.describedBy}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="off"
        spellCheck={false}
        translate="no"
        data-gramm="false"
        data-gramm_editor="false"
        data-enable-grammarly="false"
        data-lt-active="false"
      />
      <FieldMessages hint={hint} hintId={ids.hintId} error={error} errorId={ids.errorId} />
    </div>
  );
}

export function SelectField<T extends string>({
  label,
  hint,
  error,
  required,
  value,
  onChange,
  options,
  disabled,
}: FieldBase & {
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: string }[];
  disabled?: boolean;
}) {
  const ids = useFieldIds(hint, error);
  return (
    <div className="field">
      <label htmlFor={ids.id}>
        {label}
        {required && <span className="required"> (필수)</span>}
      </label>
      <select
        id={ids.id}
        className="text-input"
        value={value}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={ids.describedBy}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <FieldMessages hint={hint} hintId={ids.hintId} error={error} errorId={ids.errorId} />
    </div>
  );
}

export function CheckboxField({
  label,
  checked,
  onChange,
  hint,
  disabled,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="field field-check">
      <input
        id={id}
        type="checkbox"
        className="checkbox"
        checked={checked}
        disabled={disabled}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(event) => onChange(event.target.checked)}
      />
      <label htmlFor={id}>{label}</label>
      {hint && (
        <p id={`${id}-hint`} className="hint">
          {hint}
        </p>
      )}
    </div>
  );
}

/** 쉼표나 Enter로 항목을 더하는 칩 입력. */
export function ChipsField({
  label,
  values,
  onChange,
  hint,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  hint?: ReactNode;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState('');
  const ids = useFieldIds(hint, null);
  const add = () => {
    const items = draft
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    if (items.length === 0) return;
    onChange([...new Set([...values, ...items])]);
    setDraft('');
  };
  return (
    <div className="field">
      <label htmlFor={ids.id}>{label}</label>
      <div className="chips-input">
        <input
          id={ids.id}
          className="text-input"
          value={draft}
          placeholder={placeholder}
          aria-describedby={ids.describedBy}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              add();
            }
          }}
          autoComplete="off"
        />
        <button type="button" className="button-secondary" onClick={add}>
          추가
        </button>
      </div>
      {values.length > 0 && (
        <ul className="chip-list" aria-label={`${label} 목록`}>
          {values.map((value) => (
            <li key={value} className="chip">
              <span>{value}</span>
              <button
                type="button"
                className="chip-remove"
                aria-label={`${value} 빼기`}
                onClick={() => onChange(values.filter((item) => item !== value))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <FieldMessages hint={hint} hintId={ids.hintId} />
    </div>
  );
}

/** 모바일에서는 화면 아래에 붙고, 넓은 화면에서는 내용 흐름 안에 있는 핵심 행동 묶음. */
export function ActionBar({ children, label = '주요 행동' }: { children: ReactNode; label?: string }) {
  return (
    <div className="action-bar" role="group" aria-label={label}>
      {children}
    </div>
  );
}

/** 상태가 바뀔 때만 한 번 읽히는 스크린리더 알림 영역. */
export function LiveStatus({ message }: { message: string }) {
  const [text, setText] = useState('');
  useEffect(() => {
    setText(message);
  }, [message]);
  return (
    <p className="sr-only" role="status" aria-live="polite">
      {text}
    </p>
  );
}

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState<'idle' | 'copied' | 'failed'>('idle');
  return (
    <button
      type="button"
      className="button-secondary button-small"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone('copied');
        } catch {
          setDone('failed');
        }
        window.setTimeout(() => setDone('idle'), 2000);
      }}
    >
      {done === 'copied' ? '복사함' : done === 'failed' ? '복사 실패' : label}
    </button>
  );
}

/** 모바일에서 두 영역(원문/근거 등)을 탭으로 바꿔 보여 준다. 넓은 화면에서는 둘 다 보인다. */
export function SplitPanes({
  labels,
  children,
  initial = 0,
  variant = 'inspector',
}: {
  labels: [string, string];
  children: [ReactNode, ReactNode];
  initial?: 0 | 1;
  /** inspector: 오른쪽 380px 검사 영역, list: 왼쪽 목록 + 오른쪽 상세, even: 반반. */
  variant?: 'inspector' | 'list' | 'even';
}) {
  const [active, setActive] = useState<0 | 1>(initial);
  const id = useId();
  return (
    <div className={`split split-${variant}`} data-active={active}>
      <div className="split-tabs" role="tablist" aria-label="보기 전환">
        {labels.map((label, index) => (
          <button
            key={label}
            type="button"
            role="tab"
            id={`${id}-tab-${index}`}
            aria-selected={active === index}
            aria-controls={`${id}-pane-${index}`}
            className="split-tab"
            onClick={() => setActive(index as 0 | 1)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="split-pane split-pane-0" id={`${id}-pane-0`} role="tabpanel" aria-labelledby={`${id}-tab-0`}>
        {children[0]}
      </div>
      <div className="split-pane split-pane-1" id={`${id}-pane-1`} role="tabpanel" aria-labelledby={`${id}-tab-1`}>
        {children[1]}
      </div>
    </div>
  );
}
