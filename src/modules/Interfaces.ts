/**
 * Interfaces.ts
 * Definiciones de tipos de datos con validación Zod
 * Garantiza integridad de datos en todo el pipeline
 */

import { z } from 'zod';

// ========================================
// SCHEMAS DE VALIDACIÓN CON ZOD
// ========================================

/**
 * Schema para información del proveedor/vendedor
 */
export const VendorSchema = z.object({
  name: z.string().min(1, 'El nombre del proveedor es requerido'),
  taxId: z.string().optional(), // CUIT, RUT, RFC, etc.
  address: z.string().optional(),
});

/**
 * Schema para items individuales del comprobante
 */
export const InvoiceItemSchema = z.object({
  description: z.string().min(1, 'Descripción del item requerida'),
  quantity: z.number().positive('La cantidad debe ser positiva'),
  unitPrice: z.number().nonnegative('El precio unitario no puede ser negativo'),
  subtotal: z.number().nonnegative('El subtotal no puede ser negativo'),
});

/**
 * Schema para información de impuestos
 */
export const TaxesSchema = z.object({
  iva: z.number().nonnegative().default(0),
  otherTaxes: z.number().nonnegative().default(0),
});

/**
 * Schema para metadata del procesamiento
 */
export const MetadataSchema = z.object({
  processedAt: z.string().datetime(),
  processingTimeMs: z.number().nonnegative(),
  confidence: z.enum(['high', 'medium', 'low']).default('medium'),
  model: z.string().optional(),
});

/**
 * Schema principal para factura/comprobante
 */
export const InvoiceSchema = z.object({
  invoiceNumber: z.string().min(1, 'Número de factura requerido'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha debe ser YYYY-MM-DD'),
  vendor: VendorSchema,
  totalAmount: z.number().positive('El monto total debe ser positivo'),
  currency: z.string().length(3, 'El código de moneda debe tener 3 caracteres (ISO 4217)').default('ARS'),
  items: z.array(InvoiceItemSchema).min(1, 'Debe haber al menos un item'),
  taxes: TaxesSchema.optional(),
  paymentMethod: z.string().optional(),
  metadata: MetadataSchema,
});

/**
 * Schema para el resultado crudo del modelo Vision
 */
export const VisionRawResultSchema = z.object({
  success: z.boolean(),
  rawData: z.any(), // Datos crudos del modelo antes de parsear
  errorMessage: z.string().optional(),
});

/**
 * Schema para resultado del procesamiento completo
 */
export const ProcessingResultSchema = z.object({
  success: z.boolean(),
  invoice: InvoiceSchema.optional(),
  error: z.string().optional(),
  userId: z.number(),
  messageId: z.number(),
});

// ========================================
// TYPES DERIVADOS DE LOS SCHEMAS
// ========================================

export type Vendor = z.infer<typeof VendorSchema>;
export type InvoiceItem = z.infer<typeof InvoiceItemSchema>;
export type Taxes = z.infer<typeof TaxesSchema>;
export type Metadata = z.infer<typeof MetadataSchema>;
export type Invoice = z.infer<typeof InvoiceSchema>;
export type VisionRawResult = z.infer<typeof VisionRawResultSchema>;
export type ProcessingResult = z.infer<typeof ProcessingResultSchema>;

// ========================================
// INTERFACES ADICIONALES (sin validación Zod)
// ========================================

/**
 * Configuración del VisionProcessor
 */
export interface VisionProcessorConfig {
  apiKey: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Configuración del DocumentIngestor
 */
export interface DocumentIngestorConfig {
  tempStoragePath: string;
  maxFileSizeMB: number;
  supportedFormats: string[];
  retentionHours: number;
}

/**
 * Opciones para procesamiento de imagen
 */
export interface ImageProcessingOptions {
  imagePath: string;
  userId: number;
  messageId: number;
  detail?: 'low' | 'high' | 'auto'; // Para GPT-4 Vision
}

/**
 * Resultado de almacenamiento temporal
 */
export interface StorageResult {
  success: boolean;
  filePath?: string;
  fileName?: string;
  error?: string;
}
