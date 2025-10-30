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



## 📁 Estructura del Proyecto

```
IA Telegram Bot/
├── src/
│   ├── index.ts                    # 🚀 Punto de entrada principal
│   └── modules/
│       ├── DataStructures.ts       # 📝 Formateo y logging (helpers)
│       ├── DocumentIngestor.ts     # 📥 Gestión de archivos (descarga, validación)
│       ├── ExcelGenerator.ts       # 📊 Generador de Excel (formato profesional)
│       ├── Interfaces.ts           # 🔧 Schemas Zod + TypeScript Types
│       ├── SessionManager.ts       # 💾 Gestión de sesiones (acumulación de facturas)
│       ├── TelegramBot.ts          # 🤖 Bot de Telegram (comandos, handlers, callbacks)
│       └── VisionProcessor.ts      # 👁️ GPT-4 Vision (procesamiento de imágenes/docs)
├── temp/                           # 📁 Almacenamiento temporal de archivos
├── dist/                           # 📦 Compilado de TypeScript
├── node_modules/                   # 📚 Dependencias
├── .env                            # 🔐 Variables de entorno (NO INCLUIR EN GIT)
├── .gitignore                      # 🚫 Archivos ignorados por Git
├── package.json                    # 📋 Configuración de dependencias
├── tsconfig.json                   # ⚙️ Configuración de TypeScript
├── README.md                       # 📖 Documentación principal
├── Structure.md                    # 🏗️ Arquitectura detallada
└── ARCHITECTURE_BRIEF.md          # 📐 Brief técnico completo
```

### 🔍 Descripción de Módulos Principales

| Módulo | Responsabilidad | Líneas |
|--------|----------------|--------|
| **DataStructures.ts** | Clases helper (InvoiceResponse, ProcessingResultFormatter, Logger), formateo de mensajes | ~313 |
| **DocumentIngestor.ts** | Descarga de archivos desde Telegram, validación por magic bytes, limpieza temporal | ~383 |
| **ExcelGenerator.ts** | Generación de archivos Excel con formato profesional (headers azules, bordes, formato moneda) | ~288 |
| **Interfaces.ts** | Schemas Zod para validación, tipos TypeScript, contratos de datos | ~140 |
| **SessionManager.ts** | Gestión de sesiones de usuario, acumulación de facturas, limpieza automática (timeout 30min) | ~176 |
| **TelegramBot.ts** | Manejo de conexión, comandos (/start, /help, /facturas), handlers de mensajes (foto, documento), callbacks de botones (descargar Excel, limpiar) | ~602 |
| **VisionProcessor.ts** | Integración con GPT-4 Vision API, prompt engineering, extracción de datos de imágenes/PDFs | ~314 |

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
