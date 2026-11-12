import { useEffect } from 'react';

/** Sets the document title and meta description for a page (single-page app: set on mount, restored on leave). */
export function usePageMeta(title: string, description: string): void {
  useEffect(() => {
    const prevTitle = document.title;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const created = !meta;
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'description';
      document.head.appendChild(meta);
    }
    const prevDesc = meta.content;
    document.title = `${title} · Class Reminder`;
    meta.content = description;
    return () => {
      document.title = prevTitle;
      if (created) meta?.remove();
      else if (meta) meta.content = prevDesc;
    };
  }, [title, description]);
}
