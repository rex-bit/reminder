import { LinkButton } from '../ui/controls';
import { EmptyState } from '../ui/states';

/** Shown to visitors who open a panel URL without being signed in. */
export function NoAccessPage() {
  return (
    <div className="auth">
      <EmptyState icon="lock" title="Kamu tidak punya akses ke panel ini" hint="Halaman ini hanya untuk admin." action={<LinkButton to="/" variant="tonal">Kembali ke beranda</LinkButton>} />
    </div>
  );
}
