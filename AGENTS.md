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
- Implementar rate limiting por usuario
- Validar tipos de archivo con magic bytes
- Lista blanca de user IDs permitidos
- Logging seguro sin datos sensibles
- Validación de todas las variables de entorno requeridas