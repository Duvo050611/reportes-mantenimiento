import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View, type ViewStyle } from 'react-native';

export const colores = {
  fondo: '#F4F6FA',
  tarjeta: '#FFFFFF',
  texto: '#1B2430',
  suave: '#5B6573',
  borde: '#DCE1E8',
  primario: '#1F6FEB',
  exito: '#1A7F37',
  exitoFondo: '#E6F4EA',
  error: '#C62828',
  errorFondo: '#FDECEA',
  aviso: '#9A6700',
  avisoFondo: '#FFF6DB',
};

type BotonProps = {
  titulo: string;
  onPress: () => void;
  variante?: 'primario' | 'secundario' | 'peligro';
  deshabilitado?: boolean;
  cargando?: boolean;
  style?: ViewStyle;
};

export function Boton({ titulo, onPress, variante = 'primario', deshabilitado, cargando, style }: BotonProps) {
  const bg = variante === 'primario' ? colores.primario : variante === 'peligro' ? colores.error : colores.tarjeta;
  const fg = variante === 'secundario' ? colores.primario : '#fff';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={deshabilitado || cargando}
      style={({ pressed }) => [
        styles.boton,
        { backgroundColor: bg, opacity: deshabilitado ? 0.45 : pressed ? 0.8 : 1 },
        variante === 'secundario' && { borderWidth: 1, borderColor: colores.primario },
        style,
      ]}>
      {cargando ? <ActivityIndicator color={fg} /> : <Text style={[styles.botonTexto, { color: fg }]}>{titulo}</Text>}
    </Pressable>
  );
}

export function Tarjeta({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.tarjeta, style]}>{children}</View>;
}

export function Aviso({ tipo, titulo, children }: { tipo: 'exito' | 'error' | 'aviso'; titulo: string; children?: ReactNode }) {
  const c =
    tipo === 'exito'
      ? { bg: colores.exitoFondo, fg: colores.exito }
      : tipo === 'error'
        ? { bg: colores.errorFondo, fg: colores.error }
        : { bg: colores.avisoFondo, fg: colores.aviso };
  return (
    <View style={[styles.aviso, { backgroundColor: c.bg, borderLeftColor: c.fg }]}>
      <Text style={[styles.avisoTitulo, { color: c.fg }]}>{titulo}</Text>
      {children}
    </View>
  );
}

export function Dato({ etiqueta, valor, mono }: { etiqueta: string; valor: string; mono?: boolean }) {
  return (
    <View style={styles.dato}>
      <Text style={styles.datoEtiqueta}>{etiqueta}</Text>
      <Text selectable style={[styles.datoValor, mono && styles.mono]}>
        {valor}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  boton: { paddingVertical: 13, paddingHorizontal: 16, borderRadius: 10, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
  botonTexto: { fontSize: 16, fontWeight: '600' },
  tarjeta: { backgroundColor: colores.tarjeta, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colores.borde, gap: 12 },
  aviso: { borderRadius: 10, padding: 12, borderLeftWidth: 4, gap: 6 },
  avisoTitulo: { fontWeight: '700', fontSize: 15 },
  dato: { gap: 2 },
  datoEtiqueta: { fontSize: 12, color: colores.suave, textTransform: 'uppercase', letterSpacing: 0.5 },
  datoValor: { fontSize: 14, color: colores.texto },
  mono: { fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), fontSize: 12 },
});

type CampoProps = {
  etiqueta: string;
  error?: string;
  ayuda?: string;
} & ComponentProps<typeof TextInput>;

export function Campo({ etiqueta, error, ayuda, style, ...props }: CampoProps) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={styles2.campoEtiqueta}>{etiqueta}</Text>
      <TextInput
        placeholderTextColor="#8A94A3"
        style={[styles2.input, error ? { borderColor: colores.error } : null, style]}
        {...props}
      />
      {error ? <Text style={styles2.campoError}>{error}</Text> : ayuda ? <Text style={styles2.campoAyuda}>{ayuda}</Text> : null}
    </View>
  );
}

export function Chip({ texto, activo, onPress }: { texto: string; activo: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: activo }}
      onPress={onPress}
      style={[styles2.chip, activo && { backgroundColor: colores.primario, borderColor: colores.primario }]}>
      <Text style={[styles2.chipTexto, activo && { color: '#fff' }]}>{texto}</Text>
    </Pressable>
  );
}

export function Insignia({ texto, color, fondo }: { texto: string; color: string; fondo: string }) {
  return (
    <View style={[styles2.insignia, { backgroundColor: fondo }]}>
      <Text style={[styles2.insigniaTexto, { color }]}>{texto}</Text>
    </View>
  );
}

const styles2 = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: colores.borde,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: colores.texto,
    backgroundColor: '#FBFCFE',
  },
  campoEtiqueta: { fontSize: 13, fontWeight: '600', color: colores.texto },
  campoError: { fontSize: 12, color: colores.error },
  campoAyuda: { fontSize: 12, color: colores.suave },
  chip: { borderWidth: 1, borderColor: colores.borde, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: colores.tarjeta },
  chipTexto: { fontSize: 13, color: colores.texto, fontWeight: '500' },
  insignia: { borderRadius: 999, paddingVertical: 3, paddingHorizontal: 10, alignSelf: 'flex-start' },
  insigniaTexto: { fontSize: 12, fontWeight: '700' },
});
