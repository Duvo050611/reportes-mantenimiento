import { conTimeout, ErrorServicio, hayConexion, traducirError } from './red';
import { subirFoto, validarFoto, type FotoLocal } from './storage';
import { supabase } from './supabase';

export const CATEGORIAS = {
  computo: { etiqueta: 'Equipo de cómputo', icono: '💻' },
  iluminacion: { etiqueta: 'Iluminación', icono: '💡' },
  mobiliario: { etiqueta: 'Mobiliario', icono: '🪑' },
  internet: { etiqueta: 'Internet / red', icono: '📶' },
  electrica: { etiqueta: 'Instalación eléctrica', icono: '⚡' },
  otro: { etiqueta: 'Otro', icono: '🛠️' },
} as const;
export type Categoria = keyof typeof CATEGORIAS;

export const ESTADOS = {
  pendiente: { etiqueta: 'Pendiente', color: '#9A6700', fondo: '#FFF6DB' },
  en_proceso: { etiqueta: 'En proceso', color: '#1F6FEB', fondo: '#E3EEFF' },
  resuelto: { etiqueta: 'Resuelto', color: '#1A7F37', fondo: '#E6F4EA' },
} as const;
export type Estado = keyof typeof ESTADOS;

export type Reporte = {
  id: string;
  folio: number;
  user_id: string;
  categoria: Categoria;
  edificio: string;
  aula: string;
  descripcion: string;
  foto_path: string | null;
  estado: Estado;
  fecha_registro: string;
  actualizado_en: string;
};

/** Datos que captura el usuario. user_id, estado y fecha los asigna el servidor. */
export type BorradorReporte = {
  idCliente: string; // UUID generado en el dispositivo (idempotencia)
  categoria: Categoria | null;
  edificio: string;
  aula: string;
  descripcion: string;
  foto: FotoLocal | null;
};

/** Validaciones previas al envío (las mismas reglas existen como CHECK en la BD). */
export function validarReporte(b: BorradorReporte): Record<string, string> {
  const e: Record<string, string> = {};
  if (!b.categoria || !(b.categoria in CATEGORIAS)) e.categoria = 'Selecciona el tipo de problema.';
  if (!b.edificio.trim()) e.edificio = 'Indica el edificio.';
  else if (b.edificio.trim().length > 60) e.edificio = 'Máximo 60 caracteres.';
  if (!b.aula.trim()) e.aula = 'Indica el aula, laboratorio u oficina.';
  else if (b.aula.trim().length > 60) e.aula = 'Máximo 60 caracteres.';
  const d = b.descripcion.trim();
  if (d.length < 10) e.descripcion = 'Describe el problema (mínimo 10 caracteres).';
  else if (d.length > 1000) e.descripcion = 'Máximo 1000 caracteres.';
  if (b.foto) {
    const f = validarFoto(b.foto);
    if (f) e.foto = f;
  }
  return e;
}

/** POST /rest/v1/reportes  (+ PUT /storage/v1/object/evidencias/<uid>/<id>.jpg si hay foto) */
export async function enviarReporte(b: BorradorReporte): Promise<Reporte | null> {
  const errores = validarReporte(b);
  if (Object.keys(errores).length) throw new ErrorServicio(Object.values(errores)[0], 'validacion');
  if (!(await hayConexion())) throw new ErrorServicio('Sin conexión a internet.', 'red');

  const foto_path = b.foto ? await subirFoto(b.foto, b.idCliente) : null;
  const { data, error } = await conTimeout(
    supabase
      .from('reportes')
      .insert({
        categoria: b.categoria,
        edificio: b.edificio.trim(),
        aula: b.aula.trim(),
        descripcion: b.descripcion.trim(),
        foto_path,
        id_cliente: b.idCliente,
      })
      .select()
      .single(),
  );
  if (error) {
    if (error.code === '23505') return null; // ya se había registrado en un intento anterior
    throw traducirError(error);
  }
  return data as Reporte;
}

/** GET /rest/v1/reportes?order=fecha_registro.desc — RLS devuelve solo las filas permitidas. */
export async function listarReportes(estado?: Estado): Promise<Reporte[]> {
  let q = supabase.from('reportes').select('*').order('fecha_registro', { ascending: false }).limit(100);
  if (estado) q = q.eq('estado', estado);
  const { data, error } = await conTimeout(q);
  if (error) throw traducirError(error);
  return data as Reporte[];
}

/** GET /rest/v1/reportes?id=eq.<id> */
export async function obtenerReporte(id: string): Promise<Reporte | null> {
  const { data, error } = await conTimeout(supabase.from('reportes').select('*').eq('id', id).maybeSingle());
  if (error) throw traducirError(error);
  return data as Reporte | null;
}

/** PATCH /rest/v1/reportes?id=eq.<id>  — solo personal de mantenimiento (RLS). */
export async function cambiarEstado(id: string, estado: Estado): Promise<Reporte> {
  const { data, error } = await conTimeout(supabase.from('reportes').update({ estado }).eq('id', id).select().maybeSingle());
  if (error) throw traducirError(error);
  if (!data) throw new ErrorServicio('No tienes permiso para cambiar el estado de este reporte.', 'permiso');
  return data as Reporte;
}

export function fechaLegible(iso: string): string {
  return new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
}
