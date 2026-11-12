import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Aviso, Boton, Campo, Chip, colores, Tarjeta } from '@/components/ui';
import { encolar } from '@/lib/cola';
import { ErrorServicio, hayConexion } from '@/lib/red';
import { CATEGORIAS, enviarReporte, validarReporte, type BorradorReporte, type Categoria } from '@/lib/reportes';
import { formatoBytes, MAX_BYTES, type FotoLocal } from '@/lib/storage';

function desdePicker(a: ImagePicker.ImagePickerAsset): FotoLocal {
  let size = a.fileSize ?? 0;
  if (!size && Platform.OS !== 'web') {
    try {
      size = new File(a.uri).size ?? 0;
    } catch {}
  }
  return { uri: a.uri, mimeType: a.mimeType ?? 'image/jpeg', size: size || a.file?.size || 0, webFile: a.file };
}

export default function NuevoReporte() {
  // El id del cliente se genera una sola vez por formulario: si se reintenta, no se duplica.
  const idCliente = useRef(Crypto.randomUUID()).current;
  const [categoria, setCategoria] = useState<Categoria | null>(null);
  const [edificio, setEdificio] = useState('');
  const [aula, setAula] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [foto, setFoto] = useState<FotoLocal | null>(null);
  const [intentado, setIntentado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const borrador = (): BorradorReporte => ({ idCliente, categoria, edificio, aula, descripcion, foto });
  // Tras el primer intento de envío, los errores se recalculan en vivo mientras el usuario corrige.
  const errores = intentado ? validarReporte(borrador()) : {};

  async function galeria() {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6, exif: false });
    if (!r.canceled) setFoto(desdePicker(r.assets[0]));
  }

  async function camara() {
    const p = await ImagePicker.requestCameraPermissionsAsync();
    if (!p.granted) return Alert.alert('Permiso requerido', 'Concede acceso a la cámara para fotografiar el problema.');
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6, exif: false });
    if (!r.canceled) setFoto(desdePicker(r.assets[0]));
  }

  async function guardarSinConexion(motivo: string) {
    await encolar(borrador(), motivo);
    Alert.alert(
      'Reporte guardado en el dispositivo',
      `${motivo}\n\nEl reporte quedó pendiente de envío y podrás reintentarlo desde la lista cuando el servicio esté disponible.`,
      [{ text: 'Entendido', onPress: () => router.back() }],
    );
  }

  async function enviar() {
    const e = validarReporte(borrador());
    setIntentado(true);
    setError(null);
    if (Object.keys(e).length) return;

    setEnviando(true);
    try {
      if (!(await hayConexion())) return await guardarSinConexion('No hay conexión a internet.');
      const r = await enviarReporte(borrador());
      if (r) router.replace({ pathname: '/reporte/[id]', params: { id: r.id, nuevo: '1' } });
      else router.back();
    } catch (err) {
      const e2 = err instanceof ErrorServicio ? err : new ErrorServicio(String(err), 'servidor');
      if (e2.tipo === 'red' || e2.tipo === 'servidor') await guardarSinConexion(e2.message);
      else setError(e2.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.contenedor} keyboardShouldPersistTaps="handled">
        {error && <Aviso tipo="error" titulo={error} />}

        <Tarjeta>
          <Text style={styles.seccion}>1. Tipo de problema</Text>
          <View style={styles.chips}>
            {(Object.keys(CATEGORIAS) as Categoria[]).map((c) => (
              <Chip key={c} texto={`${CATEGORIAS[c].icono} ${CATEGORIAS[c].etiqueta}`} activo={categoria === c} onPress={() => setCategoria(c)} />
            ))}
          </View>
          {errores.categoria && <Text style={styles.error}>{errores.categoria}</Text>}
        </Tarjeta>

        <Tarjeta>
          <Text style={styles.seccion}>2. Ubicación</Text>
          <View style={styles.fila}>
            <View style={{ flex: 1 }}>
              <Campo etiqueta="Edificio" placeholder="Ej. Edificio D" value={edificio} onChangeText={setEdificio} maxLength={60} error={errores.edificio} />
            </View>
            <View style={{ flex: 1 }}>
              <Campo etiqueta="Aula / área" placeholder="Ej. Lab. 3" value={aula} onChangeText={setAula} maxLength={60} error={errores.aula} />
            </View>
          </View>
        </Tarjeta>

        <Tarjeta>
          <Text style={styles.seccion}>3. Descripción</Text>
          <Campo
            etiqueta="¿Qué ocurre?"
            placeholder="Describe el problema con detalle (mínimo 10 caracteres)"
            value={descripcion}
            onChangeText={setDescripcion}
            multiline
            maxLength={1000}
            style={{ minHeight: 96, textAlignVertical: 'top' }}
            error={errores.descripcion}
            ayuda={`${descripcion.trim().length}/1000`}
          />
          <Text style={styles.suave}>📅 La fecha y hora de registro las asigna el servidor al enviar.</Text>
        </Tarjeta>

        <Tarjeta>
          <Text style={styles.seccion}>4. Evidencia fotográfica (opcional)</Text>
          <View style={styles.fila}>
            <Boton titulo="📷 Cámara" variante="secundario" onPress={camara} style={{ flex: 1 }} />
            <Boton titulo="🖼️ Galería" variante="secundario" onPress={galeria} style={{ flex: 1 }} />
          </View>
          <Text style={styles.suave}>JPG, PNG o WEBP · máximo {formatoBytes(MAX_BYTES)}</Text>
          {foto && (
            <View style={{ gap: 8 }}>
              <Image source={{ uri: foto.uri }} style={styles.preview} contentFit="cover" />
              <View style={[styles.fila, { alignItems: 'center' }]}>
                <Text style={[styles.suave, { flex: 1 }]}>
                  {foto.mimeType} · {formatoBytes(foto.size)}
                </Text>
                <Boton titulo="Quitar" variante="secundario" onPress={() => setFoto(null)} />
              </View>
            </View>
          )}
          {errores.foto && <Text style={styles.error}>{errores.foto}</Text>}
        </Tarjeta>

        <Boton titulo="Enviar reporte" onPress={enviar} cargando={enviando} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  contenedor: { padding: 16, gap: 12, paddingBottom: 40 },
  seccion: { fontSize: 16, fontWeight: '700', color: colores.texto },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fila: { flexDirection: 'row', gap: 10 },
  suave: { color: colores.suave, fontSize: 12 },
  error: { color: colores.error, fontSize: 12 },
  preview: { width: '100%', height: 200, borderRadius: 10, backgroundColor: '#EEF2F7' },
});
