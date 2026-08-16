import { getSupabase, publicImageUrl } from '../lib/supabase';
import type { ContestView, VotingSystem } from './types';

const RPC_ERRORS_ES: Record<string, string> = {
  'Host token required': 'Se necesita el token del organizador',
  'Invalid host token': 'Token de organizador no válido',
  'Contest name must be between 1 and 80 characters':
    'El nombre del concurso debe tener entre 1 y 80 caracteres',
  'Duration must be between 1 and 180 minutes':
    'La duración debe estar entre 1 y 180 minutos',
  'Invalid voting system': 'Sistema de votación no válido',
  'Could not allocate a unique link': 'No se pudo generar un enlace único',
  'Contest not found': 'No se encontró el concurso',
  'Drawings can only be added before voting starts':
    'Solo se pueden añadir dibujos antes de que empiece la votación',
  'Entries must be an array': 'Los dibujos deben enviarse como una lista',
  'Add between 2 and 20 drawings': 'Añade entre 2 y 20 dibujos',
  'Each drawing needs a valid id': 'Cada dibujo necesita un identificador válido',
  'Duplicate drawing id': 'Hay un dibujo duplicado',
  'Each drawing needs a name': 'Cada dibujo necesita un nombre',
  'Invalid image path': 'Ruta de imagen no válida',
  'Each drawing needs a sort order': 'Cada dibujo necesita un orden',
  'Voting has already started': 'La votación ya empezó',
  'Add at least 2 drawings before starting':
    'Añade al menos 2 dibujos antes de empezar',
  'Voting has not started': 'La votación aún no empieza',
  'Voting is closed': 'La votación está cerrada',
  'Missing voter token': 'Falta el token de votante',
  'Name must be between 1 and 40 characters':
    'El nombre debe tener entre 1 y 40 caracteres',
  'That name is already taken': 'Ese nombre ya está en uso',
  'Voting is not open': 'La votación no está abierta',
  'Votes must be an array': 'Los votos deben enviarse como una lista',
  'Join with your name before voting': 'Entra con tu nombre antes de votar',
  'You have already voted': 'Ya votaste',
  'Pick exactly one drawing': 'Elige exactamente un dibujo',
  'Pick at least one drawing': 'Elige al menos un dibujo',
  'Rank every drawing': 'Ordena todos los dibujos',
  'Invalid vote': 'Voto no válido',
  'Invalid drawing': 'Dibujo no válido',
  'Duplicate drawing in ballot': 'Hay un dibujo duplicado en tu voto',
  'Ranks must be a unique 1 to n ordering':
    'El ranking debe ser un orden único del 1 al n',
  'Ranks must be a unique 1…n ordering':
    'El ranking debe ser un orden único del 1 al n',
  'Invalid rank': 'Posición no válida',
};

function rpcError(message: string | undefined): Error {
  const raw = message || 'Algo salió mal. Inténtalo de nuevo.';
  const match = Object.entries(RPC_ERRORS_ES).find(([english]) =>
    raw.includes(english),
  );
  return new Error(match ? match[1] : raw);
}

export async function createContest(input: {
  name: string;
  votingSystem: VotingSystem;
  durationMinutes: number;
}): Promise<{ id: string; slug: string; host_token: string }> {
  const { data, error } = await getSupabase().rpc('create_contest', {
    p_name: input.name,
    p_voting_system: input.votingSystem,
    p_duration_minutes: input.durationMinutes,
  });
  if (error) throw rpcError(error.message);
  return data as { id: string; slug: string; host_token: string };
}

export async function addContestEntries(
  slug: string,
  hostToken: string,
  entries: { id: string; name: string; image_path: string; sort_order: number }[],
): Promise<void> {
  const { error } = await getSupabase().rpc('add_contest_entries', {
    p_slug: slug,
    p_host_token: hostToken,
    p_entries: entries,
  });
  if (error) throw rpcError(error.message);
}

export async function startContest(slug: string, hostToken: string): Promise<void> {
  const { error } = await getSupabase().rpc('start_contest', {
    p_slug: slug,
    p_host_token: hostToken,
  });
  if (error) throw rpcError(error.message);
}

export async function closeContest(slug: string, hostToken: string): Promise<void> {
  const { error } = await getSupabase().rpc('close_contest', {
    p_slug: slug,
    p_host_token: hostToken,
  });
  if (error) throw rpcError(error.message);
}

export async function joinContest(
  slug: string,
  displayName: string,
  clientToken: string,
): Promise<void> {
  const { error } = await getSupabase().rpc('join_contest', {
    p_slug: slug,
    p_display_name: displayName,
    p_client_token: clientToken,
  });
  if (error) throw rpcError(error.message);
}

export async function submitVotes(
  slug: string,
  clientToken: string,
  votes: { entry_id: string; rank: number }[],
): Promise<void> {
  const { error } = await getSupabase().rpc('submit_votes', {
    p_slug: slug,
    p_client_token: clientToken,
    p_votes: votes,
  });
  if (error) throw rpcError(error.message);
}

export async function fetchContest(
  slug: string,
  hostToken: string | null,
  clientToken: string | null,
): Promise<ContestView> {
  const { data, error } = await getSupabase().rpc('get_contest', {
    p_slug: slug,
    p_host_token: hostToken,
    p_client_token: clientToken,
  });
  if (error) throw rpcError(error.message);
  return data as ContestView;
}

export async function uploadEntryImage(
  contestId: string,
  entryId: string,
  blob: Blob,
): Promise<string> {
  const path = `${contestId}/${entryId}.jpg`;
  const { error } = await getSupabase()
    .storage.from('contest-entries')
    .upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (error) throw rpcError(error.message);
  return path;
}

export { publicImageUrl };
