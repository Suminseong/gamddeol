/**
 * 회차 업로드(screen.import, flow.import): 3단계 마법사.
 * 1) 파일 고르기 또는 붙여넣기 → 2) 인코딩·회차 경계 확인과 수정 → 3) 항목별 결과, 실패한 항목만 다시 시도(같은 명령 ID).
 * 주소에 ?chapterId=가 있으면 그 회차에 새 판본을 더한다(기존 판본은 바뀌지 않는다).
 */
import { useMemo, useState } from 'react';
import type { ChapterImportItem, ImportItemResult, VersionSource } from '../../domain/store';
import { boundaryCandidates, normalizeManuscript } from '../../domain/text';
import { chapterLabel, chaptersOf } from '../../domain/selectors';
import type { SourceType } from '../../domain/types';
import { pathFor } from '../../router/routes';
import type { PageProps } from '../App';
import { Link, useQuery, useServices, useUnsavedGuard, useWorkspace } from '../context';
import { ActionBar, Badge, CheckboxField, ErrorBanner, InfoBanner, LiveStatus, PageHeader, Panel, SelectField, TextAreaField } from '../ui/primitives';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPT = '.txt,.md,.markdown,text/plain,text/markdown';
type Encoding = 'utf-8' | 'euc-kr' | 'utf-16le';
const ENCODINGS: { value: Encoding; label: string }[] = [
  { value: 'utf-8', label: 'UTF-8' },
  { value: 'euc-kr', label: 'EUC-KR (CP949)' },
  { value: 'utf-16le', label: 'UTF-16 LE' },
];

interface SourceDraft {
  key: string;
  fileName: string | null;
  bytes: Uint8Array | null;
  sourceType: SourceType;
  encoding: Encoding;
  decodeError: boolean;
  text: string;
  /** 회차를 나눌 줄 시작 위치(UTF-16, 정규화 본문 기준). */
  splits: number[];
  split: boolean;
}

interface ItemDraft {
  key: string;
  commandId: string;
  displayNumber: string;
  title: string;
  text: string;
  source: SourceDraft;
}

function decode(bytes: Uint8Array, encoding: Encoding): { text: string; error: boolean } {
  try {
    return { text: new TextDecoder(encoding, { fatal: true }).decode(bytes), error: false };
  } catch {
    return { text: new TextDecoder(encoding).decode(bytes), error: true };
  }
}

/** UTF-8로 읽히면 UTF-8, 아니면 EUC-KR을 먼저 제안한다. 작가가 미리보기에서 바꿀 수 있다. */
function detect(bytes: Uint8Array): { encoding: Encoding; text: string; error: boolean } {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return { encoding: 'utf-16le', ...decode(bytes, 'utf-16le') };
  const utf8 = decode(bytes, 'utf-8');
  if (!utf8.error) return { encoding: 'utf-8', ...utf8 };
  const euc = decode(bytes, 'euc-kr');
  return euc.error ? { encoding: 'utf-8', ...utf8 } : { encoding: 'euc-kr', ...euc };
}

function firstLine(text: string): string {
  const line = text.split('\n').find((item) => item.trim().length > 0)?.trim() ?? '';
  return line.length <= 40 ? line : '';
}

function nextNumber(existing: string[]): number {
  return existing.reduce((max, value) => {
    const number = Number.parseInt(value, 10);
    return Number.isFinite(number) ? Math.max(max, number) : max;
  }, 0) + 1;
}

