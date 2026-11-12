import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Aviso, Boton, colores, Dato, Insignia, Tarjeta } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { ErrorServicio } from '@/lib/red';
import { cambiarEstado, CATEGORIAS, ESTADOS, fechaLegible, obtenerReporte, type Estado, type Reporte } from '@/lib/reportes';
import { urlFirmada } from '@/lib/storage';

export default function DetalleReporte() {
  const { id, nuevo } = useLocalSearchParams<{ id: string; nuevo?: string }>();
  const { perfil } = useAuth();
  const [reporte, setReporte] = useState<Reporte | null>(null);
  const [foto, setFoto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [actualizando, setActualizando] = useState<Estado | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await obtenerReporte(id);
        if (!r) throw new ErrorServicio('El reporte no existe o no tienes permiso para verlo.', 'permiso');
        setReporte(r);
        if (r.foto_path) setFoto(await urlFirmada(r.foto_path));
      } catch (e) {
        setError(e instanceof ErrorServicio ? e.message : String(e));
      } finally {
        setCargando(false);
      }
    })();
  }, [id]);

  async function actualizar(estado: Estado) {
    if (!reporte) return;
    setActualizando(estado);
    try {
      setReporte(await cambiarEstado(reporte.id, estado));
      setError(null);
    } catch (e) {
      setError(e instanceof ErrorServicio ? e.message : String(e));
    } finally {
      setActualizando(null);
    }
  }

  if (cargando) return <ActivityIndicator style={{ marginTop: 40 }} size="large" color={colores.primario} />;

  return (
    <ScrollView contentContainerStyle={styles.contenedor}>
      {nuevo && reporte && (
        <Aviso tipo="exito" titulo={`✅ Reporte #${reporte.folio} registrado en la nube`}>
          <Text style={styles.suave}>El servidor respondió 201 Created y asignó folio, estado y fecha de registro.</Text>
        </Aviso>
      )}
      {error && <Aviso tipo="error" titulo={error} />}

      {reporte && (
        <>
          <Tarjeta>
            <View style={styles.cabecera}>
              <Text style={styles.titulo}>
                {CATEGORIAS[reporte.categoria].icono} #{reporte.folio} · {CATEGORIAS[reporte.categoria].etiqueta}
              </Text>
              <Insignia texto={ESTADOS[reporte.estado].etiqueta} color={ESTADOS[reporte.estado].color} fondo={ESTADOS[reporte.estado].fondo} />
            </View>
            <Dato etiqueta="Ubicación" valor={`${reporte.edificio} · ${reporte.aula}`} />
            <Dato etiqueta="Descripción" valor={reporte.descripcion} />
            <Dato etiqueta="Fecha de registro" valor={fechaLegible(reporte.fecha_registro)} />
            <Dato etiqueta="Última actualización" valor={fechaLegible(reporte.actualizado_en)} />
          </Tarjeta>

          <Tarjeta>
            <Text style={styles.seccion}>Evidencia fotográfica</Text>
            {foto ? (
              <>
                <Image source={{ uri: foto }} style={styles.foto} contentFit="cover" transition={200} />
                <Text style={styles.suave}>Imagen recuperada del bucket privado con una URL firmada (válida 10 min).</Text>
              </>
            ) : (
              <Text style={styles.suave}>Sin fotografía adjunta.</Text>
            )}
          </Tarjeta>

          {perfil?.rol === 'mantenimiento' && (
            <Tarjeta>
              <Text style={styles.seccion}>🔧 Actualizar estado</Text>
              <View style={styles.fila}>
                {(Object.keys(ESTADOS) as Estado[]).map((e) => (
                  <Boton
                    key={e}
                    titulo={ESTADOS[e].etiqueta}
                    variante={reporte.estado === e ? 'primario' : 'secundario'}
                    deshabilitado={reporte.estado === e}
                    cargando={actualizando === e}
                    onPress={() => actualizar(e)}
                    style={{ flex: 1, paddingHorizontal: 6 }}
                  />
                ))}
              </View>
            </Tarjeta>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contenedor: { padding: 16, gap: 12 },
  cabecera: { gap: 8 },
  titulo: { fontSize: 18, fontWeight: '800', color: colores.texto },
  seccion: { fontSize: 16, fontWeight: '700', color: colores.texto },
  suave: { color: colores.suave, fontSize: 12 },
  foto: { width: '100%', height: 240, borderRadius: 10, backgroundColor: '#EEF2F7' },
  fila: { flexDirection: 'row', gap: 8 },
});
