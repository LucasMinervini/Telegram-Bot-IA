INSTRUCCIONES PARA EL DESARROLLO CON IA

- Escribir codigo siempre en ingles
- Seguir principios SOLID en todos los archivos
- Usar Clean Architecture (domain, application, infrastructure, presentation)
- Toda nueva funcionalidad debe usar Dependency Injection
- No modificar código legacy en /modules (mantener compatibilidad)

ARQUITECTURA:
✅ Clean Architecture + SOLID implementados
- Domain Layer: src/domain/ (entidades e interfaces)
- Application Layer: src/application/ (casos de uso)
- Infrastructure Layer: src/infrastructure/ (implementaciones)
- Presentation Layer: src/presentation/ (controladores)

COMANDOS:
- Desarrollo Clean: npm run dev:clean
- Desarrollo Legacy: npm run dev
- Build: npm run build:clean

CIBERSEGURIDAD:
Objetivo: Implementar medidas de seguridad esenciales para proteger la confidencialidad de la información crítica (facturas, credenciales de API) y garantizar la disponibilidad del servicio, siguiendo los pilares de la tríada CIA.

Foco 1: Gestión Segura de Credenciales y Secretos (Confidencialidad y Seguridad de Aplicaciones)
El robo y abuso de credenciales es uno de los puntos de entrada más comunes para ataques. La OPENAI_API_KEY y el TELEGRAM_BOT_TOKEN son activos críticos.
Tarea de Seguridad
Archivo/Módulo Afectado
Justificación de Ciberseguridad
A. Secret Protection & Escaneo
.env, Repositorio Git
Principio: Evitar el robo y abuso de credenciales. Implementar Secret Protection (como el ofrecido por GitHub Advanced Security) para detener fugas de secretos antes de que sean visibles en el historial de Git.
B. Uso de Gestores de Secretos
Configuración de Deployment
En lugar de depender únicamente de .env en producción, configurar variables de entorno directamente en plataformas de deployment (Railway, AWS). Esto mitiga el riesgo de vulnerabilidades de configuración y fugas accidentales.
C. Seguridad en la IA
VisionProcessor.ts, Prompts
Mitigar la Inyección de Prompts. Refinar el prompt engineering para que GPT-4 Vision minimice el riesgo de filtrar datos o ser manipulado maliciosamente para compartir información confidencial.

Foco 2: Control de Acceso y Autenticación (Confidencialidad y No Repudio)
La información manejada (facturas, IDs de impuestos) es altamente sensible. El acceso debe restringirse a usuarios autorizados.
Tarea de Seguridad
Archivo/Módulo Afectado
Justificación de Ciberseguridad
D. Implementación de Autenticación
TelegramBot.ts, SessionManager.ts
Principio: Confidencialidad. Implementar la mejora opcional "Agregar autenticación de usuarios". Solo los usuarios verificados deben poder ejecutar comandos críticos (/facturas, /limpiar) y enviar comprobantes.
E. No Repudio (Logging Detallado)
DataStructures.ts (Logger)
Principio: No Repudio. Extender el módulo Logger para registrar de forma inmutable todas las acciones sensibles (ej. quién subió qué archivo, cuándo se descargó el Excel, quién ejecutó /limpiar). Esto es crucial para la seguridad de la información y las auditorías.
F. Mínimo Privilegio
Configuración de Bot
Aplicar la ley del mínimo privilegio. Asegurar que el token del bot solo tenga los permisos estrictamente necesarios para sus funciones (recibir mensajes/archivos y enviar mensajes/archivos de Excel).

Foco 3: Resistencia al Abuso y Disponibilidad (Rate Limiting y Sanitización)
Proteger los recursos del sistema y evitar costos excesivos de API de terceros, que afectarían la Disponibilidad.
Tarea de Seguridad
Archivo/Módulo Afectado
Justificación de Ciberseguridad
G. Rate Limiting por Usuario
TelegramBot.ts, SessionManager.ts
Principio: Disponibilidad. Implementar la mejora opcional "Agregar rate limiting por usuario". Limitar el número de peticiones por usuario en un período de tiempo para prevenir ataques de DDoS o abusos que agoten los recursos de cómputo y los costos de la API de GPT-4.
H. Gestión Efímera de Datos
DocumentIngestor.ts, temp/
Configurar IMAGE_RETENTION_HOURS=0. La eliminación automática de archivos debe ser inmediata para proteger la Confidencialidad de la información financiera sensible (facturas) una vez procesada. Esto previene que un atacante acceda a la información a través de la infraestructura comprometida.
I. Sanitización y Validación de Input
DocumentIngestor.ts, Interfaces.ts
Validar estrictamente los límites de tamaño de archivo y los formatos soportados mediante análisis de magic bytes. Esto mitiga ataques de sobrecarga o inyección de código malicioso a través de archivos de gran tamaño. Usar Zod schemas es una excelente práctica de seguridad de aplicaciones para validar los datos extraídos