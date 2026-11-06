import { Button } from './controls';

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage(p: number): void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="pager">
      <span className="body-s muted">{total} total · page {page} of {pages}</span>
      <Button variant="outlined" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
      <Button variant="outlined" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</Button>
    </div>
  );
}
