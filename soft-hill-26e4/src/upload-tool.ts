/**
 * Dev-only utility for loading documents into the AI Search instance.
 * Never deployed — run locally against the real binding with:
 *
 *   npx wrangler dev src/upload-tool.ts
 *
 * then PUT each file:
 *
 *   curl -X PUT --data-binary @file.pdf "http://localhost:8787/upload?name=file.pdf"
 *
 * Useful again when a new season's manual needs to be indexed.
 */

export default {
	async fetch(request, env, _ctx): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname !== '/upload' || request.method !== 'PUT') {
			return new Response('PUT /upload?name=<filename> with the file as the request body.\n', { status: 404 });
		}

		const name = url.searchParams.get('name');
		if (!name) {
			return new Response("Missing 'name' query parameter.\n", { status: 400 });
		}
		if (!request.body) {
			return new Response('Missing request body.\n', { status: 400 });
		}

		try {
			const item = await env.SEARCH.items.upload(name, request.body);
			return new Response(`${JSON.stringify(item, null, 2)}\n`);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return new Response(`Upload failed: ${message}\n`, { status: 502 });
		}
	},
} satisfies ExportedHandler<Env>;
