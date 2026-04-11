import type { Tournament } from './types';

const STORAGE_KEY = 'tournament-bracket-v1';

export function loadTournament(): Tournament | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Tournament;
  } catch (err) {
    console.error('Failed to load tournament from localStorage', err);
    return null;
  }
}

export function saveTournament(tournament: Tournament): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tournament));
  } catch (err) {
    console.error('Failed to save tournament to localStorage', err);
  }
}

export function clearTournament(): void {
  localStorage.removeItem(STORAGE_KEY);
}
