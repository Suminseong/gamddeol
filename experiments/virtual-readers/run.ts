/**
 * V10 예제를 계산해 검증 계획과 같은 모양의 표로 출력한다.
 * 실행: npm run poc:readers  (Node 22.18 이상의 기본 타입 제거 기능으로 .ts를 바로 실행)
 * 원고·외부 API·난수를 쓰지 않는다. 수치는 오락용 가정이며 시장 예측이 아니다.
 */
import { counterfactual, simulate } from './kernel.ts';
import { formatPercent, formatPoints, formatTable } from './format.ts';
import { inputHash } from './snapshot.ts';
import { V10_COUNTERFACTUAL, V10_EXAMPLE_INPUT } from './v10-example.ts';

const input = V10_EXAMPLE_INPUT;
const result = simulate(input);

const lines = [
  '# 가상 독자 2집단·4회차 계산 PoC (V10 예제)',
  '',
  '수치는 오락용 가정이며 시장 예측이 아닙니다. 원고·외부 API·난수를 쓰지 않습니다.',
  `커널 ${result.kernelVersion} · 입력 ${inputHash(input)}`,
  '',
  ...formatTable(input, result),
  '',
];

const query = { episode: V10_COUNTERFACTUAL.episode, tags: V10_COUNTERFACTUAL.tags };
const change = Object.entries(query.tags)
  .map(([tag, value]) => `${tag}=${value}`)
  .join(', ');
const cf = counterfactual(input, query);
lines.push(`반사실 비교 (${cf.episode}화, ${change}): 직전 상태는 그대로 두고 그 회차 태그만 바꿔 한 회차만 계산`, '');
for (const group of cf.groups) {
  const label = input.groups.find((item) => item.id === group.groupId)?.label ?? group.groupId;
  lines.push(
    `- ${label}: 이탈률 ${formatPercent(group.baseline)} → ${formatPercent(group.counterfactual)}, ` +
      `태그 유무 차이 ${formatPoints(group.effect)}`,
  );
}

console.log(lines.join('\n'));
