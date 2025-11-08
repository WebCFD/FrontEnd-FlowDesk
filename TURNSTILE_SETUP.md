# Configuración de Cloudflare Turnstile

## 🔒 Protección Anti-Bot para Formulario de Contacto

El formulario de contacto de FlowDesk ahora está protegido con **Cloudflare Turnstile** (CAPTCHA gratuito e invisible).

## 📋 Pasos para Configurar

### 1. Obtener las Claves de Turnstile (GRATIS)

1. Ve a https://dash.cloudflare.com/
2. Inicia sesión o crea una cuenta gratuita
3. En el menú lateral, ve a **Turnstile**
4. Haz clic en **"Add site"** o **"Crear sitio"**
5. Configura tu sitio:
   - **Site name**: FlowDesk Contact Form
   - **Domain**: `flowdesk.es` (y opcionalmente `*.flowdesk.es` para subdominios)
   - **Widget Mode**: Managed (recomendado) o Non-Interactive
6. Haz clic en **"Create"**

Te proporcionará dos claves:
- **Site Key** (pública): Comienza con `0x4...`
- **Secret Key** (privada): Comienza con `0x4...` o similar

### 2. Configurar las Claves en Replit

#### Opción A: Usando Replit Secrets (RECOMENDADO)

1. En Replit, abre la **barra lateral izquierda**
2. Busca el icono de **"Tools"** (🔧) o **"Secrets"** (🔐)
3. Haz clic en **"Secrets"**
4. Añade dos nuevos secrets:

   **Secret 1:**
   - Key: `TURNSTILE_SITE_KEY`
   - Value: `[Tu Site Key de Cloudflare]`

   **Secret 2:**
   - Key: `TURNSTILE_SECRET_KEY`
   - Value: `[Tu Secret Key de Cloudflare]`

5. Guarda los cambios

#### Opción B: Usando Variables de Entorno

Si no encuentras la opción de Secrets, puedes usar el archivo `.env`:

```bash
# .env
TURNSTILE_SITE_KEY=0x4AAAAAAA...
TURNSTILE_SECRET_KEY=0x4AAAAAAA...
```

### 3. Reiniciar la Aplicación

Una vez configuradas las claves:
1. Reinicia el workflow "Start application"
2. El widget de Turnstile aparecerá automáticamente en el formulario de contacto

## ✅ Verificar que Funciona

1. Ve a la landing page: https://flowdesk.es/
2. Scroll hasta la sección "Get in Touch"
3. Deberías ver el widget de Cloudflare Turnstile (un checkbox o verificación invisible)
4. Rellena el formulario y envía un mensaje de prueba
5. Verifica que el email llegue a `info@flowdesk.es`

## 🔐 Seguridad Implementada

Con la configuración completa, tu formulario de contacto está protegido con:

### 1. **Rate Limiting** ✅
- Máximo 5 mensajes por hora por dirección IP
- Previene spam masivo y ataques de denegación de servicio

### 2. **Cloudflare Turnstile** ✅
- Verificación anti-bot invisible o con desafío
- Gratis e ilimitado
- Más privado que reCAPTCHA (no rastrea usuarios)
- Bloquea bots automáticos y scripts maliciosos

## 📊 Monitoreo

Puedes ver las estadísticas de Turnstile en:
- https://dash.cloudflare.com/ → Turnstile → Analytics

Esto te mostrará:
- Número de verificaciones exitosas
- Intentos bloqueados
- Score de confianza de usuarios

## 🆓 Coste

**Totalmente GRATIS:**
- Rate Limiting: Código nativo (€0)
- Cloudflare Turnstile: Gratis ilimitado (€0)

## ⚙️ Configuración Avanzada (Opcional)

Si quieres personalizar el comportamiento de Turnstile, edita `client/src/components/landing/contact.tsx`:

```typescript
window.turnstile.render(turnstileRef.current, {
  sitekey: config.turnstileSiteKey,
  theme: 'light', // 'light' | 'dark' | 'auto'
  size: 'normal', // 'normal' | 'compact'
  // ... más opciones
});
```

Consulta la documentación oficial: https://developers.cloudflare.com/turnstile/

## 🐛 Troubleshooting

**El widget no aparece:**
- Verifica que las claves estén correctamente configuradas en Secrets
- Reinicia el workflow
- Comprueba los logs del navegador (F12 → Console)

**Verificación falla:**
- Asegúrate de que el dominio en Cloudflare coincide con el dominio de tu app
- Verifica que la Secret Key sea correcta

**Rate limit se activa muy pronto:**
- Es normal durante testing
- Espera 1 hora o ajusta el límite en `server/routes.ts` (línea 129)
