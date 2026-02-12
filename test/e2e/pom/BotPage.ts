import type { APIRequestContext } from '@playwright/test';

import type { BotEvent, UpdateResponse } from '../mocks/MockTelegramBotServer';

interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
}

interface TelegramChat {
  id: number;
  type: 'private';
}

export class BotPage {
  constructor(
    private readonly request: APIRequestContext,
    private readonly baseUrl: string,
    private readonly userId: number,
    private readonly chatId: number
  ) {}

  async sendCommand(command: string): Promise<BotEvent[]> {
    const update = {
      update_id: Date.now(),
      message: {
        message_id: Math.floor(Math.random() * 100000),
        date: Math.floor(Date.now() / 1000),
        chat: this.chat(),
        from: this.user(),
        text: command,
        entities: [
          {
            offset: 0,
            length: command.length,
            type: 'bot_command',
          },
        ],
      },
    };

    return this.sendUpdate(update);
  }

  async sendDocument(fileName = 'invoice.pdf', size = 1024): Promise<BotEvent[]> {
    const update = {
      update_id: Date.now(),
      message: {
        message_id: Math.floor(Math.random() * 100000),
        date: Math.floor(Date.now() / 1000),
        chat: this.chat(),
        from: this.user(),
        document: {
          file_id: `doc-${Date.now()}`,
          file_unique_id: `doc-unique-${Date.now()}`,
          file_name: fileName,
          mime_type: 'application/pdf',
          file_size: size,
        },
      },
    };

    return this.sendUpdate(update);
  }

  async clickControlAction(action: 'download_excel' | 'clear_session' | 'show_summary'): Promise<BotEvent[]> {
    const update = {
      update_id: Date.now(),
      callback_query: {
        id: `cbq-${Date.now()}`,
        from: this.user(),
        chat_instance: `${Date.now()}`,
        data: action,
        message: {
          message_id: Math.floor(Math.random() * 100000),
          date: Math.floor(Date.now() / 1000),
          chat: this.chat(),
        },
      },
    };

    return this.sendUpdate(update);
  }

  private async sendUpdate(update: Record<string, unknown>): Promise<BotEvent[]> {
    const response = await this.request.post(`${this.baseUrl}/telegram/update`, {
      data: update,
    });

    if (!response.ok()) {
      const errorBody = await response.text();
      throw new Error(
        `Update request failed with status ${response.status()} and body ${errorBody}`
      );
    }

    const body = (await response.json()) as UpdateResponse;
    return body.events;
  }

  private user(): TelegramUser {
    return {
      id: this.userId,
      is_bot: false,
      first_name: 'Test User',
    };
  }

  private chat(): TelegramChat {
    return {
      id: this.chatId,
      type: 'private',
    };
  }
}
