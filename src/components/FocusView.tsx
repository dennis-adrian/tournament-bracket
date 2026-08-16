import { useEffect, useState } from 'react';
import type { Match, MatchSlot, Participant } from '../types';
import { MAX_VOTES_PER_MATCH, ROUND_NAMES } from '../types';
import { getMatchOutcome, leadingParticipant } from '../bracket';
import { EditableName } from './EditableName';

type Props = {
  match: Match;
  participantsById: Record<string, Participant>;
  onClose: () => void;
  onVote: (matchId: string, slot: MatchSlot) => void;
  onResetVotes: (matchId: string) => void;
  onFinalize: (matchId: string, winnerId: string) => void;
  onRenameParticipant: (id: string, name: string) => void;
};

function Side({
  participant,
  votes,
  isWinner,
  isLoser,
  onVote,
  onRename,
  disabled,
}: {
  participant: Participant;
  votes: number;
  isWinner: boolean;
  isLoser: boolean;
  onVote: () => void;
  onRename: (name: string) => void;
  disabled: boolean;
}) {
  const classes = [
    'focus-side',
    isWinner && 'winner',
    isLoser && 'loser',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes}>
      <div className="focus-image">
        {participant.imageDataUrl ? (
          <img src={participant.imageDataUrl} alt={participant.name} />
        ) : (
          <div className="focus-placeholder">
            {participant.name.slice(0, 1).toUpperCase()}
          </div>
        )}
      </div>
      <EditableName
        variant="focus"
        value={participant.name}
        onChange={onRename}
        ariaLabel="Editar nombre del participante"
      />
      <div className="focus-votes">{votes}</div>
      <button
        type="button"
        className="focus-vote-btn"
        onClick={onVote}
        disabled={disabled}
      >
        Votar
      </button>
    </div>
  );
}

export function FocusView({
  match,
  participantsById,
  onClose,
  onVote,
  onResetVotes,
  onFinalize,
  onRenameParticipant,
}: Props) {
  const [tiePicking, setTiePicking] = useState(false);

  const a = match.participantA ? participantsById[match.participantA] : null;
  const b = match.participantB ? participantsById[match.participantB] : null;

  const totalVotes = match.votesA + match.votesB;
  const isFull = totalVotes >= MAX_VOTES_PER_MATCH;
  const isLocked = !!match.winner;
  const leader = leadingParticipant(match);
  const isTied = totalVotes > 0 && match.votesA === match.votesB;

  // Close on Escape; vote with A/B. Skip A/B shortcuts while a text field is
  // focused so typing names doesn't accidentally cast votes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      const target = e.target as HTMLElement | null;
      const isEditing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;
      if (isEditing) return;
      if (isLocked || !a || !b) return;
      if (e.key === 'a' || e.key === 'A') {
        if (!isFull) onVote(match.id, 'A');
      } else if (e.key === 'b' || e.key === 'B') {
        if (!isFull) onVote(match.id, 'B');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [match.id, isFull, isLocked, a, b, onClose, onVote]);

  function handleFinalize() {
    if (!a || !b || isLocked || totalVotes === 0) return;
    if (leader) {
      onFinalize(match.id, leader);
      return;
    }
    setTiePicking(true);
  }

  function handlePickWinner(id: string) {
    setTiePicking(false);
    onFinalize(match.id, id);
  }

  const { winner: winnerParticipant, loser: loserParticipant } = getMatchOutcome(
    match,
    participantsById,
  );

  if (!a || !b) {
    return (
      <div className="focus-overlay" onClick={onClose}>
        <div className="focus-inner" onClick={(e) => e.stopPropagation()}>
          <div className="focus-round">{ROUND_NAMES[match.round]}</div>
          <div className="focus-empty">
            Este enfrentamiento aún no está listo: falta la ronda anterior.
          </div>
          <button type="button" className="focus-close" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="focus-overlay" onClick={onClose}>
      <div className="focus-inner" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="focus-close"
          onClick={onClose}
          aria-label="Cerrar"
        >
          ×
        </button>

        <div className="focus-round">{ROUND_NAMES[match.round]}</div>

        <div className="focus-versus">
          <Side
            participant={a}
            votes={match.votesA}
            isWinner={winnerParticipant === a}
            isLoser={loserParticipant === a}
            onVote={() => onVote(match.id, 'A')}
            onRename={(name) => onRenameParticipant(a.id, name)}
            disabled={isFull || isLocked}
          />
          <div className="focus-vs">VS</div>
          <Side
            participant={b}
            votes={match.votesB}
            isWinner={winnerParticipant === b}
            isLoser={loserParticipant === b}
            onVote={() => onVote(match.id, 'B')}
            onRename={(name) => onRenameParticipant(b.id, name)}
            disabled={isFull || isLocked}
          />
        </div>

        <div className="focus-controls">
          {isLocked ? (
            <div className="focus-status">
              Ganador:{' '}
              <strong>
                {winnerParticipant ? winnerParticipant.name : '—'}
              </strong>
            </div>
          ) : tiePicking ? (
            <div className="focus-tiebreak">
              <span>¡Empate! Elige un ganador:</span>
              <button
                type="button"
                onClick={() => handlePickWinner(a.id)}
              >
                {a.name}
              </button>
              <button
                type="button"
                onClick={() => handlePickWinner(b.id)}
              >
                {b.name}
              </button>
              <button
                type="button"
                className="link"
                onClick={() => setTiePicking(false)}
              >
                Cancelar
              </button>
            </div>
          ) : (
            <>
              <div className="focus-vote-count">
                {totalVotes} / {MAX_VOTES_PER_MATCH} votos
              </div>
              {totalVotes > 0 && (
                <button
                  type="button"
                  className="link"
                  onClick={() => onResetVotes(match.id)}
                >
                  Reiniciar votos
                </button>
              )}
              <button
                type="button"
                className="primary"
                onClick={handleFinalize}
                disabled={totalVotes === 0}
              >
                {isTied ? 'Finalizar (empate)' : 'Finalizar enfrentamiento'}
              </button>
            </>
          )}
        </div>

        <div className="focus-hint">
          Pulsa <kbd>A</kbd> / <kbd>B</kbd> para votar · <kbd>Esc</kbd> para cerrar
        </div>
      </div>
    </div>
  );
}
