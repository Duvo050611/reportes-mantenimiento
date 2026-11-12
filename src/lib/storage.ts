import { File } from 'expo-file-system';
import { Platform } from 'react-native';

import { conTimeout, ErrorServicio, hayConexion, traducirError } from './red';
import { supabase } from './supabase';

export const BUCKET = 'evidencias';
export const MAX_BYTES = 5 * 1024 * 1024; // igual que file_size_limit del bucket
export const TIPOS_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const URL_EXPIRA_SEG = 60 * 10; // URL firmadas válidas 10 minutos

const MIME_A_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export type FotoLocal = { uri: string; mimeType: string; size: number; webFile?: Blob };

export function formatoBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

/** Validación del lado del cliente (el bucket vuelve a validar en el servidor). */
export function validarFoto(f: FotoLocal): string | null {
  if (!(TIPOS_PERMITIDOS as readonly string[]).includes(f.mimeType)) return `Formato no permitido (${f.mimeType}). Usa JPG, PNG o WEBP.`;
  if (f.size > MAX_BYTES) return `La foto pesa ${formatoBytes(f.size)}; el máximo es ${formatoBytes(MAX_BYTES)}.`;
  if (f.size === 0) return 'La foto está vacía o no se pudo leer.';
  return null;
}

async function leerBytes(f: FotoLocal): Promise<ArrayBuffer> {
  if (Platform.OS === 'web') return (f.webFile ?? (await (await fetch(f.uri)).blob())).arrayBuffer();
  try {
    return await new File(f.uri).arrayBuffer();
  } catch {
    return (await fetch(f.uri)).arrayBuffer();
  }
}

/**
 * Sube la evidencia al bucket privado en  evidencias/<uid>/<id>.<ext>.
 * La petición viaja por HTTPS con el JWT del usuario; RLS exige que la carpeta sea su uid.
 */
export async function subirFoto(f: FotoLocal, nombreBase: string): Promise<string> {
  const error = validarFoto(f);
  if (error) throw new ErrorServicio(error, 'validacion');
  if (!(await hayConexion())) throw new ErrorServicio('Sin conexión a internet.', 'red');
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new ErrorServicio('No hay sesión activa.', 'auth');

  const path = `${auth.user.id}/${nombreBase}.${MIME_A_EXT[f.mimeType]}`;
  try {
    const bytes = await leerBytes(f);
    const { error: e } = await conTimeout(
      supabase.storage.from(BUCKET).upload(path, bytes, { contentType: f.mimeType, upsert: false }),
      45_000,
    );
    // "already exists": el reintento de una subida que sí llegó al servidor
    if (e && !/already exists|Duplicate/i.test(e.message)) throw e;
    return path;
  } catch (e) {
    throw traducirError(e);
  }
}

export async function urlFirmada(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, URL_EXPIRA_SEG);
  if (error) throw traducirError(error);
  return data.signedUrl;
}

export async function urlsFirmadas(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, URL_EXPIRA_SEG);
  if (error) throw traducirError(error);
  const mapa: Record<string, string> = {};
  for (const d of data) if (d.path && d.signedUrl) mapa[d.path] = d.signedUrl;
  return mapa;
}
