/**
 * DocumentIngestor.ts
 * Gestiona el almacenamiento temporal de imágenes de comprobantes
 * Maneja descarga desde Telegram, validación y limpieza de archivos
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import axios from 'axios';
import { DocumentIngestorConfig, StorageResult } from './Interfaces';
import { Logger } from './DataStructures';

/**
 * Clase DocumentIngestor
 * Gestiona el ciclo de vida de archivos temporales
 */
export class DocumentIngestor {
  private config: DocumentIngestorConfig;
  private logger: Logger;

  constructor(config: DocumentIngestorConfig) {
    this.config = config;
    this.logger = new Logger('DocumentIngestor');
    
    // Crear directorio temporal si no existe
    this.ensureTempDirectory();
  }

  /**
   * Asegura que el directorio temporal exista
   */
  private async ensureTempDirectory(): Promise<void> {
    try {
      await fs.ensureDir(this.config.tempStoragePath);
      this.logger.info(`Directorio temporal verificado: ${this.config.tempStoragePath}`);
    } catch (error: any) {
      this.logger.error(`Error creando directorio temporal: ${error.message}`);
    }
  }

  /**
   * Descarga un archivo desde una URL (típicamente Telegram file URL)
   * @param fileUrl URL del archivo a descargar
   * @param userId ID del usuario (para naming único)
   * @param messageId ID del mensaje (para naming único)
   * @returns Resultado del almacenamiento con path al archivo
   */
  async downloadAndStore(
    fileUrl: string,
    userId: number,
    messageId: number
  ): Promise<StorageResult> {
    try {
      // Generar nombre único para el archivo
      const timestamp = Date.now();
      const extension = this.extractExtension(fileUrl);
      const fileName = `user_${userId}_msg_${messageId}_${timestamp}${extension}`;
      const filePath = path.join(this.config.tempStoragePath, fileName);

      this.logger.info(`Descargando archivo desde: ${fileUrl.substring(0, 50)}...`);

      // Descargar archivo con axios
      const response = await axios({
        method: 'GET',
        url: fileUrl,
        responseType: 'arraybuffer',
        timeout: 30000, // 30 segundos timeout
        maxContentLength: this.config.maxFileSizeMB * 1024 * 1024,
      });

      // Validar tamaño
      const fileSizeMB = response.data.length / (1024 * 1024);
      if (fileSizeMB > this.config.maxFileSizeMB) {
        return {
          success: false,
          error: `El archivo excede el tamaño máximo permitido (${this.config.maxFileSizeMB}MB)`,
        };
      }

      // Validar formato
      const detectedExtension = this.detectFileExtension(response.data);
      if (!this.isFormatSupported(detectedExtension)) {
        return {
          success: false,
          error: `Formato de archivo no soportado. Formatos permitidos: ${this.config.supportedFormats.join(', ')}`,
        };
      }

      // Guardar archivo
      await fs.writeFile(filePath, response.data);

      this.logger.success(`Archivo almacenado: ${fileName} (${fileSizeMB.toFixed(2)}MB)`);

      // Programar limpieza si retentionHours > 0
      if (this.config.retentionHours > 0) {
        this.scheduleCleanup(filePath, this.config.retentionHours);
      }

      return {
        success: true,
        filePath,
        fileName,
      };

    } catch (error: any) {
      this.logger.error('Error descargando archivo:', error.message);

      if (error.code === 'ECONNABORTED') {
        return {
          success: false,
          error: 'Timeout descargando el archivo. El archivo puede ser muy grande.',
        };
      }

      return {
        success: false,
        error: `Error descargando archivo: ${error.message}`,
      };
    }
  }

