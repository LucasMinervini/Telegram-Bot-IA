# Brief de Arquitectura - IA Telegram Bot

**Fecha:** 29 de Octubre, 2025  
**Versión:** 1.0  
**Estado:** Diseño Inicial

---

## 📋 RESUMEN EJECUTIVO

### Visión del Proyecto
Bot de Telegram con capacidades de IA para procesamiento automático de comprobantes y facturas. Los usuarios envían una imagen del comprobante y reciben datos estructurados en formato JSON junto con un resumen legible.

### Objetivos de Negocio
- Automatizar la digitalización de comprobantes y facturas
- Reducir errores de transcripción manual de datos
- Proporcionar datos estructurados listos para integración con sistemas contables
- Ofrecer una experiencia de usuario simple y rápida a través de Telegram

### Alcance Técnico
**En Alcance:**
- Bot de Telegram (Node.js/TypeScript)
- Procesamiento de imágenes de comprobantes (JPG, PNG, PDF)
- Extracción de datos mediante OCR o modelos multimodales
- Normalización y validación de datos con Zod
- Generación de JSON estructurado
- Almacenamiento temporal de imágenes
- Resumen en lenguaje natural de la información extraída

**Fuera de Alcance (v1.0):**
- Interfaz web/móvil nativa
- Procesamiento batch de múltiples comprobantes
- Integración directa con sistemas contables (ERP/SAP)
- Análisis histórico y reportes
- OCR de documentos manuscritos complejos

### Stack Tecnológico Propuesto
- **Bot:** TypeScript/Node.js con `node-telegram-bot-api`
- **Validación:** Zod para schemas y validación de datos
- **Opción A (Rápida):** Modelo multimodal (GPT-4 Vision, Claude 3 Vision, Gemini Vision)
- **Opción B (Control):** OCR (Google Vision / AWS Textract / Azure Form Recognizer) + LLM (OpenAI/Anthropic)
- **Storage Temporal:** Filesystem local o S3
- **Base de Datos (Opcional):** PostgreSQL para histórico

---

## 🎯 10 PREGUNTAS ARQUITECTÓNICAS CLAVE

### 1. **Enfoque de Procesamiento: Multimodal vs OCR+LLM**
**Pregunta:** ¿Qué estrategia de procesamiento de comprobantes utilizaremos?
- **Opción A (Multimodal):** GPT-4 Vision, Claude 3 Vision, Gemini Vision
  - Ventajas: Rápido, una sola llamada, mejor comprensión de layout
  - Desventajas: Más costoso, dependencia de un proveedor
- **Opción B (OCR+LLM):** Google Vision/AWS Textract/Azure + OpenAI/Anthropic
  - Ventajas: Más control, posibilidad de cambiar componentes
  - Desventajas: Dos llamadas API, más complejo

**Impacto:** Costos recurrentes, latencia, precisión, flexibilidad arquitectónica.

---

### 2. **Selección de Proveedor OCR/Vision**
**Pregunta:** Si elegimos Opción B, ¿qué servicio de OCR utilizaremos?
- **Google Vision API:** Buena precisión, pricing competitivo
- **AWS Textract:** Especializado en formularios y tablas
- **Azure Form Recognizer:** Modelos pre-entrenados para facturas
- ¿Necesitamos detección de layout específico para facturas?
- ¿El proveedor debe soportar el formato de comprobantes de nuestra región?

**Impacto:** Precisión de extracción, costos, facilidad de integración.

---

### 3. **Modelo LLM para Normalización**
**Pregunta:** ¿Qué LLM utilizaremos para normalizar/estructurar datos?
- **OpenAI GPT-4/GPT-3.5:** Ampliamente probado, JSON mode disponible
- **Anthropic Claude 3:** Excelente precisión, más económico que GPT-4
- **Local (Llama, Mistral):** Sin costos recurrentes, requiere infraestructura
- ¿Qué nivel de precisión necesitamos? (99%+, 95%+, 90%+)
- ¿Cuál es el presupuesto mensual para API calls?

**Impacto:** Costos, latencia, calidad de normalización, dependencias externas.

---

### 4. **Estrategia de Almacenamiento**
**Pregunta:** ¿Dónde y por cuánto tiempo almacenamos las imágenes y datos?
- **Imágenes:** Local (temp), S3, Google Cloud Storage
  - ¿TTL? (eliminar después de procesamiento, 24h, 30 días)
