/**
 * OpenAIVisionProcessor.ts
 * Clean implementation of vision processing using OpenAI GPT-4 Vision API
 * Implements IVisionProcessor interface without legacy dependencies
 * Follows Clean Architecture and SOLID principles
 */

import OpenAI from 'openai';
import fs from 'fs-extra';
import * as path from 'path';
import { IVisionProcessor, IImageProcessingOptions, IProcessingResult } from '../../domain/interfaces/IVisionProcessor';
import { Invoice, IInvoiceProps } from '../../domain/entities/Invoice.entity';

export interface IOpenAIConfig {
  apiKey: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * OpenAI Vision Processor Implementation
 * Direct implementation without wrappers - Clean Architecture compliant
 */
export class OpenAIVisionProcessor implements IVisionProcessor {
  private client: OpenAI;
  private config: IOpenAIConfig;
  private demoMode: boolean;

  constructor(config: IOpenAIConfig) {
    this.config = {
      maxTokens: 2000,
      temperature: 0.1,
      ...config,
    };

    this.demoMode = process.env.DEMO_MODE === 'true' || process.env.DEMO_MODE === '1';
    
    this.client = new OpenAI({
      apiKey: this.config.apiKey,
    });

    if (this.demoMode) {
      console.log('[OpenAIVisionProcessor] 🎭 DEMO MODE ACTIVE - No API calls will be made');
    }
  }

