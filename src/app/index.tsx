import { Image } from 'expo-image';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Aviso, Boton, Chip, colores, Insignia, Tarjeta } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { borrarCache, guardarCache, leerCache } from '@/lib/cache';
import { descartar, leerCola, sincronizar, type Pendiente } from '@/lib/cola';
import { ErrorServicio, useConexion } from '@/lib/red';
import { CATEGORIAS, ESTADOS, fechaLegible, listarReportes, type Estado, type Reporte } from '@/lib/reportes';
import { urlsFirmadas } from '@/lib/storage';

export default function ListaReportes() {
  const { session, perfil, cerrarSesion } = useAuth();
  const uid = session!.user.id;
  const enLinea = useConexion();
  const esMantenimiento = perfil?.rol === 'mantenimiento';

  const [reportes, setReportes] = useState<Reporte[]>([]);
  const [miniaturas, setMiniaturas] = useState<Record<string, string>>({});
  const [filtro, setFiltro] = useState<Estado | undefined>();
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [desdeCache, setDesdeCache] = useState<string | null>(null);
  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  const [sincronizando, setSincronizando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    setPendientes(await leerCola());
    try {
      const datos = await listarReportes(filtro);
      setReportes(datos);
      setDesdeCache(null);
      if (!filtro) await guardarCache(uid, datos);
      const paths = datos.map((r) => r.foto_path).filter((p): p is string => !!p);
      setMiniaturas(await urlsFirmadas(paths).catch(() => ({})));
    } catch (e) {
      const err = e instanceof ErrorServicio ? e : new ErrorServicio(String(e), 'servidor');
      if (err.tipo === 'auth') return void cerrarSesion();
      setError(err.message);
      const c = await leerCache(uid);
      if (c) {
        setReportes(filtro ? c.reportes.filter((r) => r.estado === filtro) : c.reportes);
        setDesdeCache(c.en);
        setMiniaturas({});
      }
    } finally {
      setCargando(false);
    }
  }, [filtro, uid, cerrarSesion]);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar]),
  );

  async function reintentar() {
    setSincronizando(true);
    const r = await sincronizar();
    setSincronizando(false);
    Alert.alert('Sincronización', `Enviados: ${r.enviados} · Pendientes: ${r.pendientes}`);
    cargar();
  }

  function salir() {
    const aviso = pendientes.length ? `\n\nTienes ${pendientes.length} reporte(s) sin enviar que se descartarán.` : '';
    Alert.alert('Cerrar sesión', `¿Deseas salir?${aviso}`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Salir',
        style: 'destructive',
        onPress: async () => {
          for (const p of pendientes) await descartar(p.idCliente);
          await borrarCache(uid);
          await cerrarSesion();
        },
      },
    ]);
  }

  const encabezado = (
    <View style={{ gap: 12 }}>
      <Tarjeta style={styles.perfil}>
        <View style={{ flex: 1 }}>
          <Text style={styles.nombre}>{perfil?.nombre ?? session?.user.email}</Text>
          <Text style={styles.suave}>
            {session?.user.email}
            {perfil ? ` · ${esMantenimiento ? '🔧 Mantenimiento' : perfil.tipo === 'administrativo' ? '🗂️ Administrativo' : '🎓 Estudiante'}` : ''}
          </Text>
        </View>
        <Pressable onPress={salir} hitSlop={8}>
          <Text style={styles.salir}>Salir</Text>
        </Pressable>
      </Tarjeta>

      {!enLinea && <Aviso tipo="aviso" titulo="📴 Sin conexión a internet">
        <Text style={styles.suave}>Puedes registrar reportes: se guardarán en el dispositivo y se enviarán al recuperar la conexión.</Text>
      </Aviso>}

      {error && (
        <Aviso tipo="error" titulo={error}>
          {desdeCache && <Text style={styles.suave}>Mostrando la última consulta guardada ({fechaLegible(desdeCache)}).</Text>}
        </Aviso>
      )}

      {pendientes.length > 0 && (
        <Aviso tipo="aviso" titulo={`⏳ ${pendientes.length} reporte(s) pendiente(s) de envío`}>
          {pendientes.map((p) => (
            <Text key={p.idCliente} style={styles.suave}>
              • {p.categoria ? CATEGORIAS[p.categoria].etiqueta : 'Reporte'} — {p.edificio} {p.aula} {p.ultimoError ? `(${p.ultimoError})` : ''}
            </Text>
          ))}
          <Boton titulo="Reintentar envío" variante="secundario" onPress={reintentar} cargando={sincronizando} deshabilitado={!enLinea} />
        </Aviso>
      )}

      <View style={styles.filtros}>
        <Chip texto="Todos" activo={!filtro} onPress={() => setFiltro(undefined)} />
        {(Object.keys(ESTADOS) as Estado[]).map((e) => (
          <Chip key={e} texto={ESTADOS[e].etiqueta} activo={filtro === e} onPress={() => setFiltro(e)} />
        ))}
      </View>
      <Text style={styles.subtitulo}>{esMantenimiento ? 'Todos los reportes' : 'Mis reportes'} ({reportes.length})</Text>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={() => router.push('/seguridad')} hitSlop={8} accessibilityLabel="Pruebas de seguridad">
              <Text style={{ fontSize: 20 }}>🛡️</Text>
            </Pressable>
          ),
        }}
      />
      <FlatList
        data={reportes}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.lista}
        ListHeaderComponent={encabezado}
        refreshControl={<RefreshControl refreshing={cargando} onRefresh={cargar} />}
        ListEmptyComponent={
          !cargando ? <Text style={[styles.suave, { textAlign: 'center', marginTop: 24 }]}>No hay reportes registrados.</Text> : undefined
        }
        renderItem={({ item }) => {
          const est = ESTADOS[item.estado];
          const cat = CATEGORIAS[item.categoria];
          const mini = item.foto_path ? miniaturas[item.foto_path] : undefined;
          return (
            <Pressable onPress={() => router.push({ pathname: '/reporte/[id]', params: { id: item.id } })}>
              <Tarjeta style={styles.item}>
                {mini ? (
                  <Image source={{ uri: mini }} style={styles.mini} contentFit="cover" />
                ) : (
                  <View style={[styles.mini, styles.miniVacia]}>
                    <Text style={{ fontSize: 26 }}>{cat.icono}</Text>
                  </View>
                )}
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={styles.itemTitulo}>
                    #{item.folio} · {cat.etiqueta}
                  </Text>
                  <Text style={styles.suave} numberOfLines={1}>
                    📍 {item.edificio} · {item.aula}
                  </Text>
                  <Text style={styles.suave} numberOfLines={1}>
                    {item.descripcion}
                  </Text>
                  <View style={styles.filaItem}>
                    <Insignia texto={est.etiqueta} color={est.color} fondo={est.fondo} />
                    <Text style={styles.fecha}>{fechaLegible(item.fecha_registro)}</Text>
                  </View>
                </View>
              </Tarjeta>
            </Pressable>
          );
        }}
      />
      <View style={styles.pie}>
        <Boton titulo="＋ Nuevo reporte" onPress={() => router.push('/nuevo')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  lista: { padding: 16, gap: 10, paddingBottom: 100 },
  perfil: { flexDirection: 'row', alignItems: 'center' },
  nombre: { fontSize: 16, fontWeight: '700', color: colores.texto },
  salir: { color: colores.error, fontWeight: '600' },
  suave: { color: colores.suave, fontSize: 13 },
  subtitulo: { fontSize: 15, fontWeight: '700', color: colores.texto },
  filtros: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  item: { flexDirection: 'row', gap: 12, padding: 12 },
  itemTitulo: { fontSize: 15, fontWeight: '700', color: colores.texto },
  filaItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  fecha: { fontSize: 11, color: colores.suave },
  mini: { width: 72, height: 72, borderRadius: 10 },
  miniVacia: { backgroundColor: '#EEF2F7', alignItems: 'center', justifyContent: 'center' },
  pie: { position: 'absolute', left: 16, right: 16, bottom: 24 },
});
