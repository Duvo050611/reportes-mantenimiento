import AsyncStorage from '@react-native-async-storage/async-storage';
import { isAuthRetryableFetchError, type Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { almacenSeguro } from './almacenSeguro';
import { conTimeout, ErrorServicio, hayConexion, traducirError } from './red';
import { CLAVE_SESION, supabase, supabaseConfigurado } from './supabase';

export type Perfil = { id: string; nombre: string; tipo: 'estudiante' | 'administrativo'; rol: 'usuario' | 'mantenimiento' };

type AuthState = {
  session: Session | null;
  perfil: Perfil | null;
  cargando: boolean;
  errorConfig: string | null;
  iniciarSesion: (email: string, password: string) => Promise<void>;
  registrarse: (datos: { email: string; password: string; nombre: string; tipo: Perfil['tipo'] }) => Promise<'sesion' | 'confirmar'>;
  cerrarSesion: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Bloqueo local tras intentos fallidos (además del rate limit del servidor). */
const MAX_INTENTOS = 5;
const BLOQUEO_MS = 60_000;
let intentosFallidos = 0;
let bloqueadoHasta = 0;

const clavePerfil = (uid: string) => `perfil-${uid}`;

/** Perfil desde el servidor; si no hay conexión, la última copia guardada en el dispositivo. */
async function cargarPerfil(uid: string): Promise<Perfil | null> {
  try {
    const { data, error } = await conTimeout(supabase.from('perfiles').select('id, nombre, tipo, rol').eq('id', uid).maybeSingle(), 10_000);
    if (!error && data) {
      await AsyncStorage.setItem(clavePerfil(uid), JSON.stringify(data)).catch(() => {});
      return data as Perfil;
    }
    if (!error) return null; // el servidor respondió: el perfil no existe
  } catch {}
  try {
    const v = await AsyncStorage.getItem(clavePerfil(uid));
    return v ? (JSON.parse(v) as Perfil) : null;
  } catch {
    return null;
  }
}

/**
 * Sesión guardada en el almacén cifrado aunque su access token ya haya expirado.
 * Sin internet, supabase-js no puede renovar el token y devuelve session=null, pero conserva
 * la sesión en el almacén. La usamos para mantener al usuario dentro en modo sin conexión:
 * solo da acceso a datos locales (caché y cola), porque cualquier petición al servidor
 * exige un token válido. Al volver la red, supabase-js la renueva con el refresh token; si el
 * servidor lo rechaza, borra la sesión y emite SIGNED_OUT (de vuelta al login).
 */
async function sesionGuardada(): Promise<Session | null> {
  try {
    const v = await almacenSeguro.getItem(CLAVE_SESION);
    const s = v ? (JSON.parse(v) as Session) : null;
    return s?.access_token && s.refresh_token && s.user?.id ? s : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  // Sin configuración no hay nada que cargar: se arranca directamente en false.
  const [cargando, setCargando] = useState(supabaseConfigurado);

  useEffect(() => {
    if (!supabaseConfigurado) return;
    let activo = true;
    supabase.auth.getSession().then(async ({ data, error }) => {
      if (!activo) return;
      let s = data.session;
      // Sin red y con el token vencido: entrar en modo sin conexión con la sesión guardada.
      if (!s && error && isAuthRetryableFetchError(error)) s = await sesionGuardada();
      if (!activo) return;
      setSession(s);
      if (s) setPerfil(await cargarPerfil(s.user.id));
      setCargando(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((evento, s) => {
      if (!activo) return;
      // Solo SIGNED_OUT significa "ya no hay sesión". Un INITIAL_SESSION nulo por falta de red
      // no debe sacar al usuario del modo sin conexión.
      if (!s && evento !== 'SIGNED_OUT') return;
      setSession(s);
      if (!s) setPerfil(null);
      else setTimeout(() => cargarPerfil(s.user.id).then((p) => activo && setPerfil(p)), 0);
    });
    return () => {
      activo = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const iniciarSesion = useCallback(async (email: string, password: string) => {
    const restante = bloqueadoHasta - Date.now();
    if (restante > 0) throw new ErrorServicio(`Demasiados intentos fallidos. Espera ${Math.ceil(restante / 1000)} s.`, 'auth');
    if (!(await hayConexion())) throw new ErrorServicio('Sin conexión a internet. No es posible iniciar sesión.', 'red');
    let res;
    try {
      // POST /auth/v1/token?grant_type=password  ->  { access_token (JWT), refresh_token, user }
      res = await conTimeout(supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password }));
    } catch (e) {
      throw traducirError(e);
    }
    if (res.error) {
      if (/invalid login credentials/i.test(res.error.message)) {
        intentosFallidos++;
        if (intentosFallidos >= MAX_INTENTOS) {
          bloqueadoHasta = Date.now() + BLOQUEO_MS;
          intentosFallidos = 0;
        }
        // Mensaje genérico: no revela si el correo existe.
        throw new ErrorServicio('Correo o contraseña incorrectos.', 'auth');
      }
      if (/email not confirmed/i.test(res.error.message)) throw new ErrorServicio('Confirma tu correo antes de iniciar sesión.', 'auth');
      if (/rate limit/i.test(res.error.message)) throw new ErrorServicio('Demasiados intentos. Espera unos minutos.', 'auth');
      throw traducirError(res.error);
    }
    intentosFallidos = 0;
  }, []);

  const registrarse = useCallback<AuthState['registrarse']>(async ({ email, password, nombre, tipo }) => {
    if (!(await hayConexion())) throw new ErrorServicio('Sin conexión a internet.', 'red');
    const { data, error } = await conTimeout(
      supabase.auth.signUp({ email: email.trim().toLowerCase(), password, options: { data: { nombre: nombre.trim(), tipo } } }),
    );
    if (error) {
      if (/already registered|already exists/i.test(error.message)) throw new ErrorServicio('Ese correo ya está registrado.', 'validacion');
      if (/password/i.test(error.message)) throw new ErrorServicio('La contraseña no cumple la política de seguridad.', 'validacion');
      throw traducirError(error);
    }
    return data.session ? 'sesion' : 'confirmar';
  }, []);

  const cerrarSesion = useCallback(async () => {
    const uid = session?.user.id;
    if (uid) await AsyncStorage.removeItem(clavePerfil(uid)).catch(() => {});
    // 'global' revoca el refresh token en el servidor. Sin red falla y no borra nada, así que
    // se cierra al menos en este dispositivo ('local' borra la sesión sin depender de la red).
    const { error } = await supabase.auth.signOut();
    if (error) await supabase.auth.signOut({ scope: 'local' });
    setSession(null);
    setPerfil(null);
  }, [session?.user.id]);

  return (
    <AuthContext.Provider
      value={{
        session,
        perfil,
        cargando,
        errorConfig: supabaseConfigurado ? null : 'Falta configurar EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY en .env',
        iniciarSesion,
        registrarse,
        cerrarSesion,
      }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const c = useContext(AuthContext);
  if (!c) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return c;
}
