import { copy, OPENAI_KEY_SAFETY_URL } from '../copy';

export function SecurityNotice() {
  return (
    <aside className="notice notice-warning" aria-labelledby="notice-heading">
      <h2 id="notice-heading">{copy.notice.heading}</h2>
      <p>
        {copy.notice.body}{' '}
        <a href={OPENAI_KEY_SAFETY_URL} target="_blank" rel="noopener noreferrer">
          {copy.notice.linkLabel}
        </a>
      </p>
      <ul>
        {copy.notice.points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
    </aside>
  );
}
