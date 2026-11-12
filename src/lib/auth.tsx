import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { conTimeout, ErrorServicio, hayConexion, traducirError } from './red';
import { supabase, supabaseConfigurado } from './supabase';

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

async function cargarPerfil(uid: string): Promise<Perfil | null> {
  const { data } = await supabase.from('perfiles').select('id, nombre, tipo, rol').eq('id', uid).maybeSingle();
  return (data as Perfil | null) ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!supabaseConfigurado) return setCargando(false);
    let activo = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!activo) return;
      setSession(data.session);
      if (data.session) setPerfil(await cargarPerfil(data.session.user.id));
      setCargando(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, s) => {
      if (!activo) return;
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
    await supabase.auth.signOut(); // revoca el refresh token y borra la sesión del almacén seguro
  }, []);

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
