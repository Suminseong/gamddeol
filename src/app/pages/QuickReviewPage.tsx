/** 빠른 감평(알파 흐름 보존): 작품 등록 없이 원고를 붙여넣어 감평 하나를 받는다. 결과는 작품 자료로 저장하지 않는다. */
import type { PageProps } from '../App';
import { useServices } from '../context';
import { QuickReview } from '../quick/QuickReview';
import { PageHeader } from '../ui/primitives';

export function QuickReviewPage(_: PageProps) {
  const { reviewService, keySession } = useServices();
  return (
    <div className="page">
      <PageHeader
        title="빠른 감평"
        description="작품을 만들지 않고 원고를 붙여넣어 OpenAI 감평을 받는 알파 화면입니다. 원고와 결과는 이 화면에만 있고 작품 자료로 저장되지 않습니다."
      />
      <QuickReview service={reviewService} keySession={keySession} />
    </div>
  );
}
