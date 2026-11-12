import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { almacenSeguro } from './almacenSeguro';

// Solo se usan la URL y la clave PÚBLICA (anon/publishable). Cualquier variable
// EXPO_PUBLIC_ queda dentro del binario, por eso la service_role NUNCA va aquí.
// La seguridad real la imponen Supabase Auth (JWT) y las políticas RLS (supabase/schema.sql).
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigurado = Boolean(url && anonKey);

export const supabase = createClient(url ?? 'https://placeholder.supabase.co', anonKey ?? 'placeholder', {
  auth: {
    storage: almacenSeguro, // tokens cifrados en Keystore/Keychain
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Refresca el access token (JWT de 1 h) solo mientras la app está en primer plano.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
