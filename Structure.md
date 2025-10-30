/IA Telegram Bot/
├── node_modules/                 (Dependencias npm)
├── src/                
│   ├── index.ts                  (Punto de entrada principal)
│   └── modules/        
│       ├── DataStructures.ts     (✅ Helpers - formateo, logging, respuestas)
│       ├── DocumentIngestor.ts   (✅ Gestión de archivos - descarga, validación)
│       ├── ExcelGenerator.ts     (✅ NUEVO - Generación de archivos Excel)
│       ├── Interfaces.ts         (✅ Schemas Zod + TypeScript types)
│       ├── SessionManager.ts     (✅ NUEVO - Gestión de sesiones de usuario)
│       ├── TelegramBot.ts        (✅ Bot principal - comandos, handlers, callbacks)
│       └── VisionProcessor.ts    (✅ GPT-4 Vision - procesamiento de imágenes/docs)
├── temp/                         (Almacenamiento temporal de archivos)
├── dist/                         (Build compilado de TypeScript)
├── .env                          (Variables de entorno - NO incluir en Git)
├── .gitignore                    (Exclusiones de Git)
├── package.json                  (Dependencias y scripts)
├── tsconfig.json                 (Configuración de TypeScript)
├── README.md                     (Documentación principal)
├── Structure.md                  (Este archivo - arquitectura detallada)
└── ARCHITECTURE_BRIEF.md        (Brief técnico completo)



## 🏗️ ARQUITECTURA IMPLEMENTADA

### Opción A: Multimodal (GPT-4 Vision) ✅ ACTIVA

```
Usuario → Telegram Bot → Document Ingestor → Vision Processor → Session Manager
                              ↓                      ↓                  ↓
                         (Descarga)            (Extracción)      (Acumulación)
                              ↓                      ↓                  ↓
                         temp/archivos          Invoice Data      Facturas[]
                                                                       ↓
                                                              Excel Generator
                                                                       ↓
                                                               archivo.xlsx
```

### 1. Bot de Telegram (Node/TypeScript)
- **Librería:** `telegraf` (framework moderno para Telegram bots)
- **Funciones:**
  - Recibe imágenes/documentos (14 formatos soportados)
  - Gestiona comandos: /start, /help, /stats, /facturas, /limpiar
  - Maneja callbacks de botones inline
  - Coordina el flujo completo de procesamiento
- **Módulo:** `TelegramBot.ts` (~600 líneas)

### 2. Procesamiento de Comprobantes

**✅ Opción A (IMPLEMENTADA):** 
- Modelo multimodal GPT-4 Vision que procesa directamente imágenes/documentos
- Extrae campos estructurados en una sola llamada
- Soporta: JPG, PNG, GIF, WEBP, BMP, TIFF, PDF, DOCX, DOC, XLSX, XLS, PPTX, PPT
- **Módulo:** `VisionProcessor.ts` (~314 líneas)

**⏸️ Opción B (PLACEHOLDER):** 
- OCR clásico + LLM para mayor control
- Implementación futura si se necesita
- **Módulos:** `OCRProcessor.ts` + `AIProcessor.ts`

### 3. Gestión de Archivos
- Descarga archivos desde Telegram API
- Validación por magic bytes (detecta tipo real sin importar extensión)
- Almacenamiento temporal configurable
- Limpieza automática post-procesamiento
- **Módulo:** `DocumentIngestor.ts` (~383 líneas)

### 4. Gestión de Sesiones ✨ NUEVO
- Acumula múltiples facturas por usuario
- Timeout configurable (default: 30 minutos)
- Limpieza automática de sesiones expiradas
- Soporte para flujo multi-factura
- **Módulo:** `SessionManager.ts` (~176 líneas)

### 5. Generación de Excel ✨ NUEVO
- Genera archivos Excel profesionales con formato
- Headers azules con texto blanco
- Bordes en todas las celdas
- Formato de moneda con separadores de miles
- Columnas: Fecha, Tipo Operación, CUIT, Monto Bruto, Banco Receptor
- Soporta múltiples facturas concatenadas
- **Módulo:** `ExcelGenerator.ts` (~288 líneas)

### 6. Normalización y Validación
- **TypeScript:** Tipado fuerte para la estructura de datos
- **Zod:** Validación automática de esquemas
- Garantiza integridad de datos en todo el pipeline
- **Módulo:** `Interfaces.ts` (~140 líneas)