- **JSON procesado:** PostgreSQL, MongoDB, solo en Telegram
- ¿Necesitamos histórico para auditoría?
- ¿Los datos son sensibles (requieren encriptación)?

**Impacto:** Costos de storage, privacidad, compliance, funcionalidad de búsqueda.

---

### 5. **Deployment y Hosting**
**Pregunta:** ¿Dónde y cómo deployaremos el bot?
- **Opciones:** AWS Lambda/EC2, Google Cloud Run, Railway, Fly.io, VPS
- ¿Serverless (scaling automático) vs Servidor dedicado?
- ¿Necesitamos webhooks o polling para Telegram?
- ¿Región de deployment? (latencia a usuarios)
- ¿CI/CD automatizado?

**Impacto:** Costos operativos, latencia, complejidad de deployment, escalabilidad.

---

### 6. **Esquema de Datos y Validación**
**Pregunta:** ¿Qué campos exactamente extraeremos de los comprobantes?
- **Campos mínimos:** Número factura, fecha, monto total, proveedor
- **Campos opcionales:** Items individuales, IVA, forma de pago, CUIT/RUT
- ¿Necesitamos validación de formato? (ej: fecha válida, monto numérico)
- ¿Tipado estricto con Zod o validación suave?
- ¿Qué hacer con campos faltantes? (error, null, valor default)

**Impacto:** Calidad de datos, complejidad de prompts, experiencia de usuario.

---

### 7. **Seguridad y Privacidad de Datos**
**Pregunta:** ¿Cuáles son los requisitos de seguridad y privacidad?
- ¿Los comprobantes contienen información sensible (datos financieros personales)?
- ¿Necesitamos encriptación at-rest y in-transit?
- ¿Cuánto tiempo retenemos las imágenes? (eliminar inmediatamente, 24h, permanente)
- ¿Cumplimiento regulatorio? (GDPR, protección de datos financieros)
- ¿Los proveedores cloud (OpenAI, Google, AWS) pueden procesar estos datos?
- ¿Necesitamos aislamiento entre usuarios?

**Impacto:** Elección de proveedores, arquitectura de datos, costos y complejidad legal.

---

### 8. **Manejo de Errores y Casos Edge**
**Pregunta:** ¿Cómo manejamos imágenes de mala calidad o errores de procesamiento?
- ¿Qué hacer si la imagen es ilegible?
- ¿Qué hacer si el OCR/Vision API falla?
- ¿Qué hacer si el LLM no puede extraer todos los campos?
- ¿Necesitamos retry logic con backoff exponencial?
- ¿Cómo notificamos errores al usuario? (mensaje claro, solicitar nueva imagen)
- ¿Soporte para corrección manual de datos?

**Impacto:** Experiencia de usuario, robustez del sistema, tasa de éxito.

---

### 9. **Observabilidad y Métricas**
**Pregunta:** ¿Cómo monitoreamos el rendimiento y calidad del sistema?
- **Métricas clave:**
  - Latencia end-to-end (imagen → JSON)
  - Tasa de éxito de procesamiento
  - Costos por comprobante procesado
  - Precisión de extracción (validación manual sampling)
- ¿Logging: local, CloudWatch, Datadog?
- ¿Necesitamos tracking de usuarios para analytics?
- ¿Alertas automáticas por fallos?

**Impacto:** Capacidad de diagnosticar problemas, optimización de costos, mejora de precisión.

---

### 10. **Experiencia de Usuario y Formato de Respuesta**
**Pregunta:** ¿Cómo presentamos los resultados al usuario?
- ¿Solo JSON o también resumen en lenguaje natural?
- ¿Formato del JSON: minificado o pretty-printed?
- ¿Enviamos archivo adjunto (.json) o texto en el mensaje?
- ¿Incluimos confianza/score de cada campo extraído?
- ¿Permitimos feedback del usuario? (correcto/incorrecto)
- ¿Opción de editar campos antes de confirmar?

**Impacto:** Usabilidad, adopción del sistema, calidad de datos para mejoras futuras.

---

## 📊 NFRs (Non-Functional Requirements) PROPUESTOS

### 1. **Performance**

#### NFR-P1: Latencia de Procesamiento de Comprobantes
**Descripción:** El sistema debe procesar comprobantes rápidamente para una buena experiencia de usuario.

