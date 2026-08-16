import { useEffect, useRef, useState } from 'react';

type Props = {
  closesAt: string;
  onExpire?: () => void;
};

function formatRemaining(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function Countdown({ closesAt, onExpire }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const expiredRef = useRef(false);

  useEffect(() => {
    expiredRef.current = false;
  }, [closesAt]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  const remaining = Math.max(0, Date.parse(closesAt) - now);

  useEffect(() => {
    if (remaining === 0 && !expiredRef.current) {
      expiredRef.current = true;
      onExpire?.();
    }
  }, [remaining, onExpire]);

  const urgent = remaining > 0 && remaining < 30_000;

  return (
    <div className={`countdown${remaining === 0 ? ' done' : ''}${urgent ? ' urgent' : ''}`}>
      {remaining === 0 ? 'Tiempo agotado' : formatRemaining(remaining)}
    </div>
  );
}
