# 🤖 Bot de Procesamiento de Comprobantes

Bot de Telegram con IA que extrae datos estructurados de facturas y comprobantes usando GPT-4 Vision.

## ✨ Características

- 📸 Procesamiento automático de múltiples formatos de archivo
- 🖼️ **Imágenes:** JPG, PNG, GIF, WEBP, BMP, TIFF (fotos, screenshots)
- 📄 **Documentos:** PDF, DOCX, DOC, XLSX, XLS, PPTX, PPT
- 🧠 GPT-4 Vision para extracción inteligente de datos
- ✅ Validación con Zod schemas
- 📊 **NUEVO:** Genera archivos Excel profesionales con formato
- 📦 **NUEVO:** Acumulación de múltiples facturas en sesiones de usuario
- 🔽 **NUEVO:** Botones interactivos para descargar Excel
- 🔐 Eliminación automática de archivos
- 🌍 Multi-moneda (ARS, USD, EUR, BRL, CLP, MXN, COP)

## 🚀 Instalación

```bash
# 1. Instalar dependencias
npm install

# 2. Crear archivo .env basado en env.example
cp env.example .env

# 3. Editar .env con tus credenciales
TELEGRAM_BOT_TOKEN=tu_token_aqui
OPENAI_API_KEY=tu_api_key_aqui
OPENAI_MODEL=gpt-4o-mini

# 4. Ejecutar
npm run dev
```

### Obtener credenciales

**Telegram:** Habla con [@BotFather](https://t.me/botfather) → `/newbot`  
**OpenAI:** [platform.openai.com](https://platform.openai.com/) → API Keys

## 📁 Estructura

```
src/
├── index.ts              # Punto de entrada
└── modules/
    ├── TelegramBot.ts        # Bot de Telegram
    ├── VisionProcessor.ts    # GPT-4 Vision (Opción A)
    ├── DocumentIngestor.ts   # Gestión de archivos
    ├── DataStructures.ts     # Formateo y logging
    ├── Interfaces.ts         # Schemas Zod + Types
    ├── ExcelGenerator.ts     # Generador de archivos Excel
    └── SessionManager.ts     # Gestión de sesiones de usuario
```

## 📊 Datos Extraídos

- Número de factura | Fecha | Proveedor (nombre, tax ID, dirección)
- Monto total | Moneda | Items (descripción, cantidad, precio)
- Impuestos (IVA) | Método de pago | Metadata (tiempo, confianza)

## 🎯 Uso

**Comandos:**
- `/start` - Mensaje de bienvenida
- `/help` - Ayuda detallada
- `/stats` - Estadísticas del sistema
- `/facturas` - Ver facturas acumuladas
- `/limpiar` - Limpiar sesión actual

**Flujo:**
1. Envía una o más fotos de comprobantes
2. Espera 5-15s por cada una
3. Recibe resumen de cada factura
4. Las facturas se acumulan en tu sesión
5. Presiona el botón **"Descargar Excel"** para obtener todas las facturas en un archivo Excel profesional
6. Puedes seguir agregando facturas o limpiar la sesión con `/limpiar`

**Formato del Excel:**
- Headers con estilo profesional (azul con blanco)
- Columnas: Fecha, Tipo Operación, CUIT, Monto Bruto, Banco Receptor
- Bordes y formato de moneda automático
- Soporta múltiples facturas en un solo archivo

**Formatos de Archivo Soportados:**
- 📷 **Imágenes:** JPG, JPEG, PNG, GIF, WEBP, BMP, TIFF
- 📄 **Documentos:** PDF, DOCX (Word), DOC
- 📊 **Hojas de Cálculo:** XLSX (Excel), XLS
- 🎨 **Presentaciones:** PPTX (PowerPoint), PPT
- 📸 **Screenshots:** Todos los formatos de imagen son compatibles

El bot detecta automáticamente el tipo de archivo mediante análisis de magic bytes, por lo que funciona incluso si la extensión del archivo es incorrecta.

## 💰 Costos

- **gpt-4o-mini:** ~$0.01-0.02 por comprobante (recomendado)
- **gpt-4o:** ~$0.03-0.05 por comprobante

## 📚 Documentación

- `ARCHITECTURE_BRIEF.md` - Brief técnico completo
- `Structure.md` - Arquitectura del proyecto

## 🐛 Troubleshooting

| Error | Solución |
|-------|----------|
| `OPENAI_API_KEY no definida` | Verifica tu archivo `.env` |
| `No se puede descargar imagen` | Revisa permisos del bot en Telegram |
| `Formato no soportado` | Chequea `SUPPORTED_FORMATS` en `.env` |

---

## ✅ Pasos para Completar la App (100%)

### 1. Configuración Inicial
- [ ] Crear archivo `.env` en la raíz con todas las variables
- [ ] Obtener `TELEGRAM_BOT_TOKEN` desde [@BotFather](https://t.me/botfather)
- [ ] Obtener `OPENAI_API_KEY` desde [platform.openai.com](https://platform.openai.com/)
- [ ] Ejecutar `npm install` para instalar dependencias

### 2. Testing Local
- [ ] Ejecutar `npm run dev` para iniciar el bot
- [ ] Verificar que el bot se conecte correctamente
- [ ] Enviar `/start` en Telegram para probar comandos
- [ ] Enviar foto de comprobante de prueba
- [ ] Verificar respuesta con resumen + JSON

### 3. Ajustes y Optimización
- [ ] Revisar y ajustar prompt en `VisionProcessor.ts` según tus necesidades
- [ ] Ajustar campos extraídos en `Interfaces.ts` si necesitas más/menos datos
- [ ] Configurar `SUPPORTED_FORMATS` según tus necesidades
- [ ] Ajustar `IMAGE_RETENTION_HOURS` (0=inmediato, >0=retención temporal)
- [ ] Probar con diferentes tipos de comprobantes de tu región

### 4. Deployment (Opcional)
- [ ] Elegir plataforma: Railway / Fly.io / AWS / VPS
- [ ] Configurar variables de entorno en la plataforma
- [ ] Cambiar `NODE_ENV=production` en `.env`
- [ ] Ejecutar `npm run build` para compilar
- [ ] Deploy y verificar que el bot funcione en producción

### 5. Mejoras Opcionales
- [ ] Implementar base de datos (PostgreSQL/MongoDB) para histórico
- [ ] Agregar rate limiting por usuario
- [ ] Implementar OCR+LLM (Opción B) en `AIProcessor.ts` como alternativa
- [ ] Agregar autenticación de usuarios
- [ ] Implementar webhooks en lugar de polling
- [ ] Agregar analytics y métricas de uso

---

**Arquitectura:** Opción A (Multimodal) con GPT-4 Vision
