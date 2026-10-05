/**
 * index.clean.ts
 * Main entry point with Clean Architecture + SOLID principles
 * This is the Composition Root - where all dependencies are wired together
 */

import 'dotenv/config';
import { container } from './infrastructure/di/DIContainer';
import { TelegramBotController } from './presentation/TelegramBotController';
import { ConsoleLogger } from './infrastructure/services/ConsoleLogger';

/**
 * Main function - Composition Root
 * Follows Dependency Inversion Principle
 */
async function main() {
  const logger = new ConsoleLogger('Main');

  // Banner
  console.info(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║     🤖 BOT DE PROCESAMIENTO DE COMPROBANTES              ║
║                                                           ║
║     Clean Architecture + SOLID Principles                ║
║     Procesamiento automático con IA                      ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);

  try {
    // Validate critical environment variables
    logger.info('🔍 Validating configuration...');

    if (!process.env.TELEGRAM_BOT_TOKEN) {
      throw new Error(
        '❌ TELEGRAM_BOT_TOKEN is not defined.\n' +
        'Please configure your .env file with the bot token.'
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      throw new Error(
        '❌ OPENAI_API_KEY is not defined.\n' +
        'Please configure your .env file with your OpenAI API key.'
      );
    }

    // Display configuration (without exposing secrets)
    logger.info('📝 Configuration:');
    logger.info(`   • Model: ${process.env.OPENAI_MODEL || 'gpt-4o-mini'}`);
    logger.info(`   • Image retention: ${process.env.IMAGE_RETENTION_HOURS || '0'} hours`);
    logger.info(`   • Max file size: ${process.env.MAX_IMAGE_SIZE_MB || '10'} MB`);
    logger.info(`   • Supported formats: ${process.env.SUPPORTED_FORMATS || 'jpg,jpeg,png,pdf'}`);
    logger.info(`   • Archives (ZIP): max ${process.env.ARCHIVE_MAX_SIZE_MB || '20'} MB, ${process.env.ARCHIVE_MAX_FILES || '30'} files`);
    logger.info(`   • Temp storage: ${process.env.TEMP_STORAGE_PATH || './temp'}`);
    logger.info(`   • Session timeout: ${process.env.SESSION_TIMEOUT_MINUTES || '30'} minutes`);
    logger.info(`   • Log level: ${process.env.LOG_LEVEL || 'info'}`);

    logger.success('✅ Configuration validated');

    // Get use cases from DI container
    logger.info('🔧 Initializing dependency injection container...');
    const processInvoiceUseCase = container.processInvoiceUseCase;
    const processArchiveUseCase = container.processArchiveUseCase;
    const generateExcelUseCase = container.generateExcelUseCase;
    const manageSessionUseCase = container.manageSessionUseCase;
    const documentIngestor = container.documentIngestor;
    const botLogger = container.logger;
    const auditLogger = container.auditLogger;
    const rateLimiter = container.rateLimiter;
    const authService = container.authService;

    // Display security configuration
    logger.info('🔐 Security Configuration:');
    const authStats = authService.getStats();
    if (authStats.isOpenMode) {
      logger.warn('   ⚠️  Authentication: OPEN MODE (all users allowed)');
      logger.warn('   💡 Set ALLOWED_USER_IDS in .env to enable whitelist');
    } else {
      logger.info(`   ✅ Authentication: WHITELIST MODE (${authStats.whitelistSize} users)`);
    }
    if (rateLimiter.isEnabled()) {
      const rateLimitConfig = rateLimiter.getConfig();
      logger.info(`   ✅ Rate Limiting: ${rateLimitConfig.maxRequestsPerMinute} req/min, ${rateLimitConfig.maxRequestsPerHour} req/hour`);
    } else {
      logger.info(`   ⚠️  Rate Limiting: DISABLED (no limits configured)`);
    }
    logger.info(`   ✅ Audit Logging: ${process.env.USE_FILE_AUDIT_LOG === 'true' ? 'FILE-BASED' : 'CONSOLE'}`);

    logger.success('✅ Dependencies injected successfully');

    // Create and launch bot with dependency injection
    logger.info('🤖 Creating bot controller...');
    const bot = new TelegramBotController(
      process.env.TELEGRAM_BOT_TOKEN,
      processInvoiceUseCase,
      generateExcelUseCase,
      manageSessionUseCase,
      documentIngestor,
      botLogger,
      auditLogger,
      rateLimiter,
      authService,
      processArchiveUseCase
    );

    logger.info('🚀 Launching bot...');
    await bot.launch();

    logger.success('✅ System initialized successfully');
    logger.info('👂 Listening for user messages...');
    logger.info('');
    logger.info('📊 Architecture:');
    logger.info('   • Domain Layer: Entities + Interfaces');
    logger.info('   • Application Layer: Use Cases');
    logger.info('   • Infrastructure Layer: Services + Repositories');
    logger.info('   • Presentation Layer: Telegram Bot Controller');
    logger.info('');
    logger.info('✨ Following SOLID principles:');
    logger.info('   • Single Responsibility Principle ✅');
    logger.info('   • Open/Closed Principle ✅');
    logger.info('   • Liskov Substitution Principle ✅');
    logger.info('   • Interface Segregation Principle ✅');
    logger.info('   • Dependency Inversion Principle ✅');

  } catch (error: unknown) {
    logger.error('❌ Fatal error during initialization:');
    if (error instanceof Error) {
      logger.error(error.message);
      if (error.stack) {
        logger.debug('Stack trace:', error.stack);
      }
    } else {
      logger.error(String(error));
    }

    logger.error('\n💡 Suggestions:');
    logger.error('   1. Verify your .env file');
    logger.error('   2. Make sure you have the correct API keys');
    logger.error('   3. Check previous logs for more details');
    
    // Cleanup container
    container.cleanup();
    
    process.exit(1);
  }
}

// Global error handlers
process.on('unhandledRejection', (reason, _promise) => {
  const logger = new ConsoleLogger('UnhandledRejection');
  logger.error('Unhandled promise rejection:', reason);
  container.cleanup();
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  const logger = new ConsoleLogger('UncaughtException');
  logger.error('Uncaught exception:', error);
  container.cleanup();
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  const logger = new ConsoleLogger('Shutdown');
  logger.info('Received SIGINT, shutting down gracefully...');
  container.cleanup();
  process.exit(0);
});

process.on('SIGTERM', () => {
  const logger = new ConsoleLogger('Shutdown');
  logger.info('Received SIGTERM, shutting down gracefully...');
  container.cleanup();
  process.exit(0);
});

// Start application
main().catch((error) => {
  console.error('Fatal error:', error);
  container.cleanup();
  process.exit(1);
});

