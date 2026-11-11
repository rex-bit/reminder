import { useEffect, useState } from 'react';
import { AVATAR_EVENT, getAvatar } from '../lib/avatar';

export function Avatar({ id, name, size }: { id?: string; name: string; size?: 'sm' | 'lg' }) {
  const [src, setSrc] = useState<string | null>(id ? getAvatar(id) : null);
  useEffect(() => {
    const sync = () => setSrc(id ? getAvatar(id) : null);
    sync();
    window.addEventListener(AVATAR_EVENT, sync);
    return () => window.removeEventListener(AVATAR_EVENT, sync);
  }, [id]);
  return (
    <span className={`avatar${size ? ` ${size}` : ''}`}>
      {src ? <img src={src} alt="" /> : name.charAt(0).toUpperCase()}
    </span>
  );
}
