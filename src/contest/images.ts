const MAX_DIM = 1600;
const JPEG_QUALITY = 0.85;
const MAX_BYTES = 2 * 1024 * 1024;

export async function fileToJpegBlob(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo leer esta imagen.');
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    );
    if (!blob) throw new Error('No se pudo procesar esta imagen.');
    if (blob.size > MAX_BYTES) {
      throw new Error(
        'La imagen sigue siendo demasiado grande. Prueba con un archivo más pequeño.',
      );
    }
    return blob;
  } catch (err) {
    if (
      err instanceof Error &&
      err.message.startsWith('La imagen sigue siendo')
    ) {
      throw err;
    }
    if (file.type === 'image/jpeg' && file.size <= MAX_BYTES) return file;
    throw new Error(
      'No se pudo leer esta imagen. Usa JPG, PNG o WebP de menos de 2 MB.',
    );
  }
}

export function nameFromFile(file: File): string {
  return file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Sin título';
}
