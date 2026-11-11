export function Avatar({ src, name, size }: { src?: string | null; name: string; size?: 'sm' | 'lg' }) {
  return (
    <span className={`avatar${size ? ` ${size}` : ''}`}>
      {src ? <img src={src} alt="" /> : name.charAt(0).toUpperCase()}
    </span>
  );
}
