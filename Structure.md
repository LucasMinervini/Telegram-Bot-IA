/IA Telegram Bot/
├── node_modules/
├── src/                
│   ├── modules/        
│   │   ├── TelegramBot.ts        (Manejo de la conexión, comandos y webhooks del bot)
│   │   ├── DocumentIngestor.ts   (Recepción y almacenamiento temporal de comprobantes)
│   │   ├── OCRProcessor.ts       (Extracción de texto: Opción B - Google Vision/AWS Textract/Azure)
│   │   ├── VisionProcessor.ts    (Procesamiento multimodal: Opción A - GPT Vision u otros)
│   │   ├── AIProcessor.ts        (Normalización con LLM y generación de JSON estructurado)
│   │   ├── Interfaces.ts         (Definiciones de tipos de datos con validación Zod)
│   │   └── DataStructures.ts     (Clases para manejar comprobantes y respuestas)
│   └── index.ts              
├── dist/               
├── .env
├── package.json        
└── tsconfig.json



## ARQUITECTURA MÍNIMA RECOMENDADA

### 1. Bot de Telegram (Node/TypeScript)
- **Librería:** `node-telegram-bot-api` o Bot API + webhook
- **Función:** Recibe archivo (imagen de comprobante) → lo guarda temporalmente (S3/Drive/Local)
- **Módulo:** `TelegramBot.ts`


### 2. Lectura del Comprobante

**Opción A (Todo en uno, rápida):** 
- Modelo multimodal que entienda imagen y devuelva campos estructurados
- Ejemplo: GPT-4 Vision, Claude 3 Vision, Gemini Vision
- **Módulo:** `VisionProcessor.ts`

**Opción B (Clásica, más control):** 
- **OCR:** Google Vision, AWS Textract o Azure Form Recognizer
- **Post-proceso con LLM:** Prompt para normalizar la salida OCR a JSON
- **Módulos:** `OCRProcessor.ts` + `AIProcessor.ts`


### 3. Normalización y Validación
- **TypeScript:** Tipado fuerte para la estructura de datos
- **Zod:** Validación de esquemas (evita campos vacíos o tipos incorrectos)
- **Módulo:** `Interfaces.ts` (con schemas Zod)


### 4. Devolución
- Devuelve al usuario un **resumen legible** del comprobante
- Adjunta el **JSON estructurado**
- Opcionalmente: sube a base de datos para histórico
- **Módulo:** `AIProcessor.ts` + `TelegramBot.ts`


## DESCRIPCIÓN DE MÓDULOS

### Interfaces.ts
Define los contratos de datos con validación Zod:
• `InvoiceSchema`: Estructura del comprobante (nroFactura, fecha, monto, proveedor, items[], etc.)
• `OCRResultSchema`: Salida del OCR antes de normalizar
• `VisionResultSchema`: Salida del modelo multimodal
• Validación automática con `.parse()` para garantizar integridad de datos


### DocumentIngestor.ts
Manejo de archivos:
• Recibe imagen del comprobante desde Telegram
• Almacena temporalmente (filesystem local o S3)
• Retorna path/URL para procesamiento
• Limpia archivos temporales después del procesamiento


### OCRProcessor.ts (Opción B)
Extracción de texto plano:
• Integración con Google Vision API / AWS Textract / Azure Form Recognizer
• Envía imagen y recibe texto plano o campos estructurados
• Maneja errores de API y retry logic


### VisionProcessor.ts (Opción A)
Procesamiento multimodal directo:
• Envía imagen a modelo multimodal (GPT-4 Vision, Claude 3, etc.)
• Incluye prompt engineering para extraer campos específicos
• Recibe JSON estructurado directamente del modelo


### AIProcessor.ts
Normalización y generación de respuesta:
• Opción A: Formatea la salida del modelo multimodal
• Opción B: Toma texto OCR y usa LLM para extraer campos + normalizar a JSON
• Valida con Zod schema
• Genera resumen en lenguaje natural para el usuario