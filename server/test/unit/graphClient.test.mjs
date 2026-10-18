/**
 * Unit tests: graphClient safety properties (no database, no credentials, no
 * environment required — all inputs are synthesized in-process).
 *
 * Covers: credential resolution errors that never echo secret values, the
 * parameterization guard, query-option building, the safety of error paths in
 * `connectFromEnv`, and the redacted diagnostics view.
 */

import { describe, expect, it } from 'vitest';
import {
  CredentialsError,
  ParameterizationError,
  assertParameterized,
  buildQueryOptions,
  connectFromEnv,
  redactedEnvironmentView,
  resolveCredentials,
} from '../../graphClient.mjs';
import { DEMO_GRAPH_NAME } from '../../contract.mjs';

const SECRET = 'correct-horse-battery-staple-SHOULD-NEVER-APPEAR-IN-ERRORS';

/** @param {() => unknown} fn */
function expectCredentialsError(fn) {
  try {
    fn();
    expect.unreachable('expected CredentialsError to be thrown');
  } catch (err) {
    expect(err).toBeInstanceOf(CredentialsError);
    return /** @type {CredentialsError} */ (err);
  }
  throw new Error('unreachable');
}

describe('resolveCredentials — fails closed, never echoes values', () => {
  it('rejects a missing password, naming the variable only', () => {
    const err = expectCredentialsError(() => resolveCredentials({ FALKORDB_HOST: 'host.example' }));
    expect(err.message).toContain('FALKORDB_PASSWORD');
    expect(err.message).not.toContain(SECRET);
  });

  it('rejects a missing host/url, naming the variable only', () => {
    const err = expectCredentialsError(() => resolveCredentials({
      FALKORDB_PASSWORD: SECRET,
    }));
    expect(err.message).toMatch(/FALKORDB_HOST|FALKORDB_URL/);
    expect(err.message).not.toContain(SECRET);
  });

  it('accepts discrete env vars and applies documented defaults', () => {
    const creds = resolveCredentials({
      FALKORDB_HOST: 'host.example',
      FALKORDB_PORT: '55370',
      FALKORDB_PASSWORD: SECRET,
    });
    expect(creds).toEqual({
      host: 'host.example',
      port: 55370,
      username: 'falkordb',
      password: SECRET,
      source: 'env',
    });
  });

  it('accepts a password with no port (default 6379 is a passive error later, not here — but port is optional)', () => {
    const creds = resolveCredentials({ FALKORDB_HOST: 'host.example', FALKORDB_PASSWORD: SECRET });
    expect(creds.port).toBe(6379);
  });

  it('rejects invalid port values without echoing their raw text in secrets (port is not secret but check the message is sane)', () => {
    for (const badPort of ['abc', '0', '70000', '-1']) {
      expectCredentialsError(() =>
        resolveCredentials({ FALKORDB_HOST: 'host.example', FALKORDB_PORT: badPort, FALKORDB_PASSWORD: SECRET }));
    }
  });

  it('falls back to FALKORDB_URL parsing (redis://user:pass@host:port), decoding URL components', () => {
    const creds = resolveCredentials({
      FALKORDB_URL: `redis://svc%40app:${encodeURIComponent('p a s s')}@host.example:55370/`,
    });
    expect(creds.host).toBe('host.example');
    expect(creds.port).toBe(55370);
    expect(creds.username).toBe('svc@app');
    expect(creds.password).toBe('p a s s');
    expect(creds.source).toBe('url');
  });

  it('rejects a URL without a password component', () => {
    expectCredentialsError(() => resolveCredentials({ FALKORDB_URL: 'redis://host.example:55370/' }));
  });

  it('rejects a malformed URL', () => {
    expectCredentialsError(() => resolveCredentials({ FALKORDB_URL: '%%not a url', FALKORDB_PASSWORD: SECRET }));
  });
});

