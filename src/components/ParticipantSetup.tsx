import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Participant } from '../types';
import { TARGET_PARTICIPANTS } from '../types';
import { newId } from '../bracket';
import { EditableName } from './EditableName';
import { LightboxImage } from './LightboxImage';

type Props = {
  participants: Participant[];
  onChange: (next: Participant[]) => void;
  onStart: () => void;
};

const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB

function readImageAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function ParticipantSetup({ participants, onChange, onStart }: Props) {
  const [name, setName] = useState('');
  const [pendingImage, setPendingImage] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canAdd = name.trim().length > 0 && participants.length < TARGET_PARTICIPANTS;
  const canStart = participants.length === TARGET_PARTICIPANTS;

  function nameFromFile(file: File): string {
    return file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Sin título';
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    // Single file → keep the "pending image, manually name" flow.
    if (files.length === 1) {
      const file = files[0];
      if (file.size > MAX_IMAGE_BYTES) {
        setError('La imagen es demasiado grande. Usa un archivo de menos de 2 MB.');
        e.target.value = '';
        return;
      }
      try {
        const dataUrl = await readImageAsDataUrl(file);
        setPendingImage(dataUrl);
        setError(null);
      } catch {
        setError('No se pudo leer la imagen.');
      }
      return;
    }

    // Multiple files → bulk-add one participant per image, naming from filename.
    const remaining = TARGET_PARTICIPANTS - participants.length;
    if (remaining <= 0) {
      setError('No quedan cupos disponibles.');
      e.target.value = '';
      return;
    }

    const tooLarge = files.filter((f) => f.size > MAX_IMAGE_BYTES);
    const usable = files.filter((f) => f.size <= MAX_IMAGE_BYTES).slice(0, remaining);

    try {
      const newParticipants: Participant[] = await Promise.all(
        usable.map(async (file) => ({
          id: newId(),
          name: nameFromFile(file),
          imageDataUrl: await readImageAsDataUrl(file),
        })),
      );

      onChange([...participants, ...newParticipants]);

      const skipped = files.length - usable.length;
      if (skipped > 0) {
        const reasons: string[] = [];
        if (tooLarge.length > 0) {
          reasons.push(`${tooLarge.length} de más de 2 MB`);
        }
        if (files.length - tooLarge.length > remaining) {
          reasons.push(
            `${files.length - tooLarge.length - remaining} por encima del límite de ${TARGET_PARTICIPANTS}`,
          );
        }
        setError(`Se omitieron ${skipped} archivo(s): ${reasons.join(', ')}.`);
      } else {
        setError(null);
      }
    } catch {
      setError('No se pudo leer una o más imágenes.');
    }

    e.target.value = '';
  }

  function handleAdd() {
    if (!canAdd) return;
    const next: Participant = {
      id: newId(),
      name: name.trim(),
      imageDataUrl: pendingImage,
    };
    onChange([...participants, next]);
    setName('');
    setPendingImage(undefined);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  }

  function handleRemove(id: string) {
    onChange(participants.filter((p) => p.id !== id));
  }

  function handleRename(id: string, nextName: string) {
    onChange(
      participants.map((p) => (p.id === id ? { ...p, name: nextName } : p)),
    );
  }

  return (
    <div className="setup">
      <p className="crumb">
        <Link to="/">Inicio</Link>
      </p>
      <header className="setup-header">
        <h1>Llave del torneo</h1>
        <p className="subtitle">
          Añade {TARGET_PARTICIPANTS} participantes para empezar la llave.
          Escribe un nombre con una imagen opcional, o selecciona varias
          imágenes a la vez (el nombre del archivo se convierte en el nombre).
        </p>
      </header>

      <div className="setup-form">
        <div className="form-row">
          <input
            type="text"
            placeholder="Nombre del participante"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={participants.length >= TARGET_PARTICIPANTS}
          />
          <label className="file-label">
            {pendingImage ? 'Cambiar imagen' : 'Subir imagen(es)'}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileChange}
              disabled={participants.length >= TARGET_PARTICIPANTS}
            />
          </label>
            <button type="button" onClick={handleAdd} disabled={!canAdd}>
            Añadir
          </button>
        </div>

        {pendingImage && (
          <div className="pending-preview">
            <LightboxImage src={pendingImage} alt="Vista previa" />
            <button
              type="button"
              className="link"
              onClick={() => {
                setPendingImage(undefined);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
            >
              Quitar imagen
            </button>
          </div>
        )}

        {error && <div className="error">{error}</div>}
      </div>

      <div className="setup-progress">
        <strong>{participants.length}</strong> / {TARGET_PARTICIPANTS} añadidos
      </div>

      <ul className="participant-list">
        {participants.map((p, idx) => (
          <li key={p.id}>
            <span className="idx">{idx + 1}.</span>
            {p.imageDataUrl ? (
              <LightboxImage
                src={p.imageDataUrl}
                alt={p.name}
                className="thumb"
              />
            ) : (
              <span className="thumb placeholder" aria-hidden="true">
                {p.name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <EditableName
              variant="participant"
              value={p.name}
              onChange={(next) => handleRename(p.id, next)}
              ariaLabel={`Nombre del participante ${idx + 1}`}
            />
            <button
              type="button"
              className="link danger"
              onClick={() => handleRemove(p.id)}
            >
              Quitar
            </button>
          </li>
        ))}
      </ul>

      <div className="setup-actions">
        <button
          type="button"
          className="primary"
          onClick={onStart}
          disabled={!canStart}
        >
          {canStart
            ? 'Empezar torneo'
            : `Añade ${TARGET_PARTICIPANTS - participants.length} más para empezar`}
        </button>
      </div>
    </div>
  );
}
