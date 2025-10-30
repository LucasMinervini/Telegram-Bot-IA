/**
 * VisionProcessor.ts
 * Módulo para procesamiento multimodal directo de comprobantes
 * Utiliza GPT-4 Vision (u otro modelo multimodal) para extraer datos estructurados
 * 
 * Opción A: Todo en uno - Una sola llamada API para análisis completo
 */

import OpenAI from 'openai';
import * as fs from 'fs-extra';
import * as path from 'path';
import { 
  VisionProcessorConfig, 
  ImageProcessingOptions, 
  ProcessingResult,
  InvoiceSchema 
} from './Interfaces';

/**
 * Clase VisionProcessor
 * Gestiona la integración con modelos multimodales para análisis de comprobantes
 */
export class VisionProcessor {
  private client: OpenAI;
  private config: VisionProcessorConfig;

  constructor(config: VisionProcessorConfig) {
    this.config = {
      maxTokens: 2000,
      temperature: 0.1, // Baja temperatura para respuestas más determinísticas
      ...config,
    };

    this.client = new OpenAI({
      apiKey: this.config.apiKey,
    });
  }

  /**
   * Procesa una imagen de comprobante y extrae datos estructurados
   * @param options Opciones de procesamiento (path a imagen, userId, messageId)
   * @returns Resultado del procesamiento con datos validados
   */
  async processInvoiceImage(options: ImageProcessingOptions): Promise<ProcessingResult> {
    const startTime = Date.now();

    try {
      // 1. Validar que el archivo existe
      if (!await fs.pathExists(options.imagePath)) {
        return {
          success: false,
          error: 'La imagen no existe en el path especificado',
          userId: options.userId,
          messageId: options.messageId,
        };
      }

      // 2. Leer la imagen y convertir a base64
      const imageBuffer = await fs.readFile(options.imagePath);
      const base64Image = imageBuffer.toString('base64');
      const imageExtension = path.extname(options.imagePath).toLowerCase();
      const mimeType = this.getMimeType(imageExtension);

      // 3. Construir el prompt optimizado para extracción de datos
      const prompt = this.buildExtractionPrompt();

      // 4. Llamar a la API de Vision
      console.log(`[VisionProcessor] Procesando imagen para usuario ${options.userId}...`);
      
      const response = await this.client.chat.completions.create({
        model: this.config.model,
        messages: [
          {
            role: 'system',
            content: 'Eres un experto en análisis de documentos financieros y facturas. Tu tarea es extraer información estructurada de comprobantes y devolverla en formato JSON válido.'
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt,
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64Image}`,
                  detail: options.detail || 'high', // 'high' para mejor precisión
                },
              },
            ],
          },
        ],
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        response_format: { type: 'json_object' }, // Forzar respuesta JSON
      });

      // 5. Extraer el contenido de la respuesta
      const rawContent = response.choices[0]?.message?.content;
      
      if (!rawContent) {
        return {
          success: false,
          error: 'El modelo no devolvió contenido',
          userId: options.userId,
          messageId: options.messageId,
        };
      }

      // 6. Parsear JSON
      const parsedData = JSON.parse(rawContent);

      // 7. Agregar metadata
      const processingTime = Date.now() - startTime;
      const invoiceData = {
        ...parsedData,
        metadata: {
          processedAt: new Date().toISOString(),
          processingTimeMs: processingTime,
          confidence: this.calculateConfidence(parsedData),
          model: this.config.model,
        },
      };

      // 8. Validar con Zod
      const validatedInvoice = InvoiceSchema.parse(invoiceData);

      console.log(`[VisionProcessor] ✅ Procesamiento exitoso en ${processingTime}ms`);

      return {
        success: true,
        invoice: validatedInvoice,
        userId: options.userId,
        messageId: options.messageId,
      };

    } catch (error: any) {
      const processingTime = Date.now() - startTime;
      
      console.error('[VisionProcessor] ❌ Error en procesamiento:', error);

      // Manejar diferentes tipos de errores
      if (error.name === 'ZodError') {
        return {
          success: false,
          error: `Error de validación: ${this.formatZodError(error)}`,
          userId: options.userId,
          messageId: options.messageId,
        };
      }

      if (error.code === 'invalid_api_key') {
        return {
          success: false,
          error: 'API Key de OpenAI inválida',
          userId: options.userId,
          messageId: options.messageId,
        };
      }

      return {
        success: false,
        error: `Error al procesar imagen: ${error.message}`,
        userId: options.userId,
        messageId: options.messageId,
      };
    }
  }

  /**
   * Construye el prompt optimizado para extracción de datos
   * @returns String con el prompt
   */
  private buildExtractionPrompt(): string {
    return `
Analiza esta imagen de comprobante/factura y extrae la siguiente información en formato JSON:

CAMPOS REQUERIDOS:
- invoiceNumber: Número de factura o comprobante (string)
- date: Fecha de emisión en formato YYYY-MM-DD (string)
- vendor: Objeto con información del proveedor
  - name: Nombre del proveedor/emisor (string)
  - taxId: CUIT/RUT/RFC/Tax ID (string, opcional)
  - address: Dirección del proveedor (string, opcional)
- totalAmount: Monto total de la factura (number)
- currency: Código de moneda ISO 4217 (string, 3 letras, ej: "ARS", "USD", "EUR")
- items: Array de items/productos (mínimo 1 item)
  - description: Descripción del producto/servicio (string)
  - quantity: Cantidad (number)
  - unitPrice: Precio unitario (number)
  - subtotal: Subtotal del item (number)

CAMPOS OPCIONALES:
- taxes: Objeto con impuestos
  - iva: Monto de IVA/VAT (number, default: 0)
  - otherTaxes: Otros impuestos (number, default: 0)
- paymentMethod: Método de pago (string, opcional)

INSTRUCCIONES:
1. Lee cuidadosamente toda la información visible en el comprobante
2. Si un campo no está visible o no se puede leer, usa valores sensatos:
   - Para strings requeridos: usa "No especificado" o "N/A"
   - Para números: usa 0 si no puedes determinarlo
3. Asegúrate de que los números sean numéricos (sin símbolos de moneda)
4. Convierte fechas al formato YYYY-MM-DD
5. Si hay múltiples items, inclúyelos todos
6. Verifica que totalAmount coincida con la suma de items + taxes

FORMATO DE RESPUESTA:
Devuelve ÚNICAMENTE un objeto JSON válido, sin texto adicional ni markdown.

Ejemplo de estructura:
{
  "invoiceNumber": "001-234",
  "date": "2025-10-29",
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
    "otherTaxes": 0
  },
  "paymentMethod": "Transferencia bancaria"
}
`.trim();
  }

  /**
   * Calcula el nivel de confianza basado en la completitud de datos
   * @param data Datos extraídos
   * @returns Nivel de confianza: 'high', 'medium', 'low'
   */
  private calculateConfidence(data: any): 'high' | 'medium' | 'low' {
    let score = 0;
    const checks = [
      data.invoiceNumber && data.invoiceNumber !== 'No especificado',
      data.date && data.date !== 'No especificado',
      data.vendor?.name && data.vendor.name !== 'No especificado',
      data.vendor?.taxId,
      data.totalAmount && data.totalAmount > 0,
      data.items && data.items.length > 0,
      data.taxes,
      data.paymentMethod,
    ];

    score = checks.filter(Boolean).length;

    if (score >= 7) return 'high';
    if (score >= 5) return 'medium';
    return 'low';
  }

  /**
   * Formatea errores de validación Zod para mensaje legible
   * @param error Error de Zod
   * @returns String formateado
   */
  private formatZodError(error: any): string {
    const issues = error.errors || [];
    return issues
      .map((issue: any) => `${issue.path.join('.')}: ${issue.message}`)
      .join(', ');
  }

  /**
   * Obtiene el MIME type según la extensión del archivo
   * @param extension Extensión del archivo (ej: .jpg, .png)
   * @returns MIME type
   */
  private getMimeType(extension: string): string {
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
    };

    return mimeTypes[extension] || 'image/jpeg';
  }

  /**
   * Método estático para crear instancia con configuración desde env
   * @returns Instancia configurada de VisionProcessor
   */
  static fromEnv(): VisionProcessor {
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

    if (!apiKey) {
      throw new Error('OPENAI_API_KEY no está definida en las variables de entorno');
    }

    return new VisionProcessor({
      apiKey,
      model,
    });
  }
}