  async processInvoiceImage(options: IImageProcessingOptions): Promise<IProcessingResult> {
    const startTime = Date.now();

    try {
      // Validate file exists
      if (!await fs.pathExists(options.imagePath)) {
        return this.createErrorResult('File does not exist', options.userId, options.messageId);
      }

      // Demo mode: return simulated data
      if (this.demoMode) {
        return await this.generateDemoResponse(options, startTime);
      }

      // Read and encode image
      const imageBuffer = await fs.readFile(options.imagePath);
      const base64Image = imageBuffer.toString('base64');
      const mimeType = this.getMimeType(path.extname(options.imagePath));

      // Build prompt
      const prompt = this.buildExtractionPrompt();

      // Call OpenAI API
      console.log(`[OpenAIVisionProcessor] Processing image for user ${options.userId}...`);
      
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
                  detail: options.detail || 'high',
                },
              },
            ],
          },
        ],
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        response_format: { type: 'json_object' },
      });

      // Extract and parse response
      const rawContent = response.choices[0]?.message?.content;
      
      if (!rawContent) {
        return this.createErrorResult('Model returned no content', options.userId, options.messageId);
      }

      const parsedData = JSON.parse(rawContent);

      // Add metadata
      const processingTime = Date.now() - startTime;
      const invoiceProps: IInvoiceProps = {
        ...parsedData,
        metadata: {
          processedAt: new Date().toISOString(),
          processingTimeMs: processingTime,
          confidence: this.calculateConfidence(parsedData),
          model: this.config.model,
        },
      };

      // Create domain entity
      const invoice = Invoice.create(invoiceProps);

      console.log(`[OpenAIVisionProcessor] ✅ Processing successful in ${processingTime}ms`);

      return {
        success: true,
        invoice,
        userId: options.userId,
        messageId: options.messageId,
      };

    } catch (error: any) {
      const processingTime = Date.now() - startTime;
      console.error('[OpenAIVisionProcessor] ❌ Processing error:', error);

      let errorMessage = `Error processing image: ${error.message}`;

      if (error.code === 'invalid_api_key') {
        errorMessage = 'Invalid OpenAI API key';
      } else if (error.name === 'SyntaxError') {
        errorMessage = 'Failed to parse AI response as JSON';
      }

      return this.createErrorResult(errorMessage, options.userId, options.messageId);
    }
  }

  getModelName(): string {
    return this.config.model;
  }

  /**
   * Build optimized prompt for invoice extraction
   */
  private buildExtractionPrompt(): string {
    return `
Analiza esta imagen de comprobante/factura y extrae la siguiente información en formato JSON:

CAMPOS REQUERIDOS:
- invoiceNumber: Número de factura o comprobante (string)
- date: Fecha de emisión en formato YYYY-MM-DD (string)
- operationType: Tipo de operación (string, ej: "Transferencia", "Depósito", "Pago", "Factura", etc.)
- vendor: Objeto con información del proveedor
  - name: Nombre del proveedor/emisor (string)
  - taxId: CUIT/CUIL/RUT/RFC/Tax ID (string, opcional)
  - cvu: CVU (Clave Virtual Uniforme) si está presente (string, opcional)
  - address: Dirección del proveedor (string, opcional)
- totalAmount: Monto total bruto de la factura (number)
- currency: Código de moneda ISO 4217 (string, 3 letras, ej: "ARS", "USD", "EUR")
- receiverBank: Nombre del banco receptor (string, opcional pero importante si está visible)
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
2. Si falta algún campo REQUERIDO, intenta inferirlo del contexto
3. Usa "COMPROBANTE-001" como invoiceNumber si no está visible
4. La fecha debe estar en formato YYYY-MM-DD
5. Si no encuentras items específicos, crea un item genérico con "Servicio/Producto" como descripción
6. Asegúrate de que el JSON sea válido y tenga TODOS los campos requeridos

FORMATO DE SALIDA (JSON estricto):
{
  "invoiceNumber": "string",
  "date": "YYYY-MM-DD",
  "operationType": "string",
  "vendor": {
    "name": "string",
    "taxId": "string o undefined",
    "cvu": "string o undefined",
    "address": "string o undefined"
  },
  "totalAmount": number,
  "currency": "XXX",
  "receiverBank": "string o undefined",
  "items": [
    {
      "description": "string",
      "quantity": number,
      "unitPrice": number,
      "subtotal": number
    }
  ],
  "taxes": {
    "iva": number,
    "otherTaxes": number
  },
  "paymentMethod": "string o undefined"
}

Devuelve SOLO el JSON, sin texto adicional.
`.trim();
  }

  /**
   * Calculate confidence level based on data completeness
   */
  private calculateConfidence(data: any): 'high' | 'medium' | 'low' {
    let score = 0;
    const required = ['invoiceNumber', 'date', 'vendor', 'totalAmount', 'items'];
    const optional = ['operationType', 'receiverBank', 'taxes', 'paymentMethod'];

    // Check required fields
    for (const field of required) {
      if (data[field] && data[field] !== 'COMPROBANTE-001') {
        score += 2;
      }
    }

    // Check optional fields
    for (const field of optional) {
      if (data[field]) {
        score += 1;
      }
    }

    if (score >= 10) return 'high';
    if (score >= 6) return 'medium';
    return 'low';
  }

  /**
   * Get MIME type from file extension
   */
  private getMimeType(extension: string): string {
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
      '.tiff': 'image/tiff',
      '.pdf': 'application/pdf',
    };

    return mimeTypes[extension.toLowerCase()] || 'image/jpeg';
  }

  /**
   * Generate demo response (for testing without API calls)
   */
  private async generateDemoResponse(
    options: IImageProcessingOptions,
    startTime: number
  ): Promise<IProcessingResult> {
    console.log('[OpenAIVisionProcessor] 🎭 Generating DEMO response...');

    // Simulate realistic delay
    const delay = 1000 + Math.random() * 2000;
    await new Promise(resolve => setTimeout(resolve, delay));

    const demoInvoices = [
      {
        invoiceNumber: 'DEMO-FC-0001-00012345',
        date: '2025-10-29',
        operationType: 'Transferencia bancaria',
        vendor: {
          name: 'Tech Solutions S.A.',
          taxId: '30-71234567-8',
          address: 'Av. Corrientes 1500, CABA, Argentina'
        },
        totalAmount: 125600.50,
        currency: 'ARS',
        receiverBank: 'Banco Galicia',
        items: [
          {
            description: 'Servicio de desarrollo web',
            quantity: 40,
            unitPrice: 2500.00,
            subtotal: 100000.00
          }
        ],
        taxes: {
          iva: 24150.50,
          otherTaxes: 1450.00
        },
        paymentMethod: 'Transferencia bancaria'
      },
    ];

    const invoiceIndex = options.userId % demoInvoices.length;
    const demoData = demoInvoices[invoiceIndex];
    const processingTime = Date.now() - startTime;

    const invoiceProps: IInvoiceProps = {
      ...demoData,
      metadata: {
        processedAt: new Date().toISOString(),
        processingTimeMs: processingTime,
        confidence: 'high',
        model: '🎭 DEMO MODE',
      },
    };

    const invoice = Invoice.create(invoiceProps);

    console.log(`[OpenAIVisionProcessor] ✅ DEMO response generated in ${processingTime}ms`);

    return {
      success: true,
      invoice,
      userId: options.userId,
      messageId: options.messageId,
    };
  }

  /**
   * Create error result
   */
  private createErrorResult(error: string, userId: number, messageId: number): IProcessingResult {
    return {
      success: false,
      error,
      userId,
      messageId,
    };
  }

  /**
   * Factory method to create from environment variables
   */
  static fromEnv(): OpenAIVisionProcessor {
    const config: IOpenAIConfig = {
      apiKey: process.env.OPENAI_API_KEY || '',
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || '2000'),
      temperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0.1'),
    };

    return new OpenAIVisionProcessor(config);
  }
}

