import { expect, test } from '@playwright/test';

import { MockTelegramBotServer } from './mocks/MockTelegramBotServer';
import { BotPage } from './pom/BotPage';

test.describe('Telegram Bot E2E', () => {
  test('authorized user can process invoice and download excel', async ({ request }) => {
    const server = new MockTelegramBotServer({
      allowedUserIds: [1001],
    });

    const baseUrl = await server.start();

    try {
      const botPage = new BotPage(request, baseUrl, 1001, 3001);

      const startEvents = await botPage.sendCommand('/start');
      expect(startEvents.some((event) => event.text?.includes('Bienvenido'))).toBeTruthy();

      const processEvents = await botPage.sendDocument('invoice.pdf');
      expect(
        processEvents.some(
          (event) => event.type === 'edit' && event.text?.includes('Monto Bruto')
        )
      ).toBeTruthy();
      expect(
        processEvents.some(
          (event) => event.type === 'message' && event.text?.includes('Panel de Control')
        )
      ).toBeTruthy();

      const listEvents = await botPage.sendCommand('/facturas');
      expect(listEvents.some((event) => event.text?.includes('Facturas'))).toBeTruthy();

      const downloadEvents = await botPage.clickControlAction('download_excel');
      expect(downloadEvents.some((event) => event.type === 'document')).toBeTruthy();
      expect(
        downloadEvents.some(
          (event) =>
            event.type === 'message' &&
            (event.text?.includes('Sesi') || event.text?.includes('limpiada'))
        )
      ).toBeTruthy();
    } finally {
      await server.stop();
    }
  });

  test('unauthorized user is blocked by authentication middleware', async ({ request }) => {
    const server = new MockTelegramBotServer({
      allowedUserIds: [1001],
    });

    const baseUrl = await server.start();

    try {
      const botPage = new BotPage(request, baseUrl, 7777, 3777);
      const events = await botPage.sendCommand('/start');

      expect(
        events.some((event) => event.text?.includes('No tienes permiso para usar este bot'))
      ).toBeTruthy();
    } finally {
      await server.stop();
    }
  });

  test('rate limiter blocks excessive requests', async ({ request }) => {
    const server = new MockTelegramBotServer({
      allowedUserIds: [1001],
      rateLimitConfig: {
        maxRequestsPerMinute: 1,
        maxRequestsPerHour: 5,
      },
    });

    const baseUrl = await server.start();

    try {
      const botPage = new BotPage(request, baseUrl, 1001, 3001);

      const firstEvents = await botPage.sendCommand('/help');
      expect(firstEvents.some((event) => event.text?.includes('Ayuda'))).toBeTruthy();

      const secondEvents = await botPage.sendCommand('/stats');
      expect(
        secondEvents.some(
          (event) =>
            event.text?.includes('alcanzado el l') || event.text?.includes('peticiones')
        )
      ).toBeTruthy();
    } finally {
      await server.stop();
    }
  });
});
