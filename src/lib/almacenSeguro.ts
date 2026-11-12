import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Adaptador de almacenamiento para la sesión de Supabase.
 * En Android/iOS guarda los tokens en el almacén cifrado del sistema
 * (Android Keystore / iOS Keychain) mediante expo-secure-store.
 * SecureStore admite valores de ~2 KB, así que el JSON de la sesión se divide en fragmentos.
 * En web (solo desarrollo) se usa AsyncStorage/localStorage.
 */
const TAM_FRAGMENTO = 1800;
const clave = (k: string, i: number | 'n') => `${k.replace(/[^A-Za-z0-9._-]/g, '_')}.${i}`;

const nativo = {
  async getItem(k: string): Promise<string | null> {
    const n = Number(await SecureStore.getItemAsync(clave(k, 'n')));
    if (!n) return null;
    const partes: string[] = [];
    for (let i = 0; i < n; i++) {
      const p = await SecureStore.getItemAsync(clave(k, i));
      if (p == null) return null;
      partes.push(p);
    }
    return partes.join('');
  },
  async setItem(k: string, v: string): Promise<void> {
    await nativo.removeItem(k);
    const n = Math.ceil(v.length / TAM_FRAGMENTO);
    for (let i = 0; i < n; i++) {
      await SecureStore.setItemAsync(clave(k, i), v.slice(i * TAM_FRAGMENTO, (i + 1) * TAM_FRAGMENTO));
    }
    await SecureStore.setItemAsync(clave(k, 'n'), String(n));
  },
  async removeItem(k: string): Promise<void> {
    const n = Number(await SecureStore.getItemAsync(clave(k, 'n')));
    for (let i = 0; i < n; i++) await SecureStore.deleteItemAsync(clave(k, i));
    await SecureStore.deleteItemAsync(clave(k, 'n'));
  },
};

export const almacenSeguro = Platform.OS === 'web' ? AsyncStorage : nativo;
