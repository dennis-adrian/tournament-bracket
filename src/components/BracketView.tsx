import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { MatchSlot, Participant, Tournament } from '../types';
import { ROUND_NAMES } from '../types';
import { matchesByRound } from '../bracket';
import { exportBracketImage } from '../export';
import { MatchCard } from './MatchCard';
import { FocusView } from './FocusView';

type Props = {
  tournament: Tournament;
  onVote: (matchId: string, slot: MatchSlot) => void;
  onResetVotes: (matchId: string) => void;
  onFinalize: (matchId: string, winnerId: string) => void;
  onReset: () => void;
  onRenameParticipant: (id: string, name: string) => void;
};

export function BracketView({
  tournament,
  onVote,
  onResetVotes,
  onFinalize,
  onReset,
  onRenameParticipant,
}: Props) {
  const [focusedMatchId, setFocusedMatchId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    if (exporting) return;
    setExporting(true);
    try {
      await exportBracketImage(tournament);
    } catch (err) {
      console.error('Export failed', err);
      alert('No se pudo generar la imagen de la llave.');
    } finally {
      setExporting(false);
    }
  }

  const rounds = matchesByRound(tournament);

  const participantsById: Record<string, Participant> = {};
  for (const p of tournament.participants) {
    participantsById[p.id] = p;
  }

  const champion = tournament.champion
    ? participantsById[tournament.champion]
    : null;

  const focusedMatch = focusedMatchId
    ? tournament.matches.find((m) => m.id === focusedMatchId) ?? null
    : null;

  return (
    <div className="bracket-page">
      <header className="bracket-header">
        <div>
          <Link to="/" className="crumb-link">
            Inicio
          </Link>
          <h1>Llave del torneo</h1>
        </div>
        <div className="bracket-header-actions">
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            title="Descargar la llave como imagen PNG"
          >
            {exporting ? 'Exportando…' : 'Exportar como imagen'}
          </button>
          <button type="button" className="link danger" onClick={onReset}>
            Reiniciar torneo
          </button>
        </div>
      </header>

      {champion && (
        <div className="champion-banner">
          <div className="champion-label">Campeón</div>
          <div className="champion-body">
            {champion.imageDataUrl && (
              <img src={champion.imageDataUrl} alt={champion.name} />
            )}
            <div className="champion-name">{champion.name}</div>
          </div>
        </div>
      )}

      <div className="bracket-scroll">
        <div className="bracket">
          {rounds.map((roundMatches, roundIdx) => (
            <div
              key={roundIdx}
              className="bracket-round"
              data-round={roundIdx}
            >
              <div className="round-title">{ROUND_NAMES[roundIdx]}</div>
              <div className="round-matches">
                {roundMatches.map((m) => (
                  <div key={m.id} className="match-wrap">
                    <MatchCard
                      match={m}
                      participantsById={participantsById}
                      onVote={onVote}
                      onResetVotes={onResetVotes}
                      onFinalize={onFinalize}
                      onFocus={() => setFocusedMatchId(m.id)}
                      onRenameParticipant={onRenameParticipant}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {focusedMatch && (
        <FocusView
          match={focusedMatch}
          participantsById={participantsById}
          onClose={() => setFocusedMatchId(null)}
          onVote={onVote}
          onResetVotes={onResetVotes}
          onFinalize={onFinalize}
          onRenameParticipant={onRenameParticipant}
        />
      )}
    </div>
  );
}