### 7. Devolución y Formateo
- Resumen legible en Markdown para el usuario
- Botones interactivos (Descargar Excel, Limpiar Sesión, Ver Resumen)
- Archivo Excel descargable con todas las facturas
- Mensajes de ayuda contextuales
- **Módulo:** `DataStructures.ts` (~313 líneas)


## 📚 DESCRIPCIÓN DETALLADA DE MÓDULOS

### 🤖 TelegramBot.ts (~600 líneas)
**Bot principal que coordina todo el flujo:**

**Comandos:**
- `/start` - Mensaje de bienvenida con instrucciones
- `/help` - Ayuda detallada con formatos soportados
- `/stats` - Estadísticas del sistema (archivos temporales)
- `/facturas` - Ver cantidad de facturas acumuladas
- `/limpiar` - Limpiar sesión actual del usuario

**Handlers:**
- `handlePhotoMessage()` - Procesa imágenes enviadas como foto
- `handleDocumentMessage()` - Procesa archivos enviados como documento
- `handleCallbackQuery()` - Gestiona clicks en botones

**Callbacks de Botones:**
- `download_excel` - Genera y envía archivo Excel
- `clear_session` - Limpia facturas acumuladas
- `show_summary` - Muestra resumen con totales

**Flujo de procesamiento:**
1. Usuario envía imagen/documento
2. Descarga con `DocumentIngestor`
3. Procesa con `VisionProcessor`
4. Agrega a sesión con `SessionManager`
5. Muestra resumen y botones
6. Usuario puede descargar Excel o seguir agregando


### 👁️ VisionProcessor.ts (~314 líneas)
**Procesamiento multimodal con GPT-4 Vision:**

**Funciones principales:**
- `processInvoiceImage()` - Método principal de procesamiento
- `encodeImageToBase64()` - Codifica imagen para envío a API
- `extractInvoiceData()` - Llama a OpenAI API
- `validateAndParse()` - Valida respuesta con Zod

**Características:**
- Prompt engineering optimizado para facturas
- Soporte para múltiples formatos de imagen y documento
- Manejo de errores y retry logic
- Parsing robusto de respuesta JSON
- Validación automática con schemas Zod
- Metadata de procesamiento (tiempo, confianza, modelo)


### 📥 DocumentIngestor.ts (~383 líneas)
**Gestión inteligente de archivos:**

**Funciones principales:**
- `downloadAndStore()` - Descarga desde Telegram API
- `detectFileExtension()` - Detecta tipo por magic bytes
- `validateFile()` - Valida formato y tamaño
- `scheduleCleanup()` - Programa eliminación
- `getStorageStats()` - Estadísticas de almacenamiento

**Magic Bytes soportados:**
- Imágenes: JPG, PNG, GIF, WEBP, BMP, TIFF, ICO
- Documentos: PDF, DOCX, DOC, XLSX, XLS, PPTX, PPT
- Archivos: ZIP, RAR, 7Z

**Características:**
- Validación independiente de extensión
- Limpieza automática configurable
- Manejo de errores de red
- Soporte para URLs de Telegram


### 📊 ExcelGenerator.ts (~288 líneas) ✨ NUEVO
**Generación de Excel con formato profesional:**

**Funciones principales:**
- `generateExcel()` - Genera buffer de Excel en memoria
- `generateAndSaveExcel()` - Guarda Excel en filesystem
- `invoiceToRow()` - Convierte Invoice a fila Excel
- `formatDateForExcel()` - Formatea fechas DD/MM/YYYY
- `extractOperationType()` - Detecta tipo de operación
- `extractBankName()` - Formatea nombre de banco

