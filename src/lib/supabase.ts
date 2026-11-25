import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { almacenSeguro } from './almacenSeguro';

// Solo se usan la URL y la clave PÚBLICA (anon/publishable). Cualquier variable
// EXPO_PUBLIC_ queda dentro del binario, por eso la service_role NUNCA va aquí.
// La seguridad real la imponen Supabase Auth (JWT) y las políticas RLS (supabase/schema.sql).
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigurado = Boolean(url && anonKey);

const urlEfectiva = url ?? 'https://placeholder.supabase.co';
// Misma clave que supabase-js usa por defecto (sb-<ref>-auth-token), explícita para poder leer
// la sesión guardada directamente cuando no hay internet (ver auth.tsx).
export const CLAVE_SESION = `sb-${urlEfectiva.match(/^https?:\/\/([^./:]+)/)?.[1] ?? 'placeholder'}-auth-token`;

export const supabase = createClient(urlEfectiva, anonKey ?? 'placeholder', {
  auth: {
    storageKey: CLAVE_SESION,
    storage: almacenSeguro, // tokens cifrados en Keystore/Keychain
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Refresca el access token (JWT de 1 h) solo mientras la app está en primer plano.
if (Platform.OS !== 'web') {
  // El evento 'change' no se emite al arrancar: si la app ya abre en primer plano, iniciar aquí.
  if (AppState.currentState === 'active') supabase.auth.startAutoRefresh();
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
