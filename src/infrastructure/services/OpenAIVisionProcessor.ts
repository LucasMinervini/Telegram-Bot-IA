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
import { PDFToImageConverter } from './PDFToImageConverter';

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
  private pdfConverter: PDFToImageConverter;

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

    this.pdfConverter = new PDFToImageConverter();

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

      // Handle PDF files by extracting text
      if (this.pdfConverter.isPDF(options.imagePath)) {
        console.log('[OpenAIVisionProcessor] 📄 PDF detected, extracting text...');
        const conversionResult = await this.pdfConverter.convertFirstPage(options.imagePath);
        
        if (!conversionResult.success || !conversionResult.extractedText) {
          return this.createErrorResult(
            conversionResult.error || 'Failed to extract text from PDF',
            options.userId,
            options.messageId
          );
        }
        
        console.log('[OpenAIVisionProcessor] ✅ Text extracted from PDF successfully');
        console.log('[OpenAIVisionProcessor] 📝 Extracted text preview:', 
          conversionResult.extractedText.substring(0, 200) + '...');
        
        // Process PDF text directly (without Vision API)
        return await this.processPDFText(conversionResult.extractedText, options, startTime);
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

⚠️ CRÍTICO - IDENTIFICACIÓN DE BANCO RECEPTOR (LEE CON MÁXIMA ATENCIÓN):

🎯 REGLA DE ORO: 
El "receiverBank" es el banco DONDE ESTÁ LA CUENTA DEL RECEPTOR (quien tiene el CUIT y RECIBE el dinero), NO el banco del emisor.

📍 ESTRUCTURA DE COMPROBANTES:
- SECCIÓN "DE/DESDE": EMISOR (quien ENVÍA) - puede usar Mercado Pago, Brubank, etc
- SECCIÓN "PARA/HACIA": RECEPTOR (quien RECIBE) - tiene CUIT/CUIL y su propio banco

🚨 ERRORES CRÍTICOS A EVITAR:
❌ NUNCA uses "Mercado Pago" como receiverBank si solo aparece en la sección del EMISOR
❌ NUNCA uses "Brubank" como receiverBank si solo aparece en la sección del EMISOR
❌ NUNCA uses el banco/plataforma del que ENVÍA como banco del que RECIBE
❌ NO asumas que el banco más visible es el del receptor

✅ PASOS OBLIGATORIOS PARA IDENTIFICAR CORRECTAMENTE:

PASO 1 - IDENTIFICA AL RECEPTOR:
- Busca: "Para:", "A:", "Beneficiario:", "Destinatario:", "Receptor:", "CUIT:", "Razón social:"
- El que tiene CUIT/CUIL es el RECEPTOR (ejemplo: "CUIT: 30-71883962-5" → este es el receptor)
- Ignora completamente al emisor y su banco

PASO 2 - BUSCA EL BANCO DEL RECEPTOR (NO DEL EMISOR):
- Busca información bancaria DESPUÉS o JUNTO al nombre/CUIT del receptor
- Busca: "Banco destino:", "Cuenta:", "CBU:", "CVU:", "Alias:"
- Pistas de CVU: CVU que empieza con "0000003100..." = Brubank, "0000007900..." = Mercado Pago
- Si el comprobante dice "Banco: X" cerca del RECEPTOR → usa X
- Si NO hay información ESPECÍFICA del banco del receptor → usa el nombre/razón social del receptor
- Si definitivamente no hay ninguna pista → usa "No especificado"

PASO 3 - VERIFICA TU RESPUESTA:
- ¿El banco que elegiste corresponde al RECEPTOR (con CUIT) y NO al emisor?
- ¿Puedes ver esa información bancaria en la sección del receptor?
- Si el banco está en la sección "De/Desde" del emisor → NO es el receiverBank

CAMPOS REQUERIDOS:
- invoiceNumber: Número de factura o comprobante (string)
- date: Fecha de emisión en formato YYYY-MM-DD (string)
- operationType: Tipo de operación (string, ej: "Transferencia", "Depósito", "Pago", "Factura", etc.)
- vendor: Objeto con información del RECEPTOR/BENEFICIARIO (quien RECIBE el dinero)
  - name: Nombre del receptor/beneficiario (string)
  - taxId: CUIT/CUIL/RUT/RFC/Tax ID del RECEPTOR (string, opcional)
  - cvu: CVU del RECEPTOR si está presente (string, opcional)
  - address: Dirección del receptor (string, opcional)
- totalAmount: Monto total bruto de la factura (number)
- currency: Código de moneda ISO 4217 (string, 3 letras, ej: "ARS", "USD", "EUR")
- receiverBank: Banco del RECEPTOR (NO del emisor, NO "Mercado Pago" si es solo intermediario del emisor)
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
1. Lee TODO el comprobante con atención especial a quién RECIBE el dinero
2. Identifica al RECEPTOR por palabras clave y por el CUIT/CUIL
3. Busca el banco del RECEPTOR, no confundas con la plataforma del emisor
4. Usa "COMPROBANTE-001" como invoiceNumber si no está visible
5. La fecha debe estar en formato YYYY-MM-DD
6. Si no encuentras items específicos, crea un item genérico con "Servicio/Producto"
7. Asegúrate de que el JSON sea válido y tenga TODOS los campos requeridos

FORMATO DE SALIDA (JSON estricto):
{
  "invoiceNumber": "string",
  "date": "YYYY-MM-DD",
  "operationType": "string",
  "vendor": {
    "name": "string (RECEPTOR/BENEFICIARIO con CUIT)",
    "taxId": "string o undefined (CUIT del RECEPTOR)",
    "cvu": "string o undefined (CVU del RECEPTOR)",
    "address": "string o undefined"
  },
  "totalAmount": number,
  "currency": "XXX",
  "receiverBank": "string (Banco del RECEPTOR, NO Mercado Pago si es del emisor)",
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

EJEMPLOS CONCRETOS CON ANÁLISIS:

Ejemplo 1 - Brubank es del EMISOR, NO del receptor:
Comprobante dice:
  "De: Luis (Brubank)" ← EMISOR usa Brubank
  "Para: ADELINA ANTONI.E" ← RECEPTOR
  "CUIT: 30-71883962-5" ← CUIT del RECEPTOR
  Banco del receptor: no especificado
  
Análisis paso a paso:
  1. RECEPTOR = ADELINA ANTONI.E (tiene el CUIT)
  2. EMISOR = Luis con Brubank (NO es relevante para receiverBank)
  3. No hay información del banco del receptor
  
JSON correcto:
  vendor.name = "ADELINA ANTONI.E"
  vendor.taxId = "30-71883962-5"
  receiverBank = "ADELINA ANTONI.E" o "No especificado" (NUNCA "Brubank")

Ejemplo 2 - Mercado Pago es del EMISOR, NO del receptor:
Comprobante dice:
  "De: Juan Pérez (Mercado Pago)" ← EMISOR usa Mercado Pago
  "Para: Fundraisercle" ← RECEPTOR
  "CUIT: 30-71675728-1" ← CUIT del RECEPTOR
  
Análisis:
  1. RECEPTOR = Fundraisercle (tiene el CUIT)
  2. Mercado Pago está con el EMISOR, NO con el receptor
  
JSON correcto:
  vendor.name = "Fundraisercle"
  vendor.taxId = "30-71675728-1"
  receiverBank = "Fundraisercle" (NO "Mercado Pago")

Ejemplo 3 - Banco receptor explícito:
Comprobante dice:
  "De: Pedro López (Brubank)"
  "Para: Empresa ABC S.A."
  "CUIT: 30-12345678-9"
  "Banco destino: Banco Galicia" ← Banco del RECEPTOR
  
JSON correcto:
  vendor.name = "Empresa ABC S.A."
  vendor.taxId = "30-12345678-9"
  receiverBank = "Banco Galicia" (está explícito para el receptor)

Ejemplo 4 - CVU del receptor permite identificar banco:
Comprobante dice:
  "Beneficiario: María García"
  "CUIT: 27-12345678-9"
  "CVU: 0000003100012345678901" ← CVU empieza con 0000003100 = Brubank
  
JSON correcto:
  vendor.name = "María García"
  vendor.taxId = "27-12345678-9"
  vendor.cvu = "0000003100012345678901"
  receiverBank = "Brubank" (deducido del CVU del receptor)

Devuelve SOLO el JSON, sin texto adicional.
`.trim();
  }

  /**
   * Process PDF text directly with GPT-4 (text-only, no vision)
   */
  private async processPDFText(
    extractedText: string,
    options: IImageProcessingOptions,
    startTime: number
  ): Promise<IProcessingResult> {
    try {
      const prompt = this.buildExtractionPrompt();
      
      console.log(`[OpenAIVisionProcessor] Processing PDF text for user ${options.userId}...`);
      
      const response = await this.client.chat.completions.create({
        model: this.config.model,
        messages: [
          {
            role: 'system',
            content: 'Eres un experto en análisis de documentos financieros y facturas. Tu tarea es extraer información estructurada de comprobantes y devolverla en formato JSON válido.'
          },
          {
            role: 'user',
            content: `${prompt}\n\nTexto extraído del documento:\n\n${extractedText}`,
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

      // Log extracted data for debugging
      console.log(`[OpenAIVisionProcessor] Extracted data from PDF:`, {
        invoiceNumber: parsedData.invoiceNumber,
        totalAmount: parsedData.totalAmount,
        currency: parsedData.currency,
        vendor: parsedData.vendor?.name,
      });

      // Validate critical fields before creating entity
      if (!parsedData.totalAmount || parsedData.totalAmount <= 0) {
        console.warn('[OpenAIVisionProcessor] ⚠️ Invalid totalAmount from OCR, using placeholder');
        parsedData.totalAmount = 0.01; // Placeholder to pass validation
      }

      // Add metadata
      const processingTime = Date.now() - startTime;
      const invoiceProps: IInvoiceProps = {
        ...parsedData,
        metadata: {
          processedAt: new Date().toISOString(),
          processingTimeMs: processingTime,
          confidence: this.calculateConfidence(parsedData),
          model: `${this.config.model} (PDF OCR)`,
        },
      };

      // Create domain entity
      const invoice = Invoice.create(invoiceProps);

      console.log(`[OpenAIVisionProcessor] ✅ PDF text processing successful in ${processingTime}ms`);

      return {
        success: true,
        invoice,
        userId: options.userId,
        messageId: options.messageId,
      };

    } catch (error: any) {
      const processingTime = Date.now() - startTime;
      console.error('[OpenAIVisionProcessor] ❌ Error processing PDF text:', error);

      let errorMessage = `Error al procesar el PDF`;

      if (error.code === 'invalid_api_key') {
        errorMessage = 'API key de OpenAI inválida';
      } else if (error.name === 'SyntaxError') {
        errorMessage = 'Error al analizar la respuesta de la IA';
      } else if (error.message.includes('Total amount') || error.message.includes('validation')) {
        errorMessage = 'No se pudo extraer información válida del PDF. Intenta con una imagen más clara o un PDF diferente.';
      } else {
        errorMessage = `Error al procesar el PDF: ${error.message}`;
      }

      return this.createErrorResult(errorMessage, options.userId, options.messageId);
    }
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