**SLI (Service Level Indicator):**
- **Métrica:** P95 de latencia end-to-end (desde imagen recibida hasta JSON enviado)
- **Medición:** Timestamp imagen recibida - Timestamp respuesta con JSON enviada

**SLO (Service Level Objective):**
- **P95 < 10 segundos** para procesamiento completo (imagen → JSON)
- **P50 < 6 segundos** para casos estándar
- **P99 < 20 segundos** incluyendo casos complejos

**Justificación:** Usuarios esperan respuestas rápidas en Telegram. Latencias >15s se perciben como "lentas".

**Componentes de latencia:**
- Upload imagen: 1-2s
- OCR/Vision API: 2-4s
- LLM normalización: 2-5s
- Envío respuesta: <1s

---

#### NFR-P2: Throughput de Procesamiento Concurrente
**Descripción:** El sistema debe manejar múltiples usuarios procesando comprobantes simultáneamente.

**SLI:**
- **Métrica:** Comprobantes procesados por minuto (CPM)
- **Medición:** Count de comprobantes exitosamente procesados / tiempo

**SLO:**
- **≥20 CPM** con latencia dentro de SLO
- **Sin degradación** con hasta 30 usuarios concurrentes
- **Escalado automático** si concurrencia > 50

---

### 2. **Disponibilidad**

#### NFR-A1: Uptime del Servicio
**Descripción:** El bot debe estar disponible para los usuarios la mayor parte del tiempo.

**SLI:**
- **Métrica:** Porcentaje de uptime
- **Medición:** (Tiempo total - Tiempo de downtime no planificado) / Tiempo total × 100

**SLO:**
- **98.0% uptime mensual** (~14.4 horas de downtime permitido/mes)
- **Objetivo de 99.0%** en producción estable (7.3 horas/mes)

**Medición:**
- Health checks cada 60 segundos
- Alertas si 3 health checks consecutivos fallan

**Justificación:** No es un servicio crítico 24/7, pero debe ser confiable para uso diario.

---

### 3. **Escalabilidad**

#### NFR-S1: Capacidad de Usuarios Concurrentes
**Descripción:** El sistema debe escalar para soportar crecimiento de usuarios.

**SLI:**
- **Métrica:** Usuarios concurrentes activos sin degradación
- **Medición:** Count de usuarios procesando comprobantes simultáneamente

**SLO:**
- **≥30 usuarios concurrentes** manteniendo P95 latencia <10s
- **≥100 usuarios** con escalado horizontal automático
- **Auto-scaling** cuando CPU >70% o requests en cola >10

---

### 4. **Confiabilidad y Precisión**

#### NFR-R1: Tasa de Éxito de Procesamiento
**Descripción:** El sistema debe procesar comprobantes exitosamente en la mayoría de los casos.

**SLI:**
- **Métrica:** Porcentaje de comprobantes procesados exitosamente
- **Medición:** Count(JSON válido generado) / Total comprobantes recibidos × 100

**SLO:**
- **≥90%** de comprobantes procesados sin error
- **≥95%** para imágenes de calidad estándar
- **Error rate <10%** para casos edge (mala calidad, formato inusual)

**Manejo de errores:**
- Mensaje claro al usuario si falla
- Sugerencias de mejora (mejor iluminación, enfoque, etc.)

---

#### NFR-R2: Precisión de Extracción de Datos
**Descripción:** Los datos extraídos deben ser precisos y coincidir con el comprobante.

**SLI:**
- **Métrica:** Porcentaje de campos correctamente extraídos
- **Medición:** Validación manual de muestra aleatoria (sampling)

**SLO (Target):**
- **≥95%** precisión en campos críticos (monto, fecha, número factura)
- **≥85%** precisión en campos opcionales (items, IVA)
- **100%** campos validados con Zod (formato correcto)

---

### 5. **Seguridad**

#### NFR-SE1: Protección de Datos de Comprobantes
**Descripción:** Los comprobantes y datos financieros de usuarios deben estar protegidos.

**SLI:**
- **Métrica:** Cumplimiento de medidas de seguridad
- **Medición:** Audit de configuración de seguridad

**SLO:**
- **100%** de comunicaciones sobre TLS/HTTPS (Telegram Bot API)
- **100%** de imágenes eliminadas después de procesamiento (si TTL=0)
- **100%** aislamiento entre usuarios (sin leaks de datos)
- **Zero incidentes** de acceso no autorizado
- **Encriptación at-rest** si almacenamiento persistente

