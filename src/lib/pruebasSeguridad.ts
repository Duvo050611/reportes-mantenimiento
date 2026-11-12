import * as Crypto from 'expo-crypto';

import { supabase } from './supabase';
import { BUCKET } from './storage';

export type ResultadoPrueba = { nombre: string; esperado: string; obtenido: string; ok: boolean };

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Pruebas de seguridad ejecutadas contra el backend REAL con la sesión del usuario actual.
 * Cada una intenta una operación que las reglas del servidor deben impedir.
 */
export async function ejecutarPruebas(idAjeno?: string): Promise<ResultadoPrueba[]> {
  const { data: s } = await supabase.auth.getSession();
  const uid = s.session!.user.id;
  const token = s.session!.access_token;
  const { data: perfil } = await supabase.from('perfiles').select('rol').eq('id', uid).maybeSingle();
  const esMant = perfil?.rol === 'mantenimiento';
  const r: ResultadoPrueba[] = [];

  // 1. Consultar reportes de otros usuarios
  {
    const { data, error } = await supabase.from('reportes').select('id').neq('user_id', uid).limit(50);
    const n = data?.length ?? 0;
    r.push({
      nombre: 'Consultar reportes de otros usuarios',
      esperado: esMant ? 'Permitido (rol mantenimiento)' : '0 filas (RLS filtra)',
      obtenido: error ? `Error: ${error.message}` : `${n} fila(s) devuelta(s)`,
      ok: esMant ? !error : !error && n === 0,
    });
  }

  // 2. Abrir un reporte ajeno por su ID
  if (idAjeno?.trim()) {
    const { data, error } = await supabase.from('reportes').select('id, user_id').eq('id', idAjeno.trim()).maybeSingle();
    const propio = data?.user_id === uid;
    r.push({
      nombre: 'Abrir reporte ajeno por ID',
      esperado: esMant ? 'Permitido (rol mantenimiento)' : 'Sin resultado (no autorizado)',
      obtenido: error ? `Error: ${error.message}` : data ? (propio ? 'El ID es de un reporte propio' : 'Reporte devuelto') : 'Sin resultado',
      ok: esMant ? !!data : !data && !propio,
    });
  }

  // 3. Registrar un reporte a nombre de otro usuario
  {
    const { error } = await supabase
      .from('reportes')
      .insert({ user_id: Crypto.randomUUID(), categoria: 'otro', edificio: 'X', aula: 'X', descripcion: 'Prueba de suplantación' } as never);
    r.push({
      nombre: 'Registrar reporte suplantando a otro usuario',
      esperado: 'Rechazado por el servidor',
      obtenido: error ? `Rechazado: ${error.message}` : '¡Se insertó!',
      ok: !!error,
    });
  }

  // 4. Cambiar el estado de un reporte sin rol de mantenimiento
  if (!esMant) {
    const { data: propio } = await supabase.from('reportes').select('id').eq('user_id', uid).limit(1).maybeSingle();
    if (propio) {
      const { data, error } = await supabase.from('reportes').update({ estado: 'resuelto' }).eq('id', propio.id).select();
      r.push({
        nombre: 'Marcar como “resuelto” sin ser mantenimiento',
        esperado: '0 filas actualizadas',
        obtenido: error ? `Rechazado: ${error.message}` : `${data?.length ?? 0} fila(s) actualizada(s)`,
        ok: !!error || (data?.length ?? 0) === 0,
      });
    }
  }

  // 5. Subir una foto en la carpeta de otro usuario
  {
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(`${Crypto.randomUUID()}/intruso.jpg`, new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer, { contentType: 'image/jpeg' });
    r.push({
      nombre: 'Subir evidencia a la carpeta de otro usuario',
      esperado: 'Rechazado (RLS de Storage)',
      obtenido: error ? `Rechazado: ${error.message}` : '¡Se subió!',
      ok: !!error,
    });
  }

  // 6. Consultar la API sin token de usuario (solo con la clave pública)
  {
    const res = await fetch(`${URL}/rest/v1/reportes?select=id&limit=1`, { headers: { apikey: ANON } });
    const cuerpo = await res.text();
    r.push({
      nombre: 'GET /reportes sin token de acceso',
      esperado: '401/403 o lista vacía',
      obtenido: `HTTP ${res.status} ${cuerpo.slice(0, 80)}`,
      ok: res.status === 401 || res.status === 403 || cuerpo.trim() === '[]',
    });
  }

  // 7. Token manipulado (firma inválida)
  {
    const partes = token.split('.');
    const falso = `${partes[0]}.${partes[1]}.${partes[2].slice(0, -4)}AAAA`;
    const res = await fetch(`${URL}/rest/v1/reportes?select=id&limit=1`, { headers: { apikey: ANON, Authorization: `Bearer ${falso}` } });
    r.push({
      nombre: 'GET /reportes con JWT alterado',
      esperado: 'HTTP 401',
      obtenido: `HTTP ${res.status}`,
      ok: res.status === 401,
    });
  }

  // 8. Descargar evidencia por URL pública (bucket privado)
  {
    const { data: conFoto } = await supabase.from('reportes').select('foto_path').not('foto_path', 'is', null).limit(1).maybeSingle();
    if (conFoto?.foto_path) {
      const pub = supabase.storage.from(BUCKET).getPublicUrl(conFoto.foto_path).data.publicUrl;
      const res = await fetch(pub);
      r.push({
        nombre: 'Descargar evidencia sin URL firmada',
        esperado: 'HTTP 400/404 (bucket privado)',
        obtenido: `HTTP ${res.status}`,
        ok: res.status >= 400,
      });
    }
  }

  return r;
}
