import { useState } from 'react';
import { MOCK_SCENARIOS, type MockScenario, type MockTransport } from '../../transport/mockTransport';
import { copy } from '../copy';

/** `npm run dev:mock`에서만 보이는 모의 모드 표시와 시나리오 선택. */
export function MockBanner({ transport }: { transport: MockTransport }) {
  const [scenario, setScenario] = useState<MockScenario>(transport.scenario);
  return (
    <div className="mock-banner" role="status">
      <strong>{copy.mock.banner}</strong>
      <label>
        {copy.mock.scenarioLabel}{' '}
        <select
          className="text-input"
          value={scenario}
          onChange={(event) => {
            const next = event.target.value as MockScenario;
            transport.setScenario(next);
            setScenario(next);
          }}
        >
          {MOCK_SCENARIOS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
