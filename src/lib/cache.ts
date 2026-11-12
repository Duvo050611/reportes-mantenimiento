import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Reporte } from './reportes';

/** Última consulta exitosa, para mostrar algo útil si el servicio no está disponible. */
const clave = (uid: string) => `cache-reportes-${uid}`;

export async function guardarCache(uid: string, reportes: Reporte[]) {
  await AsyncStorage.setItem(clave(uid), JSON.stringify({ en: new Date().toISOString(), reportes }));
}

export async function leerCache(uid: string): Promise<{ en: string; reportes: Reporte[] } | null> {
  try {
    const v = await AsyncStorage.getItem(clave(uid));
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}

export async function borrarCache(uid: string) {
  await AsyncStorage.removeItem(clave(uid));
}
