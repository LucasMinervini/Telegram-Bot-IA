# 🤖 Bot de Procesamiento de Comprobantes

Bot de Telegram que extrae datos estructurados de facturas y comprobantes con IA (Claude Haiku por defecto, OpenAI como alternativa) y los exporta a Excel.

---

## 🏛️ Arquitectura

El proyecto sigue **Clean Architecture** con principios **SOLID**. Las dependencias apuntan siempre hacia el dominio y todas las implementaciones se inyectan desde un único contenedor (`DIContainer`).

```
┌────────────────────────────────────────────────────────────┐
│  PRESENTATION         TelegramBotController + Formatters   │
└──────────────────────────────┬─────────────────────────────┘
                               │ usa ↓
┌──────────────────────────────▼─────────────────────────────┐
│  APPLICATION          ProcessInvoice · ProcessArchive      │
│                       GenerateExcel · ManageSession        │
└──────────────────────────────┬─────────────────────────────┘
                               │ depende de ↓
┌──────────────────────────────▼─────────────────────────────┐
│  DOMAIN               Invoice (entidad) + interfaces       │
└──────────────────────────────▲─────────────────────────────┘
                               │ implementa ↑
┌──────────────────────────────┴─────────────────────────────┐
│  INFRASTRUCTURE       Anthropic/OpenAI · Ingestor · ZIP    │
│                       ExcelJS · Repositorio · Seguridad    │
└────────────────────────────────────────────────────────────┘
```

### Capas

| Capa | Ubicación | Contenido |
|------|-----------|-----------|
| **Domain** | `src/domain/` | Entidad `Invoice` y contratos: `IVisionProcessor`, `IDocumentIngestor`, `IArchiveExtractor`, `IInvoiceRepository`, `IExcelGenerator`, `ILogger`, `IAuthenticationService`, `IRateLimiterService` |
| **Application** | `src/application/use-cases/` | `ProcessInvoiceUseCase`, `ProcessArchiveUseCase`, `GenerateExcelUseCase`, `ManageSessionUseCase` |
| **Infrastructure** | `src/infrastructure/` | Implementaciones concretas y `di/DIContainer.ts` (composition root) |
| **Presentation** | `src/presentation/` | `TelegramBotController` y formatters de mensajes y facturas |

### Componentes de infraestructura

| Componente | Responsabilidad |
|------------|-----------------|
| `AnthropicVisionProcessor` | Extracción con Claude Haiku: PDF nativo, salida estructurada vía `tool_use`, prompt caching, reintentos ante 429 y fallback opcional a un modelo más capaz |
| `OpenAIVisionProcessor` | Proveedor alternativo (`VISION_PROVIDER=openai`) |
| `FileDocumentIngestor` | Descarga a `temp/`, límites de tamaño y borrado inmediato |
| `FileSignatureDetector` | Valida el tipo real del archivo por *magic bytes* |
| `ZipArchiveExtractor` | Extrae comprobantes de un ZIP con protección contra zip bombs |
| `InMemoryInvoiceRepository` | Sesiones por usuario en memoria con expiración |
| `ExcelJSGenerator` | Genera el Excel de comprobantes acumulados |
| `AuthenticationService` · `RateLimiterService` · `AuditLogger` | Whitelist de usuarios, límite de peticiones y registro de auditoría |

### Flujo de un comprobante

```
Telegram ─► TelegramBotController
              │
              ├─ archivo suelto ─► ProcessInvoiceUseCase
              │                      FileDocumentIngestor (descarga + magic bytes)
              │                      IVisionProcessor (IA → datos estructurados)
              │                      Invoice.create (normalización y validación)
              │                      IInvoiceRepository (sesión del usuario)
              │
              └─ ZIP ─────────────► ProcessArchiveUseCase
                                     ZipArchiveExtractor → procesa cada archivo
                                     (en paralelo; se detiene si el proveedor de IA no responde)

Botón "Descargar Excel" ─► GenerateExcelUseCase ─► ExcelJSGenerator ─► .xlsx al usuario
```

---

## 🚀 Uso

### Puesta en marcha

Requisitos: Node.js 18+, pnpm, un token de bot de Telegram ([@BotFather](https://t.me/botfather)) y una API key de Anthropic.

```bash
pnpm install
```

Copiar `.env.example` a `.env` y completar como mínimo:

```env
TELEGRAM_BOT_TOKEN=...
VISION_PROVIDER=anthropic
ANTHROPIC_API_KEY=...
```

El resto de las variables (seguridad, límites de archivos y ZIP, modelo de fallback) están documentadas en `.env.example`.

```bash
pnpm run dev
```

| Script | Uso |
|--------|-----|
| `pnpm run dev` | Desarrollo con recarga automática |
| `pnpm run build` | Compila a `dist/` |
| `pnpm run start:clean` | Ejecuta la versión compilada |
| `pnpm test` | Tests unitarios y de integración |
| `pnpm run test:coverage` | Tests con cobertura (mínimo 80%) |
| `pnpm run test:e2e` | Tests end-to-end con Playwright |

### En Telegram

1. Enviá una **foto, PDF o documento** de un comprobante, o un **ZIP** con varios.
2. El bot responde con un resumen de los datos extraídos y los acumula en tu sesión.
3. Usá los botones para **descargar el Excel**, **ver el resumen** o **limpiar la sesión**.

| Comando | Descripción |
|---------|-------------|
| `/start` | Bienvenida |
| `/help` | Ayuda y formatos soportados |
| `/comprobantes` | Comprobantes acumulados en la sesión |
| `/limpiar` | Vacía la sesión |
| `/stats` | Estadísticas del sistema |
