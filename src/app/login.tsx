import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Aviso, Boton, Campo, colores, Tarjeta } from '@/components/ui';
import { EMAIL_RE, useAuth } from '@/lib/auth';
import { ErrorServicio } from '@/lib/red';

export default function Login() {
  const { iniciarSesion } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errores, setErrores] = useState<{ email?: string; password?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar() {
    const e: typeof errores = {};
    if (!EMAIL_RE.test(email.trim())) e.email = 'Escribe un correo válido.';
    if (!password) e.password = 'Escribe tu contraseña.';
    setErrores(e);
    setError(null);
    if (Object.keys(e).length) return;
    setEnviando(true);
    try {
      await iniciarSesion(email, password);
      // Al haber sesión, Stack.Protected redirige automáticamente a la lista.
    } catch (err) {
      setError(err instanceof ErrorServicio ? err.message : 'No fue posible iniciar sesión.');
      setPassword('');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.contenedor} keyboardShouldPersistTaps="handled">
        <View style={styles.encabezado}>
          <Text style={styles.logo}>🛠️</Text>
          <Text style={styles.titulo}>Mantenimiento UTVT</Text>
          <Text style={styles.subtitulo}>Reporta fallas de infraestructura y da seguimiento a su atención.</Text>
        </View>

        <Tarjeta>
          <Text style={styles.seccion}>Iniciar sesión</Text>
          {error && <Aviso tipo="error" titulo={error} />}
          <Campo
            etiqueta="Correo institucional"
            placeholder="usuario@universidad.edu.mx"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="username"
            maxLength={120}
            error={errores.email}
          />
          <Campo
            etiqueta="Contraseña"
            placeholder="••••••••"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            maxLength={72}
            error={errores.password}
            onSubmitEditing={entrar}
          />
          <Boton titulo="Entrar" onPress={entrar} cargando={enviando} />
        </Tarjeta>

        <Link href="/registro" style={styles.enlace}>
          ¿No tienes cuenta? Regístrate
        </Link>
        <Text style={styles.nota}>🔒 Conexión cifrada (HTTPS). Tu sesión se guarda en el almacén seguro del dispositivo.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  contenedor: { flexGrow: 1, justifyContent: 'center', padding: 20, gap: 16 },
  encabezado: { alignItems: 'center', gap: 6, marginBottom: 8 },
  logo: { fontSize: 48 },
  titulo: { fontSize: 24, fontWeight: '800', color: colores.texto },
  subtitulo: { fontSize: 14, color: colores.suave, textAlign: 'center' },
  seccion: { fontSize: 17, fontWeight: '700', color: colores.texto },
  enlace: { color: colores.primario, textAlign: 'center', fontWeight: '600', fontSize: 15 },
  nota: { color: colores.suave, textAlign: 'center', fontSize: 12 },
});
