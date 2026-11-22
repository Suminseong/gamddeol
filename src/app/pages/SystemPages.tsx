/** 시스템 화면: 404·403·이 탭에 없는 작품. 403은 자료가 있는지조차 드러내지 않는다. */
import { Link } from '../context';
import type { PageProps } from '../App';
import { PageHeader } from '../ui/primitives';

export function NotFoundPage(_: PageProps) {
  return (
    <div className="system-page">
      <PageHeader title="페이지를 찾을 수 없습니다" />
      <div className="error-card">
        <p className="error-code">404</p>
        <p>주소가 잘못되었거나, 아직 공개하지 않은 기능의 주소입니다.</p>
        <Link to="/works" className="button-primary">
          작품 목록으로 이동
        </Link>
      </div>
    </div>
  );
}

export function ForbiddenPage(_: PageProps) {
  return (
    <div className="system-page">
      <PageHeader title="이 화면에 접근할 권한이 없습니다" />
      <div className="error-card">
        <p className="error-code">403</p>
        <p>주소의 작품과 자료가 서로 맞지 않습니다. 작품 목록에서 다시 여세요.</p>
        <Link to="/works" className="button-primary">
          작품 목록으로 이동
        </Link>
      </div>
    </div>
  );
}

/** 새로고침·직접 진입으로 메모리 자료가 없을 때. 서버 저장이 없다는 사실을 그대로 알린다. */
export function MissingWorkPage(_: PageProps) {
  return (
    <div className="system-page">
      <PageHeader title="이 탭에 열려 있지 않은 작품입니다" />
      <div className="error-card">
        <p>
          감떨은 아직 서버나 브라우저 저장소에 작품을 저장하지 않습니다. 작품 자료는 이 탭 메모리에만 있어서 새로고침하거나 다른 탭에서 주소를
          열면 보이지 않습니다.
        </p>
        <p>내보내 둔 작품 JSON 파일이 있으면 작품 목록에서 불러올 수 있습니다.</p>
        <Link to="/works" className="button-primary">
          작품 목록에서 불러오기
        </Link>
      </div>
    </div>
  );
}
