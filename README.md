# Mantenimiento UTVT: reportes de mantenimiento universitario

App móvil en **React Native + Expo (SDK 58)** para que estudiantes y personal administrativo reporten fallas de infraestructura (cómputo, iluminación, mobiliario, internet, eléctrica) y den seguimiento a su atención. Backend en **Supabase**: Auth (JWT), API REST, PostgreSQL con RLS y Storage privado.

Documento técnico: [`docs/reporte.html`](docs/reporte.html) → `docs/Reporte-Mantenimiento-Universitario.pdf`.

## Funcionalidades
1. **Autenticación** con correo y contraseña (Supabase Auth). Los tokens se guardan en SecureStore (Keystore/Keychain).
2. **Registro de reportes**: categoría, edificio, aula, descripción y fecha asignada por el servidor.
3. **Consulta** de reportes propios (o de todos, si el rol es mantenimiento) con filtros por estado.
4. **Evidencia fotográfica** en un bucket privado y URL firmadas de 10 minutos.
5. **Seguridad**: RLS por fila y rol, permisos por columna, validación en cliente y servidor, bloqueo por intentos y pantalla 🛡️ de pruebas de seguridad.
6. **Modo sin conexión**: cola local de pendientes con reintento idempotente y caché de la última consulta.

## Puesta en marcha
1. En Supabase: **SQL Editor** → ejecuta [`supabase/schema.sql`](supabase/schema.sql).
2. **Authentication → Sign In / Providers → Email**: habilitado (para la demo puedes desactivar *Confirm email*).
3. Copia `.env.example` a `.env` con la Project URL y la clave **anon/publishable**. Nunca uses la `service_role`.
4. `npm install && npx expo start`. Escanea el QR con Expo Go o pulsa `a` para abrir en Android.
5. Para dar el rol de mantenimiento a un usuario, ejecuta en el SQL Editor:
   ```sql
   update public.perfiles set rol = 'mantenimiento'
   where id = (select id from auth.users where email = 'correo@dominio');
   ```

Comandos: `npm run typecheck`.