export function ImportPage({ params }: PageProps) {
  const { store, newId } = useServices();
  const workspace = useWorkspace();
  const query = useQuery();
  const workId = params.workId!;
  const targetChapterId = query.get('chapterId');
  const targetChapter = targetChapterId ? workspace.chapters[targetChapterId] : undefined;
  const versionMode = Boolean(targetChapter && targetChapter.workId === workId);
  const invalidTarget = Boolean(targetChapterId) && !versionMode;

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [mode, setMode] = useState<'file' | 'paste'>('file');
  const [pasted, setPasted] = useState('');
  const [sources, setSources] = useState<SourceDraft[]>([]);
  const [overrides, setOverrides] = useState<Record<string, { displayNumber?: string; title?: string }>>({});
  const [commandIds] = useState(() => new Map<string, string>());
  const [fileError, setFileError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Record<string, ImportItemResult['result']>>({});
  const [submitted, setSubmitted] = useState<ItemDraft[]>([]);

  const dirty = step !== 3 && (sources.length > 0 || pasted.length > 0);
  useUnsavedGuard(dirty, '올리던 원고가 아직 등록되지 않았습니다.');

  const baseNumber = nextNumber(chaptersOf(workspace, workId).map((chapter) => chapter.displayNumber));

  const items: ItemDraft[] = useMemo(() => {
    const list: ItemDraft[] = [];
    for (const source of sources) {
      const normalized = normalizeManuscript(source.text);
      const cuts = source.split && !versionMode ? [...source.splits].sort((a, b) => a - b) : [];
      const bounds = [0, ...cuts, normalized.length];
      for (let i = 0; i < bounds.length - 1; i++) {
        const text = normalized.slice(bounds[i], bounds[i + 1]);
        if (!text.trim()) continue;
        const key = `${source.key}:${bounds[i]}`;
        if (!commandIds.has(key)) commandIds.set(key, newId());
        const override = overrides[key] ?? {};
        list.push({
          key,
          commandId: commandIds.get(key)!,
          displayNumber: override.displayNumber ?? String(baseNumber + list.length),
          title: override.title ?? firstLine(text),
          text: cuts.length > 0 ? text : source.text,
          source,
        });
      }
    }
    return list;
  }, [sources, overrides, versionMode, baseNumber, commandIds, newId]);

  const readFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setFileError(null);
    const next: SourceDraft[] = [];
    for (const file of Array.from(files).slice(0, versionMode ? 1 : 50)) {
      if (file.size > MAX_FILE_BYTES) {
        setFileError(`「${file.name}」은(는) 10MB를 넘어 올릴 수 없습니다.`);
        continue;
      }
      if (!/\.(txt|md|markdown)$/i.test(file.name)) {
        setFileError(`「${file.name}」은(는) 지원하지 않는 형식입니다. TXT·Markdown만 올릴 수 있습니다(DOCX는 아직 지원하지 않음).`);
        continue;
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const detected = detect(bytes);
      const normalized = normalizeManuscript(detected.text);
      next.push({
        key: newId(),
        fileName: file.name,
        bytes,
        sourceType: 'upload',
        encoding: detected.encoding,
        decodeError: detected.error,
        text: detected.text,
        splits: boundaryCandidates(normalized).map((item) => item.utf16),
        split: false,
      });
    }
    setSources(next);
  };

  const toPreview = () => {
    if (mode === 'paste') {
      const normalized = normalizeManuscript(pasted);
      setSources([
        {
          key: newId(),
          fileName: null,
          bytes: null,
          sourceType: 'paste',
          encoding: 'utf-8',
          decodeError: false,
          text: pasted,
          splits: boundaryCandidates(normalized).map((item) => item.utf16),
          split: false,
        },
      ]);
    }
    setStep(2);
  };

  const updateSource = (key: string, patch: Partial<SourceDraft>) =>
    setSources((list) => list.map((source) => (source.key === key ? { ...source, ...patch } : source)));

  const sourceOf = (item: ItemDraft): VersionSource => {
    const whole = item.text === item.source.text;
    return {
      rawBytes: whole ? item.source.bytes : null,
      rawText: item.text,
      sourceType: item.source.sourceType,
      fileName: item.source.fileName,
      encoding: item.source.encoding,
    };
  };

  const submit = async (only: ItemDraft[]) => {
    setBusy(true);
    try {
      if (versionMode && targetChapter) {
        const item = only[0];
        if (!item) return;
        const result = await store.addVersion(workId, targetChapter.id, sourceOf(item), item.commandId);
        setResults({ [item.key]: result.ok ? { ok: true, value: { chapterId: targetChapter.id, versionId: result.value.id } } : result });
      } else {
        const payload: ChapterImportItem[] = only.map((item) => ({
          commandId: item.commandId,
          displayNumber: item.displayNumber,
          title: item.title || null,
          source: sourceOf(item),
        }));
        const outcome = await store.importChapters(workId, payload);
        setResults((previous) => {
          const next = { ...previous };
          for (const entry of outcome) {
            const item = only.find((candidate) => candidate.commandId === entry.commandId);
            if (item) next[item.key] = entry.result;
          }
          return next;
        });
      }
      setSubmitted((previous) => (previous.length > 0 ? previous : only));
      setStep(3);
    } finally {
      setBusy(false);
    }
  };

  const failed = submitted.filter((item) => results[item.key] && !results[item.key]!.ok);
  const retryable = failed.filter((item) => {
    const result = results[item.key];
    return result !== undefined && !result.ok && result.error.code !== 'duplicate';
  });
  const succeeded = submitted.filter((item) => results[item.key]?.ok).length;
  const pageTitle = versionMode && targetChapter ? `${chapterLabel(targetChapter)} 새 판본 올리기` : '회차 업로드';

  return (
    <div className="page page-narrow">
      <PageHeader
        title={pageTitle}
        description={
          versionMode
            ? '새 판본을 더해도 이전 판본 본문·해시·메모는 그대로 남습니다. 이전 판본에 걸린 근거는 재검토 요청으로 표시됩니다.'
            : 'TXT·Markdown 파일(파일당 10MB 이하)을 올리거나 본문을 붙여넣으세요. 원고는 이 탭 메모리에만 들어가고 어디에도 전송되지 않습니다.'
        }
      />
      <ol className="stepper" aria-label="진행 단계">
        {['원고 고르기', '확인·수정', '결과'].map((label, index) => (
          <li key={label} aria-current={step === index + 1 ? 'step' : undefined} className={step > index + 1 ? 'is-done' : undefined}>
            <span className="step-number num">{index + 1}</span> {label}
          </li>
        ))}
      </ol>
      <LiveStatus message={step === 3 ? `등록 결과: 성공 ${succeeded}건, 실패 ${failed.length}건` : ''} />
      {invalidTarget && <ErrorBanner title="회차를 찾을 수 없습니다" message="주소의 회차가 이 작품에 없습니다. 새 회차로 올립니다." />}

      {step === 1 && (
        <Panel title="1. 원고 고르기">
          <div className="segmented" role="radiogroup" aria-label="입력 방식">
            {(['file', 'paste'] as const).map((value) => (
              <label key={value} className={mode === value ? 'segment is-active' : 'segment'}>
                <input type="radio" name="import-mode" value={value} checked={mode === value} onChange={() => setMode(value)} />
                {value === 'file' ? '파일 올리기' : '붙여넣기'}
              </label>
            ))}
          </div>
          {mode === 'file' ? (
            <div className="field">
              <label className="button-secondary file-button">
                {versionMode ? '파일 고르기' : '파일 고르기 (여러 개 가능)'}
                <input
                  type="file"
                  accept={ACCEPT}
                  multiple={!versionMode}
                  className="visually-hidden-input"
                  onChange={(event) => void readFiles(event.target.files)}
                />
              </label>
              {fileError && (
                <p className="field-error" role="alert">
                  {fileError}
                </p>
              )}
              {sources.length > 0 && (
                <ul className="row-list" aria-label="고른 파일">
                  {sources.map((source) => (
                    <li key={source.key}>
                      <span>{source.fileName}</span>
                      <span className="hint num">{source.bytes?.byteLength.toLocaleString('ko-KR')}바이트</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <TextAreaField label="원고 본문" value={pasted} onChange={setPasted} rows={12} manuscript hint="줄바꿈과 공백은 그대로 보존합니다." />
          )}
          <ActionBar>
            <Link to={versionMode && targetChapter ? pathFor('page.chapter', { workId, chapterId: targetChapter.id }) : pathFor('page.chapters', { workId })} className="button-secondary">
              취소
            </Link>
            <button
              type="button"
              className="button-primary"
              disabled={mode === 'file' ? sources.length === 0 : !pasted.trim()}
              onClick={toPreview}
            >
              다음: 확인
            </button>
          </ActionBar>
        </Panel>
      )}

      {step === 2 && (
        <>
          {sources.map((source) => {
            const normalized = normalizeManuscript(source.text);
            const candidates = boundaryCandidates(normalized);
            return (
              <Panel key={source.key} title={source.fileName ?? '붙여넣은 원고'}>
                <dl className="meta-list">
                  <div>
                    <dt>글자 수</dt>
                    <dd className="num">{normalized.length.toLocaleString('ko-KR')}</dd>
                  </div>
                  <div>
                    <dt>줄바꿈 정규화</dt>
                    <dd>CRLF·CR → LF, 유니코드 NFC (공백·문장부호 유지)</dd>
                  </div>
                </dl>
                {source.bytes && (
                  <SelectField
                    label="문자 인코딩"
                    value={source.encoding}
                    options={ENCODINGS}
                    onChange={(encoding) => {
                      const decoded = decode(source.bytes!, encoding);
                      updateSource(source.key, {
                        encoding,
                        text: decoded.text,
                        decodeError: decoded.error,
                        splits: boundaryCandidates(normalizeManuscript(decoded.text)).map((item) => item.utf16),
                      });
                    }}
                    error={source.decodeError ? '이 인코딩으로 읽을 수 없는 글자가 있습니다. 미리보기가 깨져 보이면 다른 인코딩을 고르세요.' : null}
                  />
                )}
                <pre className="preview-text flat-reader-surface" tabIndex={0} aria-label="본문 앞부분 미리보기">
                  {normalized.slice(0, 600)}
                  {normalized.length > 600 ? '…' : ''}
                </pre>
                {!versionMode && candidates.length > 0 && (
                  <fieldset className="boundary-list">
                    <legend>회차 경계</legend>
                    <CheckboxField
                      label={`회차 제목처럼 보이는 줄 ${candidates.length}곳에서 나눠 여러 회차로 올리기`}
                      checked={source.split}
                      onChange={(split) => updateSource(source.key, { split })}
                    />
                    {source.split && (
                      <ul className="check-list">
                        {candidates.map((candidate) => (
                          <li key={candidate.utf16}>
                            <CheckboxField
                              label={`「${candidate.line}」에서 새 회차 시작`}
                              checked={source.splits.includes(candidate.utf16)}
                              onChange={(checked) =>
                                updateSource(source.key, {
                                  splits: checked ? [...source.splits, candidate.utf16] : source.splits.filter((value) => value !== candidate.utf16),
                                })
                              }
                            />
                          </li>
                        ))}
                      </ul>
                    )}
                  </fieldset>
                )}
              </Panel>
            );
          })}
          {!versionMode && (
            <Panel title={`등록할 회차 ${items.length}개`}>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">회차 번호</th>
                      <th scope="col">제목</th>
                      <th scope="col">글자 수</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, index) => (
                      <tr key={item.key}>
                        <td>
                          <input
                            className="text-input input-compact"
                            aria-label={`${index + 1}번째 항목 회차 번호`}
                            value={item.displayNumber}
                            onChange={(event) => setOverrides((all) => ({ ...all, [item.key]: { ...all[item.key], displayNumber: event.target.value } }))}
                          />
                        </td>
                        <td>
                          <input
                            className="text-input"
                            aria-label={`${index + 1}번째 항목 제목`}
                            value={item.title}
                            onChange={(event) => setOverrides((all) => ({ ...all, [item.key]: { ...all[item.key], title: event.target.value } }))}
                          />
                        </td>
                        <td className="num">{normalizeManuscript(item.text).length.toLocaleString('ko-KR')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}
          <ActionBar>
            <button type="button" className="button-secondary" onClick={() => setStep(1)} disabled={busy}>
              이전
            </button>
            <button type="button" className="button-primary" disabled={busy || items.length === 0} aria-busy={busy} onClick={() => void submit(items)}>
              {busy ? '등록 중…' : versionMode ? '새 판본 등록' : `${items.length}개 회차 등록`}
            </button>
          </ActionBar>
        </>
      )}

      {step === 3 && (
        <Panel title="3. 결과">
          {failed.length === 0 ? (
            <InfoBanner>모두 등록했습니다. 등록한 판본은 바꿀 수 없고, 고칠 때는 새 판본을 올립니다.</InfoBanner>
          ) : (
            <ErrorBanner title={`${failed.length}건을 등록하지 못했습니다`} message="성공한 항목은 그대로 두고, 실패한 항목만 다시 보낼 수 있습니다." />
          )}
          <ul className="result-list">
            {submitted.map((item) => {
              const result = results[item.key];
              return (
                <li key={item.key}>
                  <span>
                    {versionMode && targetChapter ? chapterLabel(targetChapter) : `${item.displayNumber}화${item.title ? ` · ${item.title}` : ''}`}
                  </span>
                  {result?.ok ? (
                    <span className="badge-row">
                      <Badge tier="canon">등록됨</Badge>
                      <Link to={pathFor('page.version', { workId, chapterId: result.value.chapterId, versionId: result.value.versionId })}>판본 열기</Link>
                    </span>
                  ) : (
                    <span className="badge-row">
                      <Badge tier={result?.error.code === 'duplicate' ? 'neutral' : 'danger'}>{result?.error.code === 'duplicate' ? '변경 없음' : '실패'}</Badge>
                      <span className="hint">{result?.error.message}</span>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <ActionBar>
            {retryable.length > 0 && (
              <button type="button" className="button-secondary" disabled={busy} onClick={() => void submit(retryable)}>
                실패한 항목만 다시 시도
              </button>
            )}
            <Link to={versionMode && targetChapter ? pathFor('page.chapter', { workId, chapterId: targetChapter.id }) : pathFor('page.chapters', { workId })} className="button-primary">
              {versionMode ? '회차로 돌아가기' : '회차 목록으로'}
            </Link>
          </ActionBar>
        </Panel>
      )}
    </div>
  );
}