describe('assertParameterized — quoted string literals are a hard error', () => {
  it('accepts well-parameterized Cypher (labels/types unquoted, values via $params)', () => {
    expect(() => assertParameterized('MATCH (p:Publication) WHERE p.id = $id RETURN p', { id: 'x' })).not.toThrow();
    expect(() => assertParameterized('UNWIND $rows AS row CREATE (n:ResearchDocument) SET n = row', { rows: [] })).not.toThrow();
    expect(() => assertParameterized('MATCH (n) WHERE n.seeded = $seeded DETACH DELETE n', { seeded: true })).not.toThrow();
    expect(() => assertParameterized('CREATE (n)-[r:MENTIONS_HISTORICALLY]->(m)')).not.toThrow();
    expect(() => assertParameterized('MATCH (n:`Quoted Ident`) RETURN n')).not.toThrow(); // identifiers may be quoted
  });

  it('rejects single- and double-quoted literals anywhere in the query', () => {
    expect(() => assertParameterized("MATCH (n) WHERE n.a = 'oops' RETURN n")).toThrow(/quoted string literal/);
    expect(() => assertParameterized('MATCH (n) WHERE n.a = "oops" RETURN n')).toThrow(ParameterizationError);
    expect(() => assertParameterized("SET n.note = 'static text'") ).toThrow(ParameterizationError);
  });

  it('rejects cypher that is not a non-empty string', () => {
    // @ts-expect-error deliberate misuse
    expect(() => assertParameterized('')).toThrow(/non-empty string/);
    // @ts-expect-error deliberate misuse
    expect(() => assertParameterized(null)).toThrow(ParameterizationError);
  });

  it('rejects non-object params bags (arrays/scalars) so misuse cannot sneak unkeyed values', () => {
    // @ts-expect-error deliberate misuse
    expect(() => assertParameterized('MATCH (n) WHERE n.a = $x', ['oops'])).toThrow(/plain object/);
    // @ts-expect-error deliberate misuse
    expect(() => assertParameterized('MATCH (n) WHERE n.a = $x', 'oops')).toThrow(/plain object/);
    expect(() => assertParameterized('MATCH (n) RETURN n')).not.toThrow(); // no params is fine
  });
});

describe('buildQueryOptions — timeout policy is explicit', () => {
  it('maps params + default timeout', () => {
    expect(buildQueryOptions({ id: 'claim-A' })).toEqual({ params: { id: 'claim-A' }, TIMEOUT: 20_000 });
  });

  it('omits empty params entirely and honors custom timeouts', () => {
    expect(buildQueryOptions({})).toEqual({ TIMEOUT: 20_000 });
    expect(buildQueryOptions({ seeded: true }, 60_000)).toEqual({ params: { seeded: true }, TIMEOUT: 60_000 });
  });
});

describe('connectFromEnv — failure path leaks no values', () => {
  it('fails with CredentialsError (no network) when env is empty', async () => {
    await expect(
      connectFromEnv({
        env: {},
        connectTimeoutMs: 250,
      }),
    ).rejects.toThrow(CredentialsError);
  });

  it('error messages never contain the password value (credential path AND connection-failure path)', async () => {
    // Credential path: no host at all → immediate CredentialsError naming variables only.
    /** @type {unknown} */
    let caught;
    try {
      await connectFromEnv({ env: { FALKORDB_PASSWORD: SECRET } });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CredentialsError);
    expect(/** @type {Error} */ (caught).message).not.toContain(SECRET);

    // Connection-failure path: otherwise-valid env against a non-routable
    // loopback port (instant ECONNREFUSED, no external traffic). The wrapper
    // must fold the raw client error into ConnectionError without echoing the password.
    /** @type {unknown} */
    let connectCause;
    try {
      await connectFromEnv({
        env: { FALKORDB_HOST: '127.0.0.1', FALKORDB_PORT: '1', FALKORDB_PASSWORD: SECRET },
        connectTimeoutMs: 1000,
      });
    } catch (err) {
      connectCause = err;
    }
    expect(connectCause).toBeInstanceOf(Error);
    expect(/** @type {Error} */ (connectCause).name).toBe('ConnectionError');
    expect(/** @type {Error} */ (connectCause).message).not.toContain(SECRET);
    expect(String(/** @type {Error} */ (connectCause).message)).toMatch(/Could not connect to the FalkorDB instance/);
  });
});

describe('graph client hygiene', () => {
  it('defaults to the managed demo graph name', () => {
    expect(DEMO_GRAPH_NAME).toBe('aftershock:demo');
  });

  it('redactedEnvironmentView carries placeholders only', () => {
    const view = redactedEnvironmentView();
    expect(view).toEqual({
      FALKORDB_HOST: '[redacted]',
      FALKORDB_PORT: 0,
      FALKORDB_USER: '[redacted]',
      FALKORDB_PASSWORD: '[redacted]',
      FALKORDB_URL: 'redis://[redacted]@[redacted]:0',
    });
    expect(Object.isFrozen(view)).toBe(true);
  });
});
