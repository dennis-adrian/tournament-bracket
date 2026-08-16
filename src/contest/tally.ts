import type { ContestVote, VotingSystem } from './types';

export type RankedEntry = {
  entryId: string;
  voteCount: number;
  place: number;
};

export type TallyResult = {
  ranking: RankedEntry[];
  winnerIds: string[];
};

function assignPlaces(sorted: { entryId: string; voteCount: number }[]): RankedEntry[] {
  return sorted.map((row, index) => {
    const prev = sorted[index - 1];
    const place =
      prev && prev.voteCount === row.voteCount
        ? sorted.findIndex((item) => item.voteCount === row.voteCount) + 1
        : index + 1;
    return { ...row, place };
  });
}

function countMap(entryIds: string[], votes: ContestVote[]): Map<string, number> {
  const counts = new Map(entryIds.map((id) => [id, 0]));
  for (const vote of votes) {
    counts.set(vote.entry_id, (counts.get(vote.entry_id) ?? 0) + 1);
  }
  return counts;
}

function rankingFromCounts(
  entryIds: string[],
  counts: Map<string, number>,
): TallyResult {
  const sorted = [...entryIds]
    .map((entryId) => ({ entryId, voteCount: counts.get(entryId) ?? 0 }))
    .sort((a, b) => b.voteCount - a.voteCount || a.entryId.localeCompare(b.entryId));
  const ranking = assignPlaces(sorted);
  const top = ranking[0]?.voteCount ?? 0;
  const winnerIds =
    ranking.filter((row) => row.voteCount === top && top > 0).map((row) => row.entryId);
  return { ranking, winnerIds };
}

function ballotsByVoter(votes: ContestVote[]): string[][] {
  const grouped = new Map<string, ContestVote[]>();
  for (const vote of votes) {
    const list = grouped.get(vote.voter_id) ?? [];
    list.push(vote);
    grouped.set(vote.voter_id, list);
  }
  return [...grouped.values()].map((rows) =>
    [...rows]
      .sort((a, b) => a.rank - b.rank)
      .map((row) => row.entry_id),
  );
}

/** Among tied last-place drawings, drop the weakest by original preferences. */
function pickEliminate(candidates: string[], ballots: string[][]): string {
  let tied = [...candidates];
  const maxRank = Math.max(0, ...ballots.map((ballot) => ballot.length));
  for (let rank = 0; rank < maxRank && tied.length > 1; rank++) {
    const counts = new Map(tied.map((id) => [id, 0]));
    for (const ballot of ballots) {
      const id = ballot[rank];
      if (id && counts.has(id)) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    let min = Infinity;
    for (const id of tied) min = Math.min(min, counts.get(id) ?? 0);
    const weakest = tied.filter((id) => (counts.get(id) ?? 0) === min);
    if (weakest.length === 1) return weakest[0];
    tied = weakest;
  }
  return [...tied].sort((a, b) => a.localeCompare(b))[tied.length - 1];
}

function instantRunoff(entryIds: string[], votes: ContestVote[]): TallyResult {
  const ballots = ballotsByVoter(votes);
  if (ballots.length === 0) {
    return rankingFromCounts(entryIds, countMap(entryIds, []));
  }

  const remaining = new Set(entryIds);
  let lastCounts = countMap(entryIds, []);

  while (remaining.size > 1) {
    const counts = new Map([...remaining].map((id) => [id, 0]));
    for (const ballot of ballots) {
      const choice = ballot.find((id) => remaining.has(id));
      if (choice) counts.set(choice, (counts.get(choice) ?? 0) + 1);
    }
    lastCounts = counts;

    const values = [...counts.values()];
    const max = Math.max(...values);
    const min = Math.min(...values);
    const activeBallots = values.reduce((sum, n) => sum + n, 0);
    const leaders = [...remaining].filter((id) => counts.get(id) === max);

    if (max * 2 > activeBallots && leaders.length === 1) {
      remaining.clear();
      remaining.add(leaders[0]);
      break;
    }

    const lastPlace = [...remaining].filter((id) => counts.get(id) === min);
    const drop =
      lastPlace.length === 1 ? lastPlace[0] : pickEliminate(lastPlace, ballots);
    remaining.delete(drop);
  }

  const ranking = [...entryIds]
    .map((entryId) => ({
      entryId,
      voteCount: lastCounts.get(entryId) ?? 0,
      remaining: remaining.has(entryId),
    }))
    .sort((a, b) => {
      if (a.remaining !== b.remaining) return a.remaining ? -1 : 1;
      return b.voteCount - a.voteCount || a.entryId.localeCompare(b.entryId);
    });

  const placed = assignPlaces(
    ranking.map(({ entryId, voteCount }) => ({ entryId, voteCount })),
  );
  const winnerIds = [...remaining];
  return { ranking: placed, winnerIds };
}

export function tallyVotes(
  system: VotingSystem,
  entryIds: string[],
  votes: ContestVote[] | null,
): TallyResult {
  const rows = votes ?? [];
  if (system === 'ranked') return instantRunoff(entryIds, rows);
  return rankingFromCounts(entryIds, countMap(entryIds, rows));
}
