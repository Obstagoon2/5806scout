/**
 * RAG worker for the FRC 2026 Game Manual, backed by Cloudflare AI Search.
 *
 * Routes:
 *   GET  /            — minimal chat UI
 *   POST /api/ask     — { question, history? } -> { answer, sources }
 *   GET  /api/status  — indexing stats for the AI Search instance
 *
 * The `SEARCH` binding (wrangler.jsonc `ai_search`) points at the
 * "game-manual-2026" instance, which indexes the manual PDF from R2.
 */

type HistoryMessage = { role: 'user' | 'assistant'; content: string };

type AskRequestBody = {
	question?: unknown;
	history?: unknown;
};

type Source = { file: string; score: number; excerpt: string };

const SYSTEM_PROMPT = [
	'You are a rules assistant for the FIRST Robotics Competition 2026 season.',
	'Answer questions using only the retrieved excerpts from the official 2026 Game Manual.',
	'Cite rule numbers and section names when they appear in the excerpts.',
	'If the retrieved excerpts do not contain the answer, say so plainly instead of guessing.',
].join(' ');

const MAX_HISTORY_MESSAGES = 8;
const MAX_QUESTION_LENGTH = 2000;

function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'content-type': 'application/json; charset=utf-8' },
	});
}

function sanitizeHistory(history: unknown): HistoryMessage[] {
	if (!Array.isArray(history)) return [];
	return history
		.filter(
			(m): m is HistoryMessage =>
				typeof m === 'object' &&
				m !== null &&
				((m as HistoryMessage).role === 'user' || (m as HistoryMessage).role === 'assistant') &&
				typeof (m as HistoryMessage).content === 'string' &&
				(m as HistoryMessage).content.length > 0,
		)
		.slice(-MAX_HISTORY_MESSAGES);
}

async function handleAsk(request: Request, env: Env): Promise<Response> {
	let body: AskRequestBody;
	try {
		body = (await request.json()) as AskRequestBody;
	} catch {
		return json({ error: 'Request body must be JSON.' }, 400);
	}

	const question = typeof body.question === 'string' ? body.question.trim() : '';
	if (!question) {
		return json({ error: "Missing 'question' string in request body." }, 400);
	}
	if (question.length > MAX_QUESTION_LENGTH) {
		return json({ error: `Question exceeds ${MAX_QUESTION_LENGTH} characters.` }, 400);
	}

	const messages = [
		{ role: 'system' as const, content: SYSTEM_PROMPT },
		...sanitizeHistory(body.history),
		{ role: 'user' as const, content: question },
	];

	try {
		// query_rewrite runs an extra LLM pass to resolve the question against
		// prior turns — only worth its latency when there IS history. Single-shot
		// asks (the common case, and every call from the Next.js proxy) skip it.
		const hasHistory = messages.some((m) => m.role === 'assistant');

		const result = await env.SEARCH.chatCompletions({
			messages,
			ai_search_options: {
				retrieval: {
					// Fewer chunks -> smaller prompt -> faster generation. 6 still
					// covers the manual section(s) a rules question touches.
					max_num_results: 6,
					context_expansion: 1,
					return_on_failure: false,
				},
				query_rewrite: { enabled: hasHistory },
			},
		});

		const answer = result.choices?.[0]?.message?.content ?? '';
		const sources: Source[] = (result.chunks ?? [])
			.map((chunk) => ({
				file: chunk.item.key,
				score: Math.round(chunk.score * 100) / 100,
				excerpt: chunk.text.length > 240 ? `${chunk.text.slice(0, 240)}…` : chunk.text,
			}))
			.sort((a, b) => b.score - a.score);

		return json({ answer, sources });
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return json({ error: `AI Search request failed: ${message}` }, 502);
	}
}

async function handleStatus(env: Env): Promise<Response> {
	try {
		const stats = await env.SEARCH.stats();
		return json(stats);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return json({ error: `Could not read instance stats: ${message}` }, 502);
	}
}

export default {
	async fetch(request, env, _ctx): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === '/api/ask') {
			if (request.method !== 'POST') {
				return json({ error: 'Use POST.' }, 405);
			}
			return handleAsk(request, env);
		}

		if (url.pathname === '/api/status') {
			return handleStatus(env);
		}

		if (url.pathname === '/') {
			return new Response(CHAT_PAGE, {
				headers: { 'content-type': 'text/html; charset=utf-8' },
			});
		}

		return json({ error: 'Not found.' }, 404);
	},
} satisfies ExportedHandler<Env>;