**Medidas:**
- Variables de entorno para API keys (.env)
- No logging de datos sensibles
- Rate limiting por usuario (prevenir abuso)

---

### 6. **Costos**

#### NFR-C1: Costo por Comprobante Procesado
**Descripción:** El procesamiento debe ser económicamente viable.

**SLI:**
- **Métrica:** Costo promedio por comprobante procesado
- **Medición:** Sum(costos APIs + hosting) / Count(comprobantes procesados)

**SLO Propuesto:**

**Opción A (Multimodal):**
- **<$0.05 por comprobante** usando GPT-4 Vision
- **<$0.02 por comprobante** usando GPT-4o-mini Vision

**Opción B (OCR + LLM):**
- **<$0.03 por comprobante** (Google Vision + GPT-3.5)
- **<$0.01 por comprobante** con optimizaciones

**Componentes de costo:**
- OCR/Vision API: $0.001-$0.01 por imagen
- LLM normalización: $0.002-$0.04 por request
- Hosting: $5-20/mes (amortizado)
- Storage: <$0.001 por comprobante/mes

**Meta financiera:**
- **<$50/mes** para 1000 comprobantes procesados
- **<$200/mes** para 10,000 comprobantes procesados

---

### 7. **Mantenibilidad**

#### NFR-M1: Observabilidad del Sistema
**Descripción:** El equipo debe poder diagnosticar problemas rápidamente.

**SLI:**
- **Métrica:** Tiempo promedio de detección de incidentes (MTTD)
- **Medición:** Timestamp incidente ocurrió - Timestamp alerta generada

**SLO:**
- **MTTD <10 minutos** para errores críticos
- **100%** de requests con trace/request ID
- **Logs estructurados** (JSON) para todos los módulos
- **Métricas exportadas** (latencia, tasa de éxito, costos)

**Logging mínimo:**
- Timestamp, user_id, comprobante_id
- Latencia por etapa (OCR, LLM, total)
- Errores con stack trace
- Costos por request

---

## 🎬 PRÓXIMOS PASOS

### Fase 1: Decisiones Críticas (Semana 1)
1. **Responder las 10 preguntas arquitectónicas** con stakeholders técnicos y de negocio
2. **Definir esquema de datos exacto** (campos a extraer de comprobantes)
3. **Elegir enfoque de procesamiento:** Opción A (Multimodal) vs Opción B (OCR+LLM)
4. **Validar presupuesto** y establecer límites de costos

### Fase 2: POC (Proof of Concept) - Semana 2-3
5. **Crear MVP mínimo:**
   - Bot básico que recibe imagen
   - Integración con API elegida (Vision/OCR + LLM)
   - Generación de JSON simple
   - Test con 10-20 comprobantes reales
6. **Medir métricas:**
   - Latencia real end-to-end
   - Tasa de éxito de extracción
   - Precisión de campos (validación manual)
   - Costo por comprobante

### Fase 3: Desarrollo MVP - Semana 4-6
7. **Implementar funcionalidades core:**
   - Validación con Zod
   - Manejo de errores robusto
   - Almacenamiento temporal de imágenes
   - Logging y métricas básicas
8. **Testing con usuarios beta** (5-10 usuarios)
9. **Iteración basada en feedback**

### Fase 4: Producción - Semana 7+
10. **Deployment a producción**
11. **Monitoreo continuo** de métricas y costos
12. **Optimizaciones** basadas en datos reales

---

## 📝 DECISIONES PENDIENTES

| ID | Decisión | Opciones | Criterio Principal | Deadline |
|----|----------|----------|-------------------|----------|
| **D1** | **Enfoque Procesamiento** | Opción A (Multimodal) / Opción B (OCR+LLM) | Costo vs Precisión | **Alta prioridad** |
| **D2** | **Proveedor Multimodal** | GPT-4 Vision / Claude 3 / Gemini Vision | Costo + Precisión | Si D1 = Opción A |
| **D3** | **Proveedor OCR** | Google Vision / AWS Textract / Azure Form Recognizer | Precisión en facturas | Si D1 = Opción B |
| **D4** | **LLM Normalización** | GPT-4 / GPT-3.5 / Claude 3 | Costo vs Precisión | Si D1 = Opción B |
| **D5** | **Esquema de Datos** | Campos mínimos / Campos completos | Requisitos de negocio | **Alta prioridad** |
| **D6** | **Almacenamiento Imágenes** | Eliminar inmediatamente / TTL 24h / Permanente | Privacidad + Storage | Media prioridad |
| **D7** | **Hosting Platform** | Railway / Fly.io / AWS / VPS | Costo + Simplicidad | Media prioridad |
| **D8** | **Base de Datos (Opcional)** | PostgreSQL / MongoDB / None | Necesidad de histórico | Baja prioridad |
| **D9** | **Rate Limiting** | Por usuario / Global / None | Prevención de abuso | Baja prioridad |
| **D10** | **Modo Bot** | Polling / Webhook | Hosting capabilities | Media prioridad |

