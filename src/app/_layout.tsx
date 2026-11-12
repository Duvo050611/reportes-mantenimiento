import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Text, View } from 'react-native';

import { colores } from '@/components/ui';
import { AuthProvider, useAuth } from '@/lib/auth';

function Navegacion() {
  const { session, cargando, errorConfig } = useAuth();

  if (cargando) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colores.fondo }}>
        <ActivityIndicator size="large" color={colores.primario} />
      </View>
    );
  }
  if (errorConfig) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: colores.error, textAlign: 'center' }}>{errorConfig}</Text>
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colores.tarjeta },
        headerTintColor: colores.texto,
        contentStyle: { backgroundColor: colores.fondo },
      }}>
      {/* Rutas públicas: solo sin sesión */}
      <Stack.Protected guard={!session}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="registro" options={{ title: 'Crear cuenta' }} />
      </Stack.Protected>
      {/* Rutas protegidas: requieren sesión (token válido) */}
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="index" options={{ title: 'Reportes de mantenimiento' }} />
        <Stack.Screen name="nuevo" options={{ title: 'Nuevo reporte', presentation: 'modal' }} />
        <Stack.Screen name="reporte/[id]" options={{ title: 'Detalle del reporte' }} />
        <Stack.Screen name="seguridad" options={{ title: 'Pruebas de seguridad' }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <Navegacion />
    </AuthProvider>
  );
}