const CHAT_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>2026 Game Manual — Rules Assistant</title>
<style>
	:root {
		--bg: #1c1c1e; --surface: #26262a; --border: #3a3a3f;
		--text: #ececee; --muted: #9a9aa2; --maroon: #8e2434; --maroon-bright: #b03248;
	}
	* { box-sizing: border-box; margin: 0; }
	body {
		background: var(--bg); color: var(--text);
		font: 0.875rem/1.5 Geist, Arial, Helvetica, sans-serif;
		display: flex; flex-direction: column; height: 100dvh;
	}
	header {
		padding: 14px 20px; border-bottom: 1px solid var(--border);
		display: flex; align-items: baseline; gap: 10px;
	}
	header h1 { font-size: 0.875rem; font-weight: 600; }
	header span { color: var(--muted); font-size: 0.75rem; }
	#log { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 14px; }
	.msg { max-width: 720px; padding: 10px 14px; border: 1px solid var(--border); border-radius: 8px; white-space: pre-wrap; }
	.msg.user { align-self: flex-end; background: var(--maroon); border-color: var(--maroon); }
	.msg.bot { align-self: flex-start; background: var(--surface); }
	.msg.error { align-self: flex-start; border-color: var(--maroon-bright); color: var(--maroon-bright); background: none; }
	.sources { margin-top: 8px; border-top: 1px solid var(--border); padding-top: 8px; font-size: 0.75rem; color: var(--muted); }
	.sources b { color: var(--text); font-weight: 600; }
	.src { margin-top: 4px; font-family: "Geist Mono", monospace; }
	form { display: flex; gap: 10px; padding: 16px 20px; border-top: 1px solid var(--border); }
	input {
		flex: 1; padding: 10px 12px; border-radius: 6px; border: 1px solid var(--border);
		background: var(--surface); color: var(--text); font: inherit;
	}
	input:focus { outline: none; border-color: var(--maroon-bright); }
	button {
		padding: 10px 20px; border-radius: 6px; border: none; background: var(--maroon);
		color: #fff; font: inherit; font-weight: 600; cursor: pointer;
	}
	button:disabled { opacity: 0.5; cursor: default; }
	.thinking { color: var(--muted); font-style: italic; }
</style>
</head>
<body>
<header><h1>2026 Game Manual</h1><span>RAG assistant — Team 5806</span></header>
<div id="log">
	<div class="msg bot">Ask me anything about the FRC 2026 Game Manual — rules, scoring, field dimensions, penalties.</div>
</div>
<form id="f">
	<input id="q" placeholder="e.g. What is the height limit for robots?" autocomplete="off" autofocus>
	<button id="send" type="submit">Ask</button>
</form>
<script>
	const log = document.getElementById("log");
	const form = document.getElementById("f");
	const input = document.getElementById("q");
	const send = document.getElementById("send");
	const history = [];

	function add(cls, text) {
		const el = document.createElement("div");
		el.className = "msg " + cls;
		el.textContent = text;
		log.appendChild(el);
		log.scrollTop = log.scrollHeight;
		return el;
	}

	form.addEventListener("submit", async (e) => {
		e.preventDefault();
		const question = input.value.trim();
		if (!question) return;
		input.value = "";
		send.disabled = true;
		add("user", question);
		const pending = add("bot thinking", "Searching the manual…");
		try {
			const res = await fetch("/api/ask", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ question, history }),
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || res.statusText);
			pending.classList.remove("thinking");
			pending.textContent = data.answer || "(no answer returned)";
			if (data.sources && data.sources.length) {
				const box = document.createElement("div");
				box.className = "sources";
				box.innerHTML = "<b>Sources</b>";
				for (const s of data.sources.slice(0, 4)) {
					const row = document.createElement("div");
					row.className = "src";
					row.textContent = s.file + "  (score " + s.score.toFixed(2) + ")";
					box.appendChild(row);
				}
				pending.appendChild(box);
			}
			history.push({ role: "user", content: question });
			history.push({ role: "assistant", content: data.answer || "" });
		} catch (err) {
			pending.remove();
			add("error", "Error: " + err.message);
		} finally {
			send.disabled = false;
			input.focus();
			log.scrollTop = log.scrollHeight;
		}
	});
</script>
</body>
</html>`;
