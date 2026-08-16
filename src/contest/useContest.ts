import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchContest } from './api';
import { getHostToken, peekClientToken } from './tokens';
import type { ContestView } from './types';

export function useContest(slug: string | undefined) {
  const [data, setData] = useState<ContestView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => Boolean(slug));
  const [trackedSlug, setTrackedSlug] = useState(slug);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);

  if (slug !== trackedSlug) {
    setTrackedSlug(slug);
    setLoading(Boolean(slug));
    setData(null);
    setError(null);
  }

  const reload = useCallback(async () => {
    if (!slug) return;
    const requestId = ++requestIdRef.current;
    try {
      const next = await fetchContest(slug, getHostToken(slug), peekClientToken(slug));
      if (requestId !== requestIdRef.current || !mountedRef.current) {
        return;
      }
      setData(next);
      setError(null);
    } catch (err) {
      if (requestId !== requestIdRef.current || !mountedRef.current) {
        return;
      }
      throw err;
    }
  }, [slug]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let intervalId = 0;
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
      if (!cancelled) {
        intervalId = window.setInterval(() => {
          void reload().catch(() => {
            /* keep showing the last successful snapshot */
          });
        }, 2000);
      }
    })();
    return () => {
      cancelled = true;
      requestIdRef.current += 1;
      window.clearInterval(intervalId);
    };
  }, [reload]);

  return { data, error, loading, reload };
}
