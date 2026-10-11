import {
  REDACTED,
  redactErrorMessage,
  redactReceipt,
} from './operator-receipt-redactor';

describe('redactReceipt()', () => {
  it('conserve les champs métier du reçu', () => {
    expect(
      redactReceipt({
        externalOrderId: 'SBX-42',
        idempotencyKey: 'a'.repeat(64),
        acceptedOdd: 1.85,
        acceptedStake: '10.00',
        currency: 'EUR',
        acceptedAt: new Date('2026-10-10T12:00:00Z'),
        receiptHash: 'b'.repeat(64),
      }),
    ).toEqual({
      externalOrderId: 'SBX-42',
      idempotencyKey: REDACTED,
      acceptedOdd: 1.85,
      acceptedStake: '10.00',
      currency: 'EUR',
      acceptedAt: '2026-10-10T12:00:00.000Z',
      receiptHash: REDACTED,
    });
  });

  it('masque les clés sensibles, à toute profondeur', () => {
    const redacted = redactReceipt({
      apiKey: 'k',
      session_token: 's',
      Authorization: 'Bearer abc',
      customer: {
        email: 'kevin@example.com',
        iban: 'FR76...',
        password: 'x',
        name: 'Kevin',
      },
      headers: [{ cookie: 'sid=1' }],
    }) as Record<string, unknown>;

    expect(redacted).toMatchObject({
      apiKey: REDACTED,
      session_token: REDACTED,
      Authorization: REDACTED,
      customer: {
        email: REDACTED,
        iban: REDACTED,
        password: REDACTED,
        name: 'Kevin',
      },
      headers: [{ cookie: REDACTED }],
    });
  });

  it.each([
    ['jeton Bearer', 'Bearer eyJhbGciOiJIUzI1NiJ9.e30.x'],
    ['JWT nu', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc'],
    ['numéro de carte', 'carte 4111111111111111'],
    ['IBAN', 'FR7630006000011234567890189'],
    ['clé longue', 'sk_live_' + 'A1b2C3d4'.repeat(6)],
    ['email', 'support: kevin@example.com'],
  ])('masque une valeur secrète sous une clé anodine : %s', (_label, value) => {
    expect(redactReceipt({ note: value })).toEqual({ note: REDACTED });
  });

  it.each([
    ['externalOrderId', 'Bearer secret-value'],
    ['idempotencyKey', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature'],
    ['reasonCode', 'support: kevin@example.com'],
  ])(
    'masque aussi une valeur secrète sous la clé métier autorisée %s',
    (key, value) => {
      expect(redactReceipt({ [key]: value })).toEqual({ [key]: REDACTED });
    },
  );

  it('borne profondeur, tableaux et chaînes ; ignore fonctions et pollution de prototype', () => {
    let deep: Record<string, unknown> = { leaf: 1 };
    for (let i = 0; i < 10; i += 1) deep = { next: deep };
    const out = JSON.stringify(redactReceipt(deep));
    expect(out).toContain(REDACTED);
    expect(out).not.toContain('leaf');

    const list = redactReceipt({
      items: Array.from({ length: 500 }, (_, i) => i),
    }) as {
      items: number[];
    };
    expect(list.items).toHaveLength(50);
    expect(
      (redactReceipt({ note: 'x'.repeat(1_000) }) as { note: string }).note
        .length,
    ).toBeLessThanOrEqual(257);

    const polluted = JSON.parse('{"__proto__": {"admin": true}, "ok": 1}');
    expect(redactReceipt(polluted)).toEqual({ ok: 1 });
    expect(redactReceipt({ fn: () => 1, n: Number.NaN })).toEqual({
      fn: null,
      n: null,
    });
  });

  it('message d’erreur : une ligne, expurgé, borné', () => {
    expect(redactErrorMessage(new Error('timeout\nafter 30s'))).toBe(
      'timeout after 30s',
    );
    expect(redactErrorMessage(new Error('401 Bearer abcdefghijklmnop'))).toBe(
      REDACTED,
    );
  });
});
