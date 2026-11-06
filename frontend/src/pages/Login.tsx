import { useState, type FormEvent } from 'react';
import { errorMessage } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { Button, TextField } from '../ui/controls';

export function LoginPage() {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(identifier.trim(), password);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <form className="card elevated" onSubmit={submit} noValidate>
        <div>
          <h1 className="headline-m">Sign in</h1>
          <p className="body-m muted">Use your Admin ID, username or email.</p>
        </div>
        {error && (
          <div className="banner error" role="alert">
            {error}
          </div>
        )}
        <TextField label="Admin ID / username / email" value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" required autoFocus />
        <TextField label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        <Button type="submit" loading={busy} disabled={!identifier || !password}>
          Sign in
        </Button>
      </form>
    </div>
  );
}
