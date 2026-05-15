# 🎾 PWA CSI Tenis - Resumen del Proyecto

## ✅ Lo que se ha hecho hasta ahora

### 1. **Configuración del Proyecto**

- ✓ Creado proyecto Angular con Vite
- ✓ Instaladas dependencias principales:
  - Angular 21.2.0
  - Tailwind CSS 4.3.0
  - Axios (para HTTP)
  - JWT-decode (para decodificar tokens)
  - PostCSS y Autoprefixer
- ✓ Configurado `tailwind.config.js` y `postcss.config.js`
- ✓ Configurado Tailwind CSS en `src/styles.css`

### 2. **Estructura de Carpetas**

```
src/app/
├── services/
│   ├── auth.service.ts         (Autenticación JWT)
│   ├── api.service.ts          (Llamadas a API)
│   └── jwt.interceptor.ts      (Interceptor HTTP)
├── guards/
│   └── admin.guard.ts          (Protección de rutas admin)
├── models/
│   └── index.ts                (Interfaces TypeScript)
├── pages/
│   ├── home/                   (Página de inicio)
│   ├── login/                  (Login admin)
│   ├── reservations/           (Reservar cancha)
│   └── admin-dashboard/        (Panel admin)
└── components/                 (Componentes reutilizables)
```

### 3. **Modelos de Datos (TypeScript)**

- ✓ `LoginRequest` y `LoginResponse` (Autenticación)
- ✓ `Court` (Cancha)
- ✓ `Player` (Jugador)
- ✓ `ReservationRequest` y `ReservationResponse`
- ✓ `AvailabilityResponse` (Disponibilidad)
- ✓ `CancellationRequest` (Solicitud de cancelación)
- ✓ `Price` (Precios)

### 4. **Servicios Implementados**

#### **AuthService** (Autenticación)

- ✓ Login con JWT (POST /api/token/)
- ✓ Logout
- ✓ Verificación de autenticación
- ✓ Refresh token
- ✓ Observables para estado de admin

#### **ApiService** (API REST)

- ✓ getCourts() - Listar canchas
- ✓ getAvailability(date) - Disponibilidad por fecha
- ✓ createReservation() - Crear reserva
- ✓ getPrices() - Listar precios
- ✓ requestCancellation() - Solicitar cancelación

#### **JwtInterceptor** (HTTP)

- ✓ Agrega token JWT en headers automáticamente
- ✓ Manejo de errores 401 (Unauthorized)

### 5. **Componentes de Páginas**

#### **HomeComponent** 🏠

- ✓ Interfaz de bienvenida
- ✓ Dos opciones principales:
  - Acceso como Admin (con login)
  - Acceso como Invitado (reservar sin login)
- ✓ Indicador de estado de administrador
- ✓ Botón de cerrar sesión (si está logueado)

#### **LoginComponent** 🔐

- ✓ Formulario reactivo (username + password)
- ✓ Validación de datos
- ✓ Loading spinner
- ✓ Manejo de errores
- ✓ Redireccionamiento a panel admin

#### **ReservationsComponent** 📋

- ✓ Sistema de 3 pasos:
  1. Seleccionar fecha y cancha
  2. Ingresar datos de jugadores
  3. Revisar antes de confirmar
- ✓ Carga dinámica de canchas disponibles
- ✓ Carga de disponibilidad por fecha
- ✓ Generación de slots horarios (cada 30 min)
- ✓ Soporte para SINGLES (2 jugadores) y DOUBLES (4 jugadores)
- ✓ Validación de miembros
- ✓ Campo de notas opcional

#### **AdminDashboardComponent** 👨‍💼

- ✓ Interfaz principal del panel admin
- ✓ Cards de estadísticas (placeholders)
- ✓ Menú de gestión:
  - Gestionar Canchas
  - Gestionar Precios
  - Gestionar Horarios
  - Ver Reservas
  - Clases Recurrentes
  - Bloqueos de Horarios