  /**
   * Guarda un buffer directamente (para casos donde ya tenemos los datos)
   * @param buffer Buffer con los datos del archivo
   * @param userId ID del usuario
   * @param messageId ID del mensaje
   * @param extension Extensión del archivo (ej: '.jpg')
   * @returns Resultado del almacenamiento
   */
  async storeBuffer(
    buffer: Buffer,
    userId: number,
    messageId: number,
    extension: string
  ): Promise<StorageResult> {
    try {
      // Validar tamaño
      const fileSizeMB = buffer.length / (1024 * 1024);
      if (fileSizeMB > this.config.maxFileSizeMB) {
        return {
          success: false,
          error: `El archivo excede el tamaño máximo permitido (${this.config.maxFileSizeMB}MB)`,
        };
      }

      // Validar formato
      if (!this.isFormatSupported(extension)) {
        return {
          success: false,
          error: `Formato de archivo no soportado. Formatos permitidos: ${this.config.supportedFormats.join(', ')}`,
        };
      }

      // Generar nombre y path
      const timestamp = Date.now();
      const fileName = `user_${userId}_msg_${messageId}_${timestamp}${extension}`;
      const filePath = path.join(this.config.tempStoragePath, fileName);

      // Guardar archivo
      await fs.writeFile(filePath, buffer);

      this.logger.success(`Buffer almacenado: ${fileName} (${fileSizeMB.toFixed(2)}MB)`);

      // Programar limpieza si retentionHours > 0
      if (this.config.retentionHours > 0) {
        this.scheduleCleanup(filePath, this.config.retentionHours);
      }

      return {
        success: true,
        filePath,
        fileName,
      };

    } catch (error: any) {
      this.logger.error('Error almacenando buffer:', error.message);
      return {
        success: false,
        error: `Error almacenando archivo: ${error.message}`,
      };
    }
  }

  /**
   * Elimina un archivo temporal
   * @param filePath Path al archivo a eliminar
   */
  async deleteFile(filePath: string): Promise<void> {
    try {
      if (await fs.pathExists(filePath)) {
        await fs.remove(filePath);
        this.logger.info(`Archivo eliminado: ${path.basename(filePath)}`);
      }
    } catch (error: any) {
      this.logger.error(`Error eliminando archivo ${filePath}: ${error.message}`);
    }
  }

  /**
   * Limpia archivos antiguos del directorio temporal
   * @param maxAgeHours Edad máxima en horas
   */
  async cleanOldFiles(maxAgeHours: number): Promise<void> {
    try {
      const files = await fs.readdir(this.config.tempStoragePath);
      const now = Date.now();
      const maxAgeMs = maxAgeHours * 60 * 60 * 1000;

      let deletedCount = 0;

      for (const file of files) {
        const filePath = path.join(this.config.tempStoragePath, file);
        const stats = await fs.stat(filePath);
        const fileAgeMs = now - stats.mtimeMs;

        if (fileAgeMs > maxAgeMs) {
          await fs.remove(filePath);
          deletedCount++;
        }
      }

      if (deletedCount > 0) {
        this.logger.info(`Limpieza completada: ${deletedCount} archivos eliminados`);
      }

    } catch (error: any) {
      this.logger.error(`Error en limpieza de archivos: ${error.message}`);
    }
  }

  /**
   * Programa la eliminación de un archivo después de X horas
   * @param filePath Path al archivo
   * @param hours Horas hasta la eliminación
   */
  private scheduleCleanup(filePath: string, hours: number): void {
    const delayMs = hours * 60 * 60 * 1000;
    
    setTimeout(async () => {
      await this.deleteFile(filePath);
    }, delayMs);

    this.logger.debug(`Limpieza programada para ${path.basename(filePath)} en ${hours} horas`);
  }

  /**
   * Extrae la extensión de una URL
   * @param url URL del archivo
   * @returns Extensión con punto (ej: '.jpg')
   */
  private extractExtension(url: string): string {
    const match = url.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
    if (match) {
      return `.${match[1].toLowerCase()}`;
    }
    return '.jpg'; // Default
  }

