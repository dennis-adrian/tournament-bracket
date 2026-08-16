import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  addContestEntries,
  createContest,
  uploadEntryImage,
} from '../contest/api';
import { fileToJpegBlob, nameFromFile } from '../contest/images';
import { saveHostToken } from '../contest/tokens';
import { VOTING_SYSTEMS, type VotingSystem } from '../contest/types';
import { EditableName } from '../components/EditableName';
import { LightboxImage } from '../components/LightboxImage';

type DraftEntry = {
  id: string;
  name: string;
  file: File;
  previewUrl: string;
};

const DURATION_PRESETS = [5, 10, 15, 30];
const MAX_ENTRIES = 20;

export function CreateContestPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('Concurso de dibujos');
  const [system, setSystem] = useState<VotingSystem>('plurality');
  const [duration, setDuration] = useState(10);
  const [entries, setEntries] = useState<DraftEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canCreate = name.trim().length > 0 && entries.length >= 2 && !busy;

  async function handleFiles(fileList: FileList | null) {
    const files = Array.from(fileList ?? []).filter((file) =>
      file.type.startsWith('image/'),
    );
    if (files.length === 0) return;
    const remaining = MAX_ENTRIES - entries.length;
    const next = files.slice(0, remaining).map((file) => ({
      id: crypto.randomUUID(),
      name: nameFromFile(file),
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    setEntries((current) => [...current, ...next]);
    if (files.length > remaining) {
      setError(`Solo se pueden añadir ${MAX_ENTRIES} dibujos.`);
    } else {
      setError(null);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function removeEntry(id: string) {
    setEntries((current) => {
      const found = current.find((entry) => entry.id === id);
      if (found) URL.revokeObjectURL(found.previewUrl);
      return current.filter((entry) => entry.id !== id);
    });
  }

  async function handleCreate() {
    if (!canCreate) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createContest({
        name: name.trim(),
        votingSystem: system,
        durationMinutes: duration,
      });
      saveHostToken(created.slug, created.host_token, name.trim());

      const uploaded = [];
      for (const [index, entry] of entries.entries()) {
        const blob = await fileToJpegBlob(entry.file);
        const imagePath = await uploadEntryImage(created.id, entry.id, blob);
        uploaded.push({
          id: entry.id,
          name: entry.name.trim() || `Dibujo ${index + 1}`,
          image_path: imagePath,
          sort_order: index,
        });
      }
      await addContestEntries(created.slug, created.host_token, uploaded);
      navigate(`/contest/${created.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el concurso.');
      setBusy(false);
    }
  }

  return (
    <div className="setup">
      <p className="crumb">
        <Link to="/">Inicio</Link>
      </p>
      <header className="setup-header">
        <h1>Nuevo concurso de dibujos</h1>
        <p className="subtitle">
          Sube los dibujos, elige cómo se vota y define cuánto dura la ronda.
          Luego tendrás un enlace para compartir.
        </p>
      </header>

      <label className="field-label" htmlFor="contest-name">
        Nombre del concurso
      </label>
      <input
        id="contest-name"
        type="text"
        value={name}
        maxLength={80}
        onChange={(e) => setName(e.target.value)}
      />

      <h2 className="section-title">Sistema de votación</h2>
      <div className="system-grid">
        {VOTING_SYSTEMS.map((item) => (
          <label
            key={item.id}
            className={`system-card${system === item.id ? ' selected' : ''}`}
          >
            <input
              type="radio"
              name="voting-system"
              value={item.id}
              checked={system === item.id}
              onChange={() => setSystem(item.id)}
            />
            <strong>{item.label}</strong>
            <span>{item.summary}</span>
          </label>
        ))}
      </div>

      <h2 className="section-title">Tiempo de votación</h2>
      <p className="field-hint">
        La cuenta atrás empieza cuando abras la votación, no al crear el
        concurso.
      </p>
      <div className="duration-row">
        {DURATION_PRESETS.map((minutes) => (
          <button
            key={minutes}
            type="button"
            className={duration === minutes ? 'primary' : undefined}
            onClick={() => setDuration(minutes)}
          >
            {minutes} min
          </button>
        ))}
        <label className="duration-custom">
          <input
            type="number"
            min={1}
            max={180}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value) || 1)}
          />
          minutos
        </label>
      </div>

      <h2 className="section-title">Dibujos</h2>
      <div className="setup-form">
        <label className="file-label">
          Subir imagen(es)
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            onChange={(e) => void handleFiles(e.target.files)}
            disabled={entries.length >= MAX_ENTRIES}
          />
        </label>
        <p className="field-hint">
          {entries.length} / {MAX_ENTRIES} · JPG, PNG o WebP. Los nombres se
          pueden editar después de subir.
        </p>
      </div>

      <ul className="participant-list">
        {entries.map((entry, idx) => (
          <li key={entry.id}>
            <span className="idx">{idx + 1}.</span>
            <LightboxImage
              src={entry.previewUrl}
              alt={entry.name || 'Vista previa'}
              className="thumb"
            />
            <EditableName
              variant="participant"
              value={entry.name}
              onChange={(next) =>
                setEntries((current) =>
                  current.map((item) =>
                    item.id === entry.id ? { ...item, name: next } : item,
                  ),
                )
              }
              ariaLabel={`Nombre del dibujo ${idx + 1}`}
            />
            <button
              type="button"
              className="link danger"
              onClick={() => removeEntry(entry.id)}
            >
              Quitar
            </button>
          </li>
        ))}
      </ul>

      {error && <div className="error">{error}</div>}

      <div className="setup-actions">
        <button
          type="button"
          className="primary"
          onClick={() => void handleCreate()}
          disabled={!canCreate}
        >
          {busy
            ? 'Subiendo…'
            : entries.length < 2
              ? 'Añade al menos 2 dibujos'
              : 'Crear concurso'}
        </button>
      </div>
    </div>
  );
}