### 6. **Enrutamiento**

- ✓ Ruta raíz `/` → HomeComponent
- ✓ Ruta `/login` → LoginComponent
- ✓ Ruta `/reservations` → ReservationsComponent
- ✓ Ruta `/admin/dashboard` → AdminDashboardComponent (protegida con AdminGuard)
- ✓ Redirecciones a home para rutas no encontradas

### 7. **Styling**

- ✓ Tailwind CSS completamente configurado
- ✓ Diseño responsivo (mobile-first)
- ✓ Colores y gradientes profesionales
- ✓ Componentes visuales atractivos

### 8. **Características de Seguridad**

- ✓ JWT Bearer token authentication
- ✓ HTTP Interceptor para adjuntar token
- ✓ AdminGuard para proteger rutas
- ✓ LocalStorage para almacenar tokens
- ✓ Decodificación de JWT con jwt-decode

---

## 🚀 Siguientes Pasos a Seguir

### **FASE 2: Funcionalidades Admin (Alta Prioridad)**

1. **Gestión de Canchas**
   - [ ] Componente listar canchas
   - [ ] Crear nueva cancha
   - [ ] Editar cancha existente
   - [ ] Eliminar cancha
   - [ ] Endpoints: POST, PATCH, PUT, DELETE /api/courts/

2. **Gestión de Precios**
   - [ ] Listar precios por game_mode y player_type
   - [ ] Crear nuevo precio
   - [ ] Editar precio
   - [ ] Eliminar precio

3. **Gestión de Horarios**
   - [ ] Configurar horarios regulares (ClubSchedule)
   - [ ] Crear horarios especiales por fecha (SpecialSchedule)
   - [ ] Bloquear horarios (mantenimiento, torneos)

4. **Gestión de Reservas (Admin)**
   - [ ] Ver todas las reservas por fecha
   - [ ] Cancelar reserva directamente
   - [ ] Ver detalles de reserva
   - [ ] Resolver solicitudes de cancelación (APPROVED/REJECTED)

5. **Clases Recurrentes**
   - [ ] Crear reglas de clases recurrentes
   - [ ] Generar reservas CLASS automáticamente
   - [ ] Ver y editar reglas existentes

### **FASE 3: Mejoras UX/UI**

- [ ] Agregar notificaciones/toasts
- [ ] Agregar modal de confirmación antes de cancelar
- [ ] Página de historial de reservas del usuario
- [ ] Búsqueda y filtros avanzados
- [ ] Responsive design mejorado para tablets

### **FASE 4: PWA Features**

- [ ] Configurar manifest.json
- [ ] Agregar service worker
- [ ] Ícono e instalación en home screen
- [ ] Funcionalidad offline (cacheo)
- [ ] Sincronización cuando vuelve conexión

### **FASE 5: Notificaciones**

- [ ] Integrar con backend para WhatsApp/Email
- [ ] Sistema de reminders antes de reserva
- [ ] Notificaciones de cancelación

### **FASE 6: Testing & Deploy**

- [ ] Tests unitarios (Jasmine)
- [ ] Tests de integración
- [ ] Build de producción
- [ ] Deploy a servidor

---

## 📝 Notas Importantes

- **Base URL API:** `http://127.0.0.1:8000/api`
- **Credenciales Demo (Admin):**
  - Usuario: `admin`
  - Contraseña: `csindependiente2026`
- **Duración estándar de reserva:** 90 minutos
- **Rate Limits:**
  - GET /availability/ → 20/min
  - POST /reservations/ → 20/min
  - POST /token/ → 10/min

---

## 🎯 Próximo Comando a Ejecutar

Para probar que todo funciona:

```powershell
cd "c:\Users\santy\Desktop\Trabajo\Independiente\PWA\tennis-app"
npm run dev
```

Luego abre: `http://localhost:5173`
