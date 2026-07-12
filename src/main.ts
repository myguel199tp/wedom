import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix("api");

  // Habilita CORS solo para los orígenes permitidos (evita reflejar cualquier
  // sitio con credentials). Se configura vía CORS_ORIGINS (lista separada por
  // comas) y, por defecto, el FRONTEND_URL.
  const configuredOrigins = (
    process.env.CORS_ORIGINS ??
    process.env.FRONTEND_URL ??
    "http://localhost:3001"
  )
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: configuredOrigins,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle("MiniWallet API")
    .setDescription("Servicio de transferencias de saldo entre usuarios")
    .setVersion("1.0")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("api/docs", app, document);

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  new Logger("Bootstrap").log(
    `MiniWallet arriba en http://localhost:${port}/api (docs: /api/docs)`,
  );
}
bootstrap();
