import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // CORS 설정
  app.enableCors({
    origin: [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:5175',
      'http://localhost',
      'http://localhost:80',
      'http://frontend',
      'http://frontend:80',
      // AWS 배포 주소 추가
      'http://13.209.41.149',
      'http://ec2-13-209-41-149.ap-northeast-2.compute.amazonaws.com',
    ],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Swagger 설정
  const config = new DocumentBuilder()
    .setTitle('FastTube API')
    .setDescription('YouTube 자막 추출 API 문서')
    .setVersion('1.0')
    .addTag('subtitles')
    .addTag('video-info')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.listen(4000);
  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
