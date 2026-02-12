import { AsyncContextService } from './async-context.service';
import { JsonLogger } from './json.logger';

describe('JsonLogger', () => {
  it('redacts sensitive keys in object logs', () => {
    const asyncContextService = new AsyncContextService();
    const logger = new JsonLogger(asyncContextService);
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    logger.log({
      event: 'provider_call',
      headers: {
        authorization: 'Bearer secret-token',
        'x-rapidapi-key': 'very-secret-key',
      },
      apiKey: 'hidden',
      payload: { normalField: 'ok' },
    });

    const line = consoleSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(line);

    expect(parsed.message.headers.authorization).toBe('[REDACTED]');
    expect(parsed.message.headers['x-rapidapi-key']).toBe('[REDACTED]');
    expect(parsed.message.apiKey).toBe('[REDACTED]');
    expect(parsed.message.payload.normalField).toBe('ok');

    consoleSpy.mockRestore();
  });
});
