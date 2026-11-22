/** 사용자 설정(screen.settings): 표시 이름, 언어(한국어 고정), 테마, 원고 글꼴. 모두 이 탭 메모리에만 둔다. */
import { useState, useSyncExternalStore } from 'react';
import type { PageProps } from '../App';
import { useServices, useWorkspace } from '../context';
import type { ReaderFont, ThemeChoice } from '../prefs';
import { ErrorBanner, LiveStatus, PageHeader, Panel, SelectField, TextField } from '../ui/primitives';
import { SettingsLayout } from './SettingsNav';

export function SettingsPage(_: PageProps) {
  const { store, prefs } = useServices();
  const workspace = useWorkspace();
  const current = useSyncExternalStore(prefs.subscribe, prefs.get, prefs.get);
  const [name, setName] = useState(workspace.user.displayName);
  const [error, setError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');

  return (
    <div className="page">
      <PageHeader title="사용자 설정" description="계정·로그인은 없습니다. 여기서 바꾼 값은 이 탭에만 적용되고 새로고침하면 기본값으로 돌아갑니다." />
      <SettingsLayout>
        <LiveStatus message={announce} />
        <Panel title="프로필">
          <form
            className="form-stack"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              const result = store.updateProfile(name);
              if (!result.ok) {
                setError(result.error.message);
                return;
              }
              setError(null);
              setAnnounce('표시 이름을 저장했습니다.');
            }}
          >
            {error && <ErrorBanner title="저장하지 못했습니다" message={error} />}
            <TextField label="표시 이름" value={name} onChange={setName} maxLength={40} />
            <SelectField label="언어" value="ko-KR" onChange={() => undefined} options={[{ value: 'ko-KR', label: '한국어' }]} disabled hint="지금은 한국어만 지원합니다." />
            <button type="submit" className="button-primary" disabled={name === workspace.user.displayName}>
              저장
            </button>
          </form>
        </Panel>
        <Panel title="화면">
          <SelectField<ThemeChoice>
            label="테마"
            value={current.theme}
            onChange={(theme) => {
              prefs.setTheme(theme);
              setAnnounce('테마를 바꿨습니다.');
            }}
            options={[
              { value: 'system', label: '기기 설정 따르기' },
              { value: 'light', label: '라이트' },
              { value: 'dark', label: '다크' },
            ]}
          />
          <SelectField<ReaderFont>
            label="원고 글꼴"
            value={current.readerFont}
            onChange={(font) => {
              prefs.setReaderFont(font);
              setAnnounce('원고 글꼴을 바꿨습니다.');
            }}
            options={[
              { value: 'serif', label: '명조 (Serif)' },
              { value: 'sans', label: '고딕 (Sans)' },
            ]}
          />
        </Panel>
      </SettingsLayout>
    </div>
  );
}
