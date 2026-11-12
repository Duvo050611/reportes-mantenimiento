import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Aviso, Boton, Campo, Chip, colores, Tarjeta } from '@/components/ui';
import { EMAIL_RE, useAuth, type Perfil } from '@/lib/auth';
import { ErrorServicio } from '@/lib/red';

/** Política de contraseña (debe coincidir o ser más estricta que la configurada en Supabase Auth). */
function validarPassword(p: string): string | null {
  if (p.length < 8) return 'Mínimo 8 caracteres.';
  if (!/[A-Z]/.test(p) || !/[a-z]/.test(p) || !/\d/.test(p)) return 'Incluye mayúsculas, minúsculas y números.';
  return null;
}

export default function Registro() {
  const { registrarse } = useAuth();
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tipo, setTipo] = useState<Perfil['tipo']>('estudiante');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [mensaje, setMensaje] = useState<{ tipo: 'error' | 'exito'; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function crear() {
    const e: Record<string, string> = {};
    if (nombre.trim().length < 2) e.nombre = 'Escribe tu nombre.';
    if (!EMAIL_RE.test(email.trim())) e.email = 'Escribe un correo válido.';
    const p = validarPassword(password);
    if (p) e.password = p;
    setErrores(e);
    setMensaje(null);
    if (Object.keys(e).length) return;
    setEnviando(true);
    try {
      const r = await registrarse({ email, password, nombre, tipo });
      if (r === 'confirmar') {
        setMensaje({ tipo: 'exito', texto: 'Cuenta creada. Revisa tu correo para confirmarla y después inicia sesión.' });
        setTimeout(() => router.back(), 2500);
      }
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err instanceof ErrorServicio ? err.message : 'No fue posible crear la cuenta.' });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.contenedor} keyboardShouldPersistTaps="handled">
        <Tarjeta>
          {mensaje && <Aviso tipo={mensaje.tipo} titulo={mensaje.texto} />}
          <Campo etiqueta="Nombre completo" value={nombre} onChangeText={setNombre} maxLength={80} error={errores.nombre} />
          <Campo
            etiqueta="Correo institucional"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            maxLength={120}
            error={errores.email}
          />
          <Campo
            etiqueta="Contraseña"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            maxLength={72}
            error={errores.password}
            ayuda="Mínimo 8 caracteres con mayúsculas, minúsculas y números."
          />
          <View style={{ gap: 6 }}>
            <Text style={styles.etiqueta}>Soy</Text>
            <View style={styles.fila}>
              <Chip texto="🎓 Estudiante" activo={tipo === 'estudiante'} onPress={() => setTipo('estudiante')} />
              <Chip texto="🗂️ Administrativo" activo={tipo === 'administrativo'} onPress={() => setTipo('administrativo')} />
            </View>
          </View>
          <Boton titulo="Crear cuenta" onPress={crear} cargando={enviando} />
        </Tarjeta>
        <Text style={styles.nota}>El rol de personal de mantenimiento solo lo asigna un administrador en el servidor.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  contenedor: { padding: 16, gap: 12 },
  etiqueta: { fontSize: 13, fontWeight: '600', color: colores.texto },
  fila: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  nota: { color: colores.suave, fontSize: 12, textAlign: 'center' },
});
