import { useEffect, useState } from 'react';
import type { MatchSlot, Participant, Tournament } from './types';
import {
  castVote,
  finalizeMatch as finalizeMatchFn,
  generateBracket,
  resetVotes,
} from './bracket';
import { clearTournament, loadTournament, saveTournament } from './storage';
import { ParticipantSetup } from './components/ParticipantSetup';
import { BracketView } from './components/BracketView';
import './App.css';

type AppState = {
  participants: Participant[]; // pre-start roster
  tournament: Tournament | null; // non-null once started
};

const emptyState: AppState = { participants: [], tournament: null };

function App() {
  const [state, setState] = useState<AppState>(emptyState);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage on first mount.
  useEffect(() => {
    const saved = loadTournament();
    if (saved) {
      if (saved.started) {
        setState({ participants: saved.participants, tournament: saved });
      } else {
        setState({ participants: saved.participants, tournament: null });
      }
    }
    setHydrated(true);
  }, []);

  // Persist on every change after hydration. Debounced so rapid updates
  // (e.g. typing in a name field) don't re-serialize the whole tournament —
  // including base64 image data URLs — on every keystroke.
  useEffect(() => {
    if (!hydrated) return;
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
  }, [state, hydrated]);

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
      'Reset the tournament? All participants, images, votes, and winners will be cleared.',
    );
    if (!confirmed) return;
    clearTournament();
    setState(emptyState);
  }

  if (!hydrated) return null;

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

export default App;
