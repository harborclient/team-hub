import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerJoinRoute } from '#/server/routes/join.js';

describe('GET /join', () => {
  it('returns themed HTML with invitation details from the query string', async () => {
    const app = Fastify();
    await registerJoinRoute(app);

    const response = await app.inject({
      method: 'GET',
      url: '/join?url=https%3A%2F%2Fteamhub.example.com&name=Alice&role=user&exp=2099-01-01T00%3A00%3A00.000Z&hub=Acme&access=Collections%3A%20all'
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toContain('Join Acme');
    expect(response.body).toContain('Alice');
    expect(response.body).toContain('Collections: all');
    expect(response.body).toContain('Open in HarborClient');

    await app.close();
  });

  it('escapes untrusted query values before rendering HTML', async () => {
    const app = Fastify();
    await registerJoinRoute(app);

    const response = await app.inject({
      method: 'GET',
      url: '/join?url=https%3A%2F%2Fteamhub.example.com&name=%3Cscript%3E&role=user&exp=2099-01-01T00%3A00%3A00.000Z'
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('&lt;script&gt;');
    expect(response.body).not.toMatch(/Invited as<\/span><span><script>/);

    await app.close();
  });

  it('returns an invalid invite page when required query fields are missing', async () => {
    const app = Fastify();
    await registerJoinRoute(app);

    const response = await app.inject({
      method: 'GET',
      url: '/join?name=Alice'
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Invalid invite link');

    await app.close();
  });

  it('marks expired invitations and disables the launch button', async () => {
    const app = Fastify();
    await registerJoinRoute(app);

    const response = await app.inject({
      method: 'GET',
      url: '/join?url=https%3A%2F%2Fteamhub.example.com&name=Alice&role=user&exp=2000-01-01T00%3A00%3A00.000Z&hub=Acme'
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('This invitation has expired');
    expect(response.body).toContain('id="join-button"');
    expect(response.body).toContain('disabled');

    await app.close();
  });
});
