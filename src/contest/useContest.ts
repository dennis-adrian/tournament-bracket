import { useCallback, useEffect, useState } from 'react';
import { fetchContest } from './api';
import { getHostToken, peekClientToken } from './tokens';
import type { ContestView } from './types';

export function useContest(slug: string | undefined) {
  const [data, setData] = useState<ContestView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!slug) return;
    const next = await fetchContest(slug, getHostToken(slug), peekClientToken(slug));
    setData(next);
    setError(null);
  }, [slug]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        await reload();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'No se pudo cargar este concurso.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    const id = window.setInterval(() => {
      void reload().catch(() => {
        /* keep showing the last successful snapshot */
      });
    }, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [reload]);

  return { data, error, loading, reload };
}