  /**
   * Detecta la extensión de un archivo por sus magic bytes
   * @param buffer Buffer del archivo
   * @returns Extensión detectada
   */
  private detectFileExtension(buffer: Buffer): string {
    if (!buffer || buffer.length < 4) return '';

    // Magic bytes para diferentes formatos
    const signatures: Record<string, number[][]> = {
      // Imágenes
      '.jpg': [[0xFF, 0xD8, 0xFF]],
      '.jpeg': [[0xFF, 0xD8, 0xFF]],
      '.png': [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]],
      '.gif': [[0x47, 0x49, 0x46, 0x38]], // GIF8
      '.webp': [[0x52, 0x49, 0x46, 0x46]], // RIFF
      '.bmp': [[0x42, 0x4D]], // BM
      '.tiff': [[0x49, 0x49, 0x2A, 0x00], [0x4D, 0x4D, 0x00, 0x2A]], // II* o MM*
      '.ico': [[0x00, 0x00, 0x01, 0x00]],
      
      // Documentos
      '.pdf': [[0x25, 0x50, 0x44, 0x46]], // %PDF
      '.docx': [[0x50, 0x4B, 0x03, 0x04]], // PK (ZIP-based Office)
      '.xlsx': [[0x50, 0x4B, 0x03, 0x04]], // PK (ZIP-based Office)
      '.pptx': [[0x50, 0x4B, 0x03, 0x04]], // PK (ZIP-based Office)
      '.doc': [[0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]], // OLE (Office antiguo)
      '.xls': [[0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]], // OLE
      '.ppt': [[0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]], // OLE
      
      // Otros
      '.zip': [[0x50, 0x4B, 0x03, 0x04], [0x50, 0x4B, 0x05, 0x06]], // PK
      '.rar': [[0x52, 0x61, 0x72, 0x21]], // Rar!
      '.7z': [[0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C]], // 7z
    };

    for (const [ext, sigs] of Object.entries(signatures)) {
      for (const sig of sigs) {
        if (this.matchesSignature(buffer, sig)) {
          return ext;
        }
      }
    }

    return '';
  }

  /**
   * Verifica si un buffer coincide con una firma de bytes
   * @param buffer Buffer a verificar
   * @param signature Firma de bytes
   * @returns true si coincide
   */
  private matchesSignature(buffer: Buffer, signature: number[]): boolean {
    for (let i = 0; i < signature.length; i++) {
      if (buffer[i] !== signature[i]) {
        return false;
      }
    }
    return true;
  }

  /**
   * Verifica si un formato está soportado
   * @param extension Extensión del archivo (con o sin punto)
   * @returns true si está soportado
   */
  private isFormatSupported(extension: string): boolean {
    const ext = extension.toLowerCase().replace('.', '');
    return this.config.supportedFormats.includes(ext);
  }

  /**
   * Obtiene estadísticas del storage
   * @returns Objeto con estadísticas
   */
  async getStorageStats(): Promise<{
    totalFiles: number;
    totalSizeMB: number;
    oldestFileAgeHours: number;
  }> {
    try {
      const files = await fs.readdir(this.config.tempStoragePath);
      let totalSize = 0;
      let oldestTime = Date.now();

      for (const file of files) {
        const filePath = path.join(this.config.tempStoragePath, file);
        const stats = await fs.stat(filePath);
        totalSize += stats.size;
        oldestTime = Math.min(oldestTime, stats.mtimeMs);
      }

      const oldestAgeHours = (Date.now() - oldestTime) / (1000 * 60 * 60);

      return {
        totalFiles: files.length,
        totalSizeMB: totalSize / (1024 * 1024),
        oldestFileAgeHours: oldestAgeHours,
      };

    } catch (error) {
      return {
        totalFiles: 0,
        totalSizeMB: 0,
        oldestFileAgeHours: 0,
      };
    }
  }

  /**
   * Método estático para crear instancia desde variables de entorno
   * @returns Instancia configurada de DocumentIngestor
   */
  static fromEnv(): DocumentIngestor {
    const config: DocumentIngestorConfig = {
      tempStoragePath: process.env.TEMP_STORAGE_PATH || './temp',
      maxFileSizeMB: parseInt(process.env.MAX_IMAGE_SIZE_MB || '10'),
      supportedFormats: (process.env.SUPPORTED_FORMATS || 'jpg,jpeg,png,gif,webp,bmp,tiff,pdf,docx,doc,xlsx,xls,pptx,ppt').split(','),
      retentionHours: parseInt(process.env.IMAGE_RETENTION_HOURS || '0'),
    };

    return new DocumentIngestor(config);
  }
}
