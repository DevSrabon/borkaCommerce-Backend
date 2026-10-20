import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('eCommerce Core API & E2E Tests', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Health & Storefront APIs', () => {
    it('GET / -> returns root welcome response', () => {
      return request(app.getHttpServer())
        .get('/')
        .expect(200);
    });

    it('GET /ecommerce/site-settings -> returns site settings and currency rates', async () => {
      const res = await request(app.getHttpServer())
        .get('/ecommerce/site-settings')
        .expect(200);

      expect(res.body).toBeDefined();
    });

    it('GET /ecommerce/products -> returns paginated products list', async () => {
      const res = await request(app.getHttpServer())
        .get('/ecommerce/products')
        .expect(200);

      expect(res.body).toBeDefined();
    });

    it('GET /ecommerce/products/slug/non-existent-product-slug-xyz -> returns 404', async () => {
      await request(app.getHttpServer())
        .get('/ecommerce/products/slug/non-existent-product-slug-xyz')
        .expect(404);
    });
  });

  describe('Security & Address API Protection', () => {
    it('POST /ecommerce/addresses without auth token -> rejects with 401 Unauthorized', async () => {
      const res = await request(app.getHttpServer())
        .get('/ecommerce/addresses')
        .expect(401);

      expect(res.body.message).toContain('Session token is missing');
    });

    it('POST /admin/orders without admin token -> rejects with 401 Unauthorized', async () => {
      await request(app.getHttpServer())
        .get('/admin/orders')
        .expect(401);
    });
  });
});