---

## 🔄 FLUJO DE DATOS - EJEMPLO COMPLETO

### Escenario: Usuario envía imagen de factura

#### 1️⃣ **Recepción (TelegramBot.ts)**
```
Usuario → envía imagen vía Telegram
Bot → recibe update con photo
Bot → descarga imagen (getFile API)
Bot → guarda temporalmente: /temp/user_123_invoice_456.jpg
```

#### 2️⃣ **Procesamiento (Opción A - Multimodal)**
```
VisionProcessor.ts → lee imagen
VisionProcessor.ts → llama GPT-4 Vision API con prompt:
  "Extrae los siguientes campos de esta factura:
   - Número de factura
   - Fecha de emisión
   - Proveedor
   - Monto total
   - Items (descripción, cantidad, precio)
   Devuelve JSON estructurado."
  
API → devuelve JSON raw
```

#### 2️⃣ **Procesamiento (Opción B - OCR+LLM)**
```
OCRProcessor.ts → envía imagen a Google Vision API
Google Vision → devuelve texto plano:
  "FACTURA N° 001-234
   Fecha: 15/10/2025
   Proveedor: Empresa XYZ
   Total: $15,750.00
   ..."

AIProcessor.ts → llama OpenAI GPT-3.5 con prompt:
  "Del siguiente texto OCR, extrae JSON estructurado:
   [texto OCR aquí]"
   
GPT-3.5 → devuelve JSON raw
```

#### 3️⃣ **Validación (AIProcessor.ts + Interfaces.ts)**
```typescript
const result = InvoiceSchema.parse(rawJSON);
// Si falla → throw ZodError
// Si pasa → datos validados con tipos correctos
```

#### 4️⃣ **Generación de Respuesta (AIProcessor.ts)**
```typescript
const summary = `
✅ Factura procesada exitosamente

📄 Número: ${result.invoiceNumber}
📅 Fecha: ${result.date}
🏢 Proveedor: ${result.vendor}
💰 Total: $${result.totalAmount}
`;

const jsonString = JSON.stringify(result, null, 2);
```

#### 5️⃣ **Devolución (TelegramBot.ts)**
```
Bot → envía mensaje con summary
Bot → envía archivo invoice_456.json
Bot → elimina imagen temporal (si TTL=0)
Bot → registra métricas (latencia, costo)
```

#### 6️⃣ **Almacenamiento Opcional (DataStructures.ts)**
```sql
INSERT INTO invoices (user_id, invoice_data, processed_at)
VALUES (123, '{"invoiceNumber": "001-234", ...}', NOW());
```

---

## 📊 EJEMPLO DE JSON RESULTANTE

```json
{
  "invoiceNumber": "001-234",
  "date": "2025-10-15",
  "vendor": {
    "name": "Empresa XYZ S.A.",
    "taxId": "30-12345678-9",
    "address": "Av. Corrientes 1234, CABA"
  },
  "totalAmount": 15750.00,
  "currency": "ARS",
  "items": [
    {
      "description": "Servicio de consultoría",
      "quantity": 10,
      "unitPrice": 1500.00,
      "subtotal": 15000.00
    }
  ],
  "taxes": {
    "iva": 750.00,
    "otherTaxes": 0.00
  },
  "paymentMethod": "Transferencia bancaria",
  "metadata": {
    "processedAt": "2025-10-29T14:32:15Z",
    "processingTimeMs": 6420,
    "confidence": "high"
  }
}
```

---

**Documento preparado por:** AI Architect Assistant  
**Para revisión por:** Equipo Técnico  
**Última actualización:** 2025-10-29

