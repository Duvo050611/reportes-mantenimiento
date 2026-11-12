import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Aviso, Boton, Campo, colores, Tarjeta } from '@/components/ui';
import { ejecutarPruebas, type ResultadoPrueba } from '@/lib/pruebasSeguridad';

export default function PruebasSeguridad() {
  const [idAjeno, setIdAjeno] = useState('');
  const [resultados, setResultados] = useState<ResultadoPrueba[] | null>(null);
  const [ejecutando, setEjecutando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ejecutar() {
    setEjecutando(true);
    setError(null);
    try {
      setResultados(await ejecutarPruebas(idAjeno));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEjecutando(false);
    }
  }

  const aprobadas = resultados?.filter((r) => r.ok).length ?? 0;

  return (
    <ScrollView contentContainerStyle={styles.contenedor}>
      <Text style={styles.suave}>
        Estas pruebas intentan operaciones no autorizadas contra el servicio en la nube real, usando la sesión actual. Todas deben ser
        bloqueadas por el servidor (Auth + RLS), no por la app.
      </Text>
      <Tarjeta>
        <Campo
          etiqueta="ID de un reporte de otro usuario (opcional)"
          placeholder="00000000-0000-0000-0000-000000000000"
          value={idAjeno}
          onChangeText={setIdAjeno}
          autoCapitalize="none"
          style={{ fontSize: 12 }}
        />
        <Boton titulo="Ejecutar pruebas" onPress={ejecutar} cargando={ejecutando} />
      </Tarjeta>
      {error && <Aviso tipo="error" titulo={error} />}
      {resultados && (
        <Aviso tipo={aprobadas === resultados.length ? 'exito' : 'error'} titulo={`${aprobadas}/${resultados.length} pruebas superadas`} />
      )}
      {resultados?.map((r) => (
        <Tarjeta key={r.nombre} style={{ gap: 4, padding: 12 }}>
          <View style={styles.fila}>
            <Text style={{ fontSize: 16 }}>{r.ok ? '✅' : '❌'}</Text>
            <Text style={styles.nombre}>{r.nombre}</Text>
          </View>
          <Text style={styles.suave}>Esperado: {r.esperado}</Text>
          <Text style={styles.obtenido} numberOfLines={3}>
            Obtenido: {r.obtenido}
          </Text>
        </Tarjeta>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contenedor: { padding: 16, gap: 10 },
  fila: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  nombre: { flex: 1, fontWeight: '700', color: colores.texto, fontSize: 14 },
  suave: { color: colores.suave, fontSize: 12 },
  obtenido: { color: colores.texto, fontSize: 12 },
});
