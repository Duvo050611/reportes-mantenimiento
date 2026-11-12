import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

export class ErrorServicio extends Error {
  constructor(
    message: string,
    public tipo: 'validacion' | 'red' | 'servidor' | 'auth' | 'permiso',
  ) {
    super(message);
  }
}

export async function hayConexion(): Promise<boolean> {
  const r = await NetInfo.fetch();
  return !(r.isConnected === false || r.isInternetReachable === false);
}

/** Estado de la conexión en tiempo real. */
export function useConexion(): boolean {
  const [enLinea, setEnLinea] = useState(true);
  useEffect(
    () => NetInfo.addEventListener((r) => setEnLinea(!(r.isConnected === false || r.isInternetReachable === false))),
    [],
  );
  return enLinea;
}

export function conTimeout<T>(p: PromiseLike<T>, ms = 20_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new ErrorServicio('El servicio no respondió a tiempo. Revisa tu conexión.', 'red')), ms);
    Promise.resolve(p).then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });
}

/** Convierte errores de Supabase/PostgREST/Storage en mensajes claros sin filtrar detalles internos. */
export function traducirError(e: unknown): ErrorServicio {
  if (e instanceof ErrorServicio) return e;
  const err = e as { message?: string; code?: string; status?: number; statusCode?: string } | undefined;
  const m = err?.message ?? String(e);
  if (/network|fetch|internet|offline|timed out/i.test(m)) return new ErrorServicio('No fue posible conectar con el servicio en la nube.', 'red');
  if (/JWT|jwt expired|session|not authenticated/i.test(m) || err?.status === 401)
    return new ErrorServicio('Tu sesión expiró. Vuelve a iniciar sesión.', 'auth');
  if (/row-level security|permission denied|not allowed|unauthorized/i.test(m) || err?.code === '42501')
    return new ErrorServicio('No tienes permiso para realizar esta operación.', 'permiso');
  if (/mime type/i.test(m)) return new ErrorServicio('El servidor rechazó la foto: formato no permitido.', 'validacion');
  if (/exceeded|too large|maximum allowed size/i.test(m)) return new ErrorServicio('El servidor rechazó la foto: excede 5 MB.', 'validacion');
  if (err?.code === '23514') return new ErrorServicio('El servidor rechazó los datos: no cumplen las reglas de validación.', 'validacion');
  return new ErrorServicio('El servicio no está disponible en este momento. Inténtalo más tarde.', 'servidor');
}
