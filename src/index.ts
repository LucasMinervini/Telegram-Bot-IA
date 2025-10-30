/**
 * index.ts
 * Punto de entrada principal de la aplicación
 * Inicializa y arranca el bot de procesamiento de comprobantes
 */

import 'dotenv/config';
import { TelegramBot } from './modules/TelegramBot';
import { Logger } from './modules/DataStructures';

/**
 * Función principal de inicialización
 */
async function main() {
  const logger = new Logger('Main');

  // Banner de inicio
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║     🤖 BOT DE PROCESAMIENTO DE COMPROBANTES              ║
║                                                           ║
║     Procesamiento automático con IA                      ║
║     Opción A: Multimodal (GPT-4 Vision)                  ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);

  try {
    // Validar variables de entorno críticas
    logger.info('🔍 Validando configuración...');

    if (!process.env.TELEGRAM_BOT_TOKEN) {
      throw new Error(
        '❌ TELEGRAM_BOT_TOKEN no está definida.\n' +
        'Por favor, configura tu archivo .env con el token del bot.'
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      throw new Error(
        '❌ OPENAI_API_KEY no está definida.\n' +
        'Por favor, configura tu archivo .env con tu API key de OpenAI.'
      );
    }

    // Mostrar configuración (sin exponer secrets)
    logger.info('📝 Configuración:');
    logger.info(`   • Modelo: ${process.env.OPENAI_MODEL || 'gpt-4o-mini'}`);
    logger.info(`   • Retención de imágenes: ${process.env.IMAGE_RETENTION_HOURS || '0'} horas`);
    logger.info(`   • Tamaño máximo: ${process.env.MAX_IMAGE_SIZE_MB || '10'} MB`);
    logger.info(`   • Formatos soportados: ${process.env.SUPPORTED_FORMATS || 'jpg,jpeg,png,pdf'}`);
    logger.info(`   • Storage temporal: ${process.env.TEMP_STORAGE_PATH || './temp'}`);
    logger.info(`   • Log level: ${process.env.LOG_LEVEL || 'info'}`);

    logger.success('✅ Configuración validada');

    // Crear e iniciar el bot
    logger.info('🤖 Creando instancia del bot...');
    const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);

    logger.info('🚀 Iniciando bot...');
    await bot.launch();

    logger.success('✅ Sistema inicializado correctamente');
    logger.info('👂 Esperando mensajes de usuarios...');

  } catch (error: any) {
    logger.error('❌ Error fatal durante la inicialización:');
    logger.error(error.message);
    
    if (error.stack) {
      logger.debug('Stack trace:', error.stack);
    }

    logger.error('\n💡 Sugerencias:');
    logger.error('   1. Verifica tu archivo .env');
    logger.error('   2. Asegúrate de tener las API keys correctas');
    logger.error('   3. Revisa los logs anteriores para más detalles');
    
    process.exit(1);
  }
}

// Manejo de errores no capturados
process.on('unhandledRejection', (reason, promise) => {
  const logger = new Logger('UnhandledRejection');
  logger.error('Promise no manejada:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  const logger = new Logger('UncaughtException');
  logger.error('Excepción no capturada:', error);
  process.exit(1);
});

// Iniciar aplicación
main().catch((error) => {
  console.error('Error fatal:', error);
  process.exit(1);
});
