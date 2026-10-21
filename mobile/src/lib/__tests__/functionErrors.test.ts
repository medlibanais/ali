import { describeFunctionError, isNotDeployed } from '../functionErrors';
import { avatarFailure } from '../aiAvatar';

jest.mock('../supabase', () => ({ supabase: {} }));
jest.mock('../profilePhoto', () => ({
  PhotoError: class extends Error {},
  pickSquarePhoto: jest.fn(),
}));

function httpError(status: number, body: unknown) {
  const make = () => ({
    status,
    json: async () => {
      if (typeof body === 'string') throw new SyntaxError('not json');
      return body;
    },
  });
  return {
    name: 'FunctionsHttpError',
    context: { ...make(), clone: make },
  };
}

describe('describeFunctionError', () => {
  it('reads our own error code from the body', async () => {
    await expect(
      describeFunctionError(httpError(503, { error: 'not_configured' })),
    ).resolves.toEqual({ kind: 'http', status: 503, code: 'not_configured' });
  });

  it('reads the gateway code when the function is missing', async () => {
    const failure = await describeFunctionError(
      httpError(404, { code: 'NOT_FOUND', message: 'Requested function was not found' }),
    );
    expect(failure.code).toBe('NOT_FOUND');
    expect(isNotDeployed(failure, ['conversation_not_found'])).toBe(true);
  });

  it('keeps the status when the body is not JSON', async () => {
    await expect(describeFunctionError(httpError(502, '<html>'))).resolves.toEqual({
      kind: 'http',
      status: 502,
      code: null,
    });
  });

  it('treats fetch errors as network failures', async () => {
    await expect(
      describeFunctionError({ name: 'FunctionsFetchError', context: new TypeError('x') }),
    ).resolves.toEqual({ kind: 'network', status: null, code: null });
  });
});

describe('avatarFailure', () => {
  it('names the missing FAL_KEY', () => {
    const e = avatarFailure({ kind: 'http', status: 503, code: 'not_configured' });
    expect(e.code).toBe('not_configured');
    expect(e.message).toContain('FAL_KEY');
  });

  it('separates a bad provider key from a generic failure', () => {
    expect(avatarFailure({ kind: 'http', status: 502, code: 'provider_auth' }).code).toBe(
      'provider_auth',
    );
    expect(avatarFailure({ kind: 'http', status: 502, code: 'generation_failed' }).code).toBe(
      'failed',
    );
  });

  it('spots an undeployed function and an expired session', () => {
    expect(avatarFailure({ kind: 'http', status: 404, code: 'NOT_FOUND' }).code).toBe(
      'not_deployed',
    );
    expect(avatarFailure({ kind: 'http', status: 401, code: null }).code).toBe('session');
  });
});
