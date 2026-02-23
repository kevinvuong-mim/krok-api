import { Test, TestingModule } from '@nestjs/testing';

import { AppService } from '@/app.service';
import { AppController } from '@/app.controller';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!" (raw controller response)', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });

    it('should return string type', () => {
      const result = appController.getHello();

      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });
  });
});
