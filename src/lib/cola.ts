import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { enviarReporte, type BorradorReporte } from './reportes';
import { ErrorServicio } from './red';

/**
 * Cola de reportes pendientes de envío. Si no hay internet o el servicio en la nube no
 * responde, el reporte se guarda en el dispositivo (sin tokens ni credenciales) y se
 * reintenta después. El idCliente evita duplicados si un intento sí llegó al servidor.
 */
const CLAVE = 'cola-reportes-v1';

export type Pendiente = BorradorReporte & { guardadoEn: string; ultimoError?: string };

export async function leerCola(): Promise<Pendiente[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(CLAVE)) ?? '[]') as Pendiente[];
  } catch {
    return [];
  }
}

async function escribirCola(c: Pendiente[]) {
  await AsyncStorage.setItem(CLAVE, JSON.stringify(c));
}

/** Copia la foto al almacenamiento privado de la app para que no se pierda si el SO limpia la caché. */
function persistirFoto(b: BorradorReporte): BorradorReporte {
  if (!b.foto || Platform.OS === 'web') return b;
  try {
    const dir = new Directory(Paths.document, 'pendientes');
    if (!dir.exists) dir.create();
    const destino = new File(dir, `${b.idCliente}.${b.foto.mimeType.split('/')[1]}`);
    if (!destino.exists) new File(b.foto.uri).copy(destino);
    return { ...b, foto: { ...b.foto, uri: destino.uri, webFile: undefined } };
  } catch {
    return b;
  }
}

export async function encolar(b: BorradorReporte, motivo: string) {
  const c = await leerCola();
  if (c.some((p) => p.idCliente === b.idCliente)) return;
  c.push({ ...persistirFoto(b), guardadoEn: new Date().toISOString(), ultimoError: motivo });
  await escribirCola(c);
}

export async function descartar(idCliente: string) {
  await escribirCola((await leerCola()).filter((p) => p.idCliente !== idCliente));
}

/** Reintenta enviar todos los pendientes. Devuelve cuántos se enviaron y cuántos siguen pendientes. */
export async function sincronizar(): Promise<{ enviados: number; pendientes: number }> {
  const c = await leerCola();
  const restantes: Pendiente[] = [];
  let enviados = 0;
  for (const p of c) {
    try {
      await enviarReporte(p);
      enviados++;
      if (p.foto && Platform.OS !== 'web') {
        try {
          new File(p.foto.uri).delete();
        } catch {}
      }
    } catch (e) {
      const err = e instanceof ErrorServicio ? e : new ErrorServicio(String(e), 'servidor');
      // Un error de validación no se arreglará reintentando: se conserva para que el usuario lo vea.
      restantes.push({ ...p, ultimoError: err.message });
    }
  }
  await escribirCola(restantes);
  return { enviados, pendientes: restantes.length };
}
