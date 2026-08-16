import { useEffect, useState } from 'react';
import type { MatchSlot, Participant, Tournament } from '../types';
import {
  castVote,
  finalizeMatch as finalizeMatchFn,
  generateBracket,
  resetVotes,
} from '../bracket';
import { clearTournament, loadTournament, saveTournament } from '../storage';
import { ParticipantSetup } from '../components/ParticipantSetup';
import { BracketView } from '../components/BracketView';

type AppState = {
  participants: Participant[];
  tournament: Tournament | null;
};

const emptyState: AppState = { participants: [], tournament: null };

export function BracketPage() {
  const [state, setState] = useState<AppState>(() => {
    const saved = loadTournament();
    if (!saved) return emptyState;
    if (saved.started) {
      return { participants: saved.participants, tournament: saved };
    }
    return { participants: saved.participants, tournament: null };
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      if (state.tournament) {
        saveTournament(state.tournament);
      } else if (state.participants.length > 0) {
        saveTournament({
          participants: state.participants,
          matches: [],
          started: false,
          champion: null,
        });
      } else {
        clearTournament();
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [state]);

  function handleParticipantsChange(next: Participant[]) {
    setState((s) => ({ ...s, participants: next }));
  }

  function handleStart() {
    const tournament = generateBracket(state.participants);
    setState({ participants: state.participants, tournament });
  }

  function handleVote(matchId: string, slot: MatchSlot) {
    setState((s) => {
      if (!s.tournament) return s;
      return { ...s, tournament: castVote(s.tournament, matchId, slot) };
    });
  }

  function handleResetVotes(matchId: string) {
    setState((s) => {
      if (!s.tournament) return s;
      return { ...s, tournament: resetVotes(s.tournament, matchId) };
    });
  }

  function handleFinalize(matchId: string, winnerId: string) {
    setState((s) => {
      if (!s.tournament) return s;
      return {
        ...s,
        tournament: finalizeMatchFn(s.tournament, matchId, winnerId),
      };
    });
  }

  function handleRenameParticipant(id: string, name: string) {
    setState((s) => {
      if (!s.tournament) return s;
      const participants = s.tournament.participants.map((p) =>
        p.id === id ? { ...p, name } : p,
      );
      return {
        ...s,
        tournament: { ...s.tournament, participants },
      };
    });
  }

  function handleReset() {
    const confirmed = window.confirm(
      '¿Reiniciar el torneo? Se borrarán participantes, imágenes, votos y ganadores.',
    );
    if (!confirmed) return;
    clearTournament();
    setState(emptyState);
  }

  if (state.tournament) {
    return (
      <BracketView
        tournament={state.tournament}
        onVote={handleVote}
        onResetVotes={handleResetVotes}
        onFinalize={handleFinalize}
        onReset={handleReset}
        onRenameParticipant={handleRenameParticipant}
      />
    );
  }

  return (
    <ParticipantSetup
      participants={state.participants}
      onChange={handleParticipantsChange}
      onStart={handleStart}
    />
  );
}