**Formato del Excel:**
- **Headers:** Fondo azul (#0066CC), texto blanco, negrita, centrado
- **Columnas:** Fecha | Tipo Operación | CUIT | Monto Bruto | Banco Receptor
- **Bordes:** Todas las celdas con borde fino negro
- **Moneda:** Formato $#,##0.00 con separador de miles
- **Alineación:** Texto izquierda, números derecha

**Características:**
- Soporta 1 o múltiples facturas en un solo archivo
- Estilos consistentes con imagen de referencia del cliente
- Generación en memoria (no crea archivos temporales)
- Buffer listo para envío directo por Telegram


### 💾 SessionManager.ts (~176 líneas) ✨ NUEVO
**Gestión de sesiones de usuario:**

**Funciones principales:**
- `addInvoice()` - Agrega factura a sesión
- `getInvoices()` - Obtiene todas las facturas
- `getInvoiceCount()` - Cuenta facturas acumuladas
- `clearInvoices()` - Limpia facturas de sesión
- `deleteSession()` - Elimina sesión completa
- `cleanExpiredSessions()` - Limpieza automática

**Estructura de sesión:**
```typescript
{
  userId: number
  invoices: Invoice[]
  lastActivity: Date
}
```

**Características:**
- Timeout configurable (default: 30 minutos)
- Limpieza automática cada 5 minutos
- Una sesión por usuario (Map<userId, session>)
- Thread-safe para múltiples usuarios simultáneos
- Estadísticas de sesiones activas


### 📝 DataStructures.ts (~313 líneas)
**Helpers y formateo:**

**Clases principales:**

**1. InvoiceResponse**
- `toReadableSummary()` - Genera resumen Markdown
- `toPrettyJSON()` - JSON formateado para archivo
- `toMinifiedJSON()` - JSON compacto
- `formatItems()` - Formatea items de factura
- `formatDate()` - Fechas en español
- `formatCurrency()` - Monedas con símbolo correcto

**2. ProcessingResultFormatter**
- `format()` - Formatea resultado de procesamiento
- `formatError()` - Mensajes de error amigables
- `welcomeMessage()` - Mensaje de /start
- `helpMessage()` - Mensaje de /help

**3. Logger**
- `info()` - Logs informativos
- `success()` - Logs de éxito
- `error()` - Logs de errores
- `warn()` - Advertencias
- `debug()` - Debug (solo en modo desarrollo)

**Características:**
- Mensajes contextuales y amigables
- Emojis para mejor UX
- Formato Markdown para Telegram
- Mapeo de errores técnicos a mensajes de usuario


### 🔧 Interfaces.ts (~140 líneas)
**Contratos de datos con validación Zod:**

**Schemas principales:**
- `VendorSchema` - Datos del proveedor (nombre, taxId, dirección)
- `InvoiceItemSchema` - Items de factura (descripción, cantidad, precio)
- `TaxesSchema` - Impuestos (IVA, otros)
- `MetadataSchema` - Metadata de procesamiento
- `InvoiceSchema` - Schema completo de factura
- `ProcessingResultSchema` - Resultado del procesamiento

**Tipos derivados:**
```typescript
type Invoice = z.infer<typeof InvoiceSchema>
type InvoiceItem = z.infer<typeof InvoiceItemSchema>
type ProcessingResult = z.infer<typeof ProcessingResultSchema>
// ... etc
```

**Características:**
- Validación automática con `.parse()`
- Mensajes de error descriptivos
- Type-safety en todo el codebase
- Regex para validación de formatos (fecha, moneda)
- Valores por defecto configurables


### 🧠 AIProcessor.ts (8 líneas) ⏸️ PLACEHOLDER
**Implementación futura (Opción B):**
- Normalización con LLM tradicional
- Post-procesamiento de OCR
- Alternativa a VisionProcessor
- Actualmente no utilizado

---

## 🔄 FLUJO COMPLETO DEL SISTEMA

```
1. Usuario envía imagen/documento
         ↓
2. TelegramBot recibe mensaje
         ↓
3. DocumentIngestor descarga y valida
         ↓
4. VisionProcessor extrae datos con GPT-4 Vision
         ↓
5. Zod valida estructura de datos
         ↓
6. SessionManager acumula factura
         ↓
7. TelegramBot muestra resumen + botones
         ↓
8. Usuario presiona "Descargar Excel"
         ↓
9. ExcelGenerator crea archivo con todas las facturas
         ↓
10. TelegramBot envía archivo Excel
         ↓
11. Usuario puede limpiar sesión o seguir agregando
```

## 📦 DEPENDENCIAS PRINCIPALES

```json
{
  "telegraf": "^4.16.3",        // Framework para Telegram bots
  "openai": "^4.67.3",          // Cliente oficial de OpenAI
  "exceljs": "^4.x.x",          // Generación de archivos Excel
  "zod": "^3.23.8",             // Validación de schemas
  "axios": "^1.7.9",            // Cliente HTTP
  "fs-extra": "^11.2.0",        // Operaciones de filesystem
  "dotenv": "^17.2.3"           // Variables de entorno
}
```