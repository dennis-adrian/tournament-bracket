import type { Match, MatchSlot, Participant, Tournament } from './types';
import { ROUND_NAMES } from './types';
import { getMatchOutcome, matchesByRound } from './bracket';

/**
 * Canvas-based PNG export of the full tournament bracket.
 *
 * Participant images are drawn at 120×120 px so their content stays
 * recognizable in the exported image.
 */

const LAYOUT = {
  PAD: 48,
  HEADER: 120,
  FOOTER: 48,
  COL_W: 280,
  COL_GAP: 96,
  SLOT_H: 140,
  SLOT_GAP: 14, // between A and B inside a match
  MATCH_GAP: 24, // vertical gap between adjacent R16 matches
  IMG: 120,
};

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = src;
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function truncate(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) {
    t = t.slice(0, -1);
  }
  return t + '…';
}

export async function exportBracketImage(tournament: Tournament): Promise<void> {
  const {
    PAD,
    HEADER,
    FOOTER,
    COL_W,
    COL_GAP,
    SLOT_H,
    SLOT_GAP,
    MATCH_GAP,
    IMG,
  } = LAYOUT;

  const rounds = matchesByRound(tournament);
  const matchH = 2 * SLOT_H + SLOT_GAP;

  // R16 (round 1) acts as the vertical spine: 8 matches stacked.
  const r16Count = rounds[1].length;
  const r16Total = r16Count * matchH + (r16Count - 1) * MATCH_GAP;

  const canvasW = PAD * 2 + 5 * COL_W + 4 * COL_GAP;
  const canvasH = HEADER + r16Total + FOOTER;

  // --- Layout: compute the vertical center Y of each match ---
  const matchCenters: Record<string, number> = {};

  // R16 matches (round 1): evenly stacked.
  rounds[1].forEach((m, i) => {
    matchCenters[m.id] = HEADER + i * (matchH + MATCH_GAP) + matchH / 2;
  });

  const slotOffset = (SLOT_H + SLOT_GAP) / 2;
  const slotCenterY = (match: Match, slot: MatchSlot): number => {
    const c = matchCenters[match.id];
    return c + (slot === 'A' ? -slotOffset : slotOffset);
  };

  // Rounds 2..4 are the midpoint of their two feeding children.
  for (let r = 2; r <= 4; r++) {
    rounds[r].forEach((m) => {
      const children = rounds[r - 1].filter((c) => c.nextMatchId === m.id);
      if (children.length === 2) {
        matchCenters[m.id] =
          (matchCenters[children[0].id] + matchCenters[children[1].id]) / 2;
      }
    });
  }

  // Play-in (round 0): align each match vertically to the R16 slot it feeds,
  // so the connector is a clean horizontal line.
  rounds[0].forEach((m) => {
    if (!m.nextMatchId || !m.nextSlot) return;
    const target = tournament.matches.find((x) => x.id === m.nextMatchId);
    if (!target) return;
    matchCenters[m.id] = slotCenterY(target, m.nextSlot);
  });

  // --- Preload participant images ---
  const participantsById: Record<string, Participant> = {};
  for (const p of tournament.participants) participantsById[p.id] = p;

  const imageCache: Record<string, HTMLImageElement> = {};
  await Promise.all(
    tournament.participants
      .filter((p) => !!p.imageDataUrl)
      .map(async (p) => {
        try {
          imageCache[p.id] = await loadImage(p.imageDataUrl!);
        } catch {
          /* ignore broken images; fall back to letter placeholder */
        }
      }),
  );

  // --- Create canvas (retina quality) ---
  const dpr = 2;
  const canvas = document.createElement('canvas');
  canvas.width = canvasW * dpr;
  canvas.height = canvasH * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.scale(dpr, dpr);

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasW, canvasH);

  // --- Title / header ---
  ctx.fillStyle = '#08060d';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = 'bold 38px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.fillText('Tournament Bracket', PAD, 34);

  ctx.fillStyle = '#6b6375';
  ctx.font = '15px system-ui, sans-serif';
  ctx.fillText(new Date().toLocaleDateString(), PAD, 78);

  // Champion banner (top right)
  if (tournament.champion) {
    const champ = participantsById[tournament.champion];
    if (champ) {
      ctx.textAlign = 'right';
      ctx.fillStyle = '#aa3bff';
      ctx.font =
        'bold 13px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
      ctx.fillText('CHAMPION', canvasW - PAD, 34);
      ctx.fillStyle = '#08060d';
      ctx.font =
        'bold 30px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
      ctx.fillText(truncate(ctx, champ.name, 420), canvasW - PAD, 54);
    }
  }

  // Round labels
  ctx.textAlign = 'center';
  ctx.fillStyle = '#6b6375';
  ctx.font =
    'bold 12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  const colX = (round: number) => PAD + round * (COL_W + COL_GAP);
  for (let r = 0; r < 5; r++) {
    const cx = colX(r) + COL_W / 2;
    ctx.fillText(ROUND_NAMES[r].toUpperCase(), cx, HEADER - 28);
  }

  // --- Connector lines (drawn before boxes so they sit behind) ---
  ctx.strokeStyle = '#c4c2ca';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  for (let r = 0; r < 4; r++) {
    for (const m of rounds[r]) {
      if (!m.nextMatchId || !m.nextSlot) continue;
      const next = tournament.matches.find((x) => x.id === m.nextMatchId);
      if (!next) continue;

      const startX = colX(r) + COL_W;
      const startY = matchCenters[m.id];
      const endX = colX(r + 1);
      const endY = slotCenterY(next, m.nextSlot);
      const midX = (startX + endX) / 2;

      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(midX, startY);
      ctx.lineTo(midX, endY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
    }
  }

  // --- Draw each match ---
  const drawSlot = (
    x: number,
    y: number,
    w: number,
    h: number,
    participant: Participant | null,
    votes: number,
    isWinner: boolean,
    isLoser: boolean,
  ) => {
    ctx.fillStyle = isWinner ? '#d9f5e5' : '#f4f3ec';
    roundRect(ctx, x, y, w, h, 10);
    ctx.fill();

    if (isWinner) {
      ctx.strokeStyle = '#1fb56a';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    } else {
      ctx.strokeStyle = '#e5e4e7';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Image / avatar
    const imgX = x + 10;
    const imgY = y + (h - IMG) / 2;
    ctx.save();
    roundRect(ctx, imgX, imgY, IMG, IMG, 8);
    ctx.clip();

    const cached = participant ? imageCache[participant.id] : null;
    if (cached) {
      const scale = Math.max(IMG / cached.width, IMG / cached.height);
      const dw = cached.width * scale;
      const dh = cached.height * scale;
      ctx.drawImage(
        cached,
        imgX + (IMG - dw) / 2,
        imgY + (IMG - dh) / 2,
        dw,
        dh,
      );
    } else if (participant) {
      // Letter placeholder
      ctx.fillStyle = '#eadcff';
      ctx.fillRect(imgX, imgY, IMG, IMG);
      ctx.fillStyle = '#aa3bff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font =
        'bold 64px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
      ctx.fillText(
        participant.name.slice(0, 1).toUpperCase(),
        imgX + IMG / 2,
        imgY + IMG / 2 + 2,
      );
    } else {
      // Empty / TBD
      ctx.fillStyle = '#efeef1';
      ctx.fillRect(imgX, imgY, IMG, IMG);
      ctx.fillStyle = '#b5b3ba';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '40px system-ui, sans-serif';
      ctx.fillText('?', imgX + IMG / 2, imgY + IMG / 2);
    }
    ctx.restore();

    // Name + votes (right column)
    const textX = imgX + IMG + 16;
    const textMaxW = w - IMG - 40;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    ctx.fillStyle = isLoser ? '#9a98a1' : '#08060d';
    ctx.font = isWinner
      ? 'bold 20px system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
      : '18px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    const name = participant ? participant.name : 'TBD';
    const truncName = truncate(ctx, name, textMaxW);
    const nameY = y + h / 2 - 4;
    ctx.fillText(truncName, textX, nameY);

    // Strikethrough on losers
    if (isLoser && participant) {
      const nameWidth = ctx.measureText(truncName).width;
      ctx.strokeStyle = '#9a98a1';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(textX, nameY - 6);
      ctx.lineTo(textX + nameWidth, nameY - 6);
      ctx.stroke();
    }

    // Votes line
    ctx.fillStyle = '#6b6375';
    ctx.font = '14px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    const voteText = participant
      ? `${votes} vote${votes === 1 ? '' : 's'}`
      : '';
    ctx.fillText(voteText, textX, y + h / 2 + 20);
  };

  const drawMatch = (m: Match, round: number) => {
    const x = colX(round);
    const centerY = matchCenters[m.id];
    const topY = centerY - matchH / 2;

    const a = m.participantA ? participantsById[m.participantA] : null;
    const b = m.participantB ? participantsById[m.participantB] : null;
    const { winner, loser } = getMatchOutcome(m, participantsById);

    drawSlot(
      x,
      topY,
      COL_W,
      SLOT_H,
      a,
      m.votesA,
      winner === a,
      loser === a,
    );
    drawSlot(
      x,
      topY + SLOT_H + SLOT_GAP,
      COL_W,
      SLOT_H,
      b,
      m.votesB,
      winner === b,
      loser === b,
    );
  };

  for (let r = 0; r < 5; r++) {
    for (const m of rounds[r]) drawMatch(m, r);
  }

  // --- Download ---
  await new Promise<void>((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        resolve();
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `tournament-bracket-${new Date()
        .toISOString()
        .slice(0, 10)}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      // Defer revoke so the browser has time to initiate the download.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      resolve();
    }, 'image/png');
  });
}
