import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src/index';

// For now, you'll need to do something like this to get a correctly-typed
// `Request` to pass to `worker.fetch()`.
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe('game manual RAG worker', () => {
	it('serves the chat page at / (unit style)', async () => {
		const request = new IncomingRequest('http://example.com/');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toContain('text/html');
		expect(await response.text()).toContain('2026 Game Manual');
	});

	it('serves the chat page at / (integration style)', async () => {
		const response = await SELF.fetch('https://example.com/');
		expect(response.status).toBe(200);
		expect(await response.text()).toContain('2026 Game Manual');
	});

	it('returns 404 JSON for unknown routes', async () => {
		const response = await SELF.fetch('https://example.com/nope');
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ error: 'Not found.' });
	});

	it('rejects GET on /api/ask', async () => {
		const response = await SELF.fetch('https://example.com/api/ask');
		expect(response.status).toBe(405);
	});

	it('rejects /api/ask without a question', async () => {
		const response = await SELF.fetch('https://example.com/api/ask', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({}),
		});
		expect(response.status).toBe(400);
		const body = (await response.json()) as { error: string };
		expect(body.error).toContain('question');
	});

	it('rejects /api/ask with a non-JSON body', async () => {
		const response = await SELF.fetch('https://example.com/api/ask', {
			method: 'POST',
			body: 'not json',
		});
		expect(response.status).toBe(400);
	});
});
