import { join } from 'path';

const rootDir = join(import.meta.dir, '..');
const docsDir = join(rootDir, 'docs');
const pkg = await Bun.file(join(rootDir, 'package.json')).json();
const version = `v${pkg.version}`;

await Bun.write(
	join(docsDir, 'index.html'),
	`<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>ECSpresso Documentation</title>
	<style>
		* { margin: 0; padding: 0; box-sizing: border-box; }
		body {
			background: #1e1e2e;
			color: #cdd6f4;
			font-family: 'Segoe UI', system-ui, sans-serif;
			min-height: 100vh;
			padding: 60px 20px;
		}
		.hero {
			text-align: center;
			margin-bottom: 48px;
		}
		h1 { font-size: 48px; color: #cba6f7; margin-bottom: 4px; }
		.pronunciation { color: #6c7086; font-style: italic; margin-bottom: 4px; font-size: 14px; }
		.version { color: #6c7086; font-size: 13px; margin-bottom: 8px; font-family: 'JetBrains Mono', 'Fira Code', monospace; }
		.tagline { color: #a6adc8; margin-bottom: 32px; font-size: 16px; }
		.links { display: flex; gap: 16px; justify-content: center; flex-wrap: wrap; }
		.links a {
			display: block;
			padding: 20px 32px;
			background: #313244;
			border-radius: 12px;
			color: #89b4fa;
			text-decoration: none;
			font-size: 18px;
			font-weight: 500;
			transition: background 0.15s, transform 0.1s;
		}
		.links a:hover { background: #45475a; transform: translateY(-2px); }
		.links a span { display: block; font-size: 13px; color: #6c7086; margin-top: 4px; font-weight: 400; }
		.quick-start {
			max-width: 720px;
			margin: 0 auto;
		}
		.quick-start h2 {
			font-size: 20px;
			color: #cba6f7;
			margin-bottom: 4px;
		}
		.quick-start .install {
			background: #181825;
			border-radius: 8px;
			padding: 12px 16px;
			margin-bottom: 20px;
			font-family: 'JetBrains Mono', 'Fira Code', monospace;
			font-size: 14px;
			color: #a6e3a1;
			overflow-x: auto;
		}
		.quick-start pre {
			background: #181825;
			border-radius: 8px;
			padding: 16px 20px;
			overflow-x: auto;
			font-size: 13px;
			line-height: 1.5;
			font-family: 'JetBrains Mono', 'Fira Code', monospace;
		}
		.quick-start code { font-family: inherit; }
		/* Syntax highlighting */
		.kw { color: #cba6f7; }   /* keywords */
		.fn { color: #89b4fa; }   /* function/method names */
		.tp { color: #f9e2af; }   /* types */
		.st { color: #a6e3a1; }   /* strings */
		.cm { color: #6c7086; }   /* comments */
		.nr { color: #fab387; }   /* numbers */
		.pc { color: #f38ba8; }   /* punctuation / operators */
		.id { color: #cdd6f4; }   /* identifiers */
		.pr { color: #94e2d5; }   /* properties */
		.step-label {
			display: inline-block;
			background: #45475a;
			color: #cba6f7;
			font-size: 11px;
			font-weight: 600;
			padding: 2px 8px;
			border-radius: 4px;
			margin-bottom: 8px;
		}
		.steps { margin-top: 24px; }
		.step {
			margin-bottom: 20px;
		}
		.step p {
			color: #a6adc8;
			font-size: 14px;
			margin-bottom: 8px;
		}
	</style>
</head>
<body>
	<div class="hero">
		<h1>ECSpresso</h1>
		<p class="pronunciation">(pronounced "ex-presso")</p>
		<p class="version">${version}</p>
		<p class="tagline">A type-safe, modular ECS framework for TypeScript</p>
		<div class="links">
			<a href="./api/">API Reference<span>TypeDoc generated</span></a>
			<a href="./examples/">Examples<span>Interactive demos</span></a>
		</div>
	</div>

	<div class="quick-start">
		<h2>Quick Start</h2>
		<div class="install">npm install ecspresso</div>

		<div class="steps">
			<div class="step">
				<span class="step-label">1 &mdash; Define components</span>
<pre><code><span class="kw">import</span> <span class="id">ECSpresso</span> <span class="kw">from</span> <span class="st">'ecspresso'</span><span class="pc">;</span>

<span class="kw">interface</span> <span class="tp">Components</span> <span class="pc">{</span>
  <span class="pr">position</span><span class="pc">:</span> <span class="pc">{</span> <span class="pr">x</span><span class="pc">:</span> <span class="tp">number</span><span class="pc">;</span> <span class="pr">y</span><span class="pc">:</span> <span class="tp">number</span> <span class="pc">};</span>
  <span class="pr">velocity</span><span class="pc">:</span> <span class="pc">{</span> <span class="pr">x</span><span class="pc">:</span> <span class="tp">number</span><span class="pc">;</span> <span class="pr">y</span><span class="pc">:</span> <span class="tp">number</span> <span class="pc">};</span>
  <span class="pr">health</span><span class="pc">:</span> <span class="pc">{</span> <span class="pr">value</span><span class="pc">:</span> <span class="tp">number</span> <span class="pc">};</span>
<span class="pc">}</span></code></pre>
			</div>

			<div class="step">
				<span class="step-label">2 &mdash; Create a world</span>
<pre><code><span class="kw">const</span> <span class="id">world</span> <span class="pc">=</span> <span class="id">ECSpresso</span><span class="pc">.</span><span class="fn">create</span><span class="pc">()</span>
  <span class="pc">.</span><span class="fn">withComponentTypes</span><span class="pc">&lt;</span><span class="tp">Components</span><span class="pc">&gt;()</span>
  <span class="pc">.</span><span class="fn">build</span><span class="pc">();</span></code></pre>
			</div>

			<div class="step">
				<span class="step-label">3 &mdash; Add a system</span>
<pre><code><span class="id">world</span><span class="pc">.</span><span class="fn">addSystem</span><span class="pc">(</span><span class="st">'movement'</span><span class="pc">)</span>
  <span class="pc">.</span><span class="fn">addQuery</span><span class="pc">(</span><span class="st">'moving'</span><span class="pc">,</span> <span class="pc">{</span> <span class="pr">with</span><span class="pc">:</span> <span class="pc">[</span><span class="st">'position'</span><span class="pc">,</span> <span class="st">'velocity'</span><span class="pc">]</span> <span class="pc">})</span>
  <span class="pc">.</span><span class="fn">setProcess</span><span class="pc">(({</span> <span class="id">queries</span><span class="pc">,</span> <span class="id">dt</span> <span class="pc">})</span> <span class="kw">=&gt;</span> <span class="pc">{</span>
    <span class="kw">for</span> <span class="pc">(</span><span class="kw">const</span> <span class="id">entity</span> <span class="kw">of</span> <span class="id">queries</span><span class="pc">.</span><span class="pr">moving</span><span class="pc">)</span> <span class="pc">{</span>
      <span class="id">entity</span><span class="pc">.</span><span class="pr">components</span><span class="pc">.</span><span class="pr">position</span><span class="pc">.</span><span class="pr">x</span> <span class="pc">+=</span> <span class="id">entity</span><span class="pc">.</span><span class="pr">components</span><span class="pc">.</span><span class="pr">velocity</span><span class="pc">.</span><span class="pr">x</span> <span class="pc">*</span> <span class="id">dt</span><span class="pc">;</span>
      <span class="id">entity</span><span class="pc">.</span><span class="pr">components</span><span class="pc">.</span><span class="pr">position</span><span class="pc">.</span><span class="pr">y</span> <span class="pc">+=</span> <span class="id">entity</span><span class="pc">.</span><span class="pr">components</span><span class="pc">.</span><span class="pr">velocity</span><span class="pc">.</span><span class="pr">y</span> <span class="pc">*</span> <span class="id">dt</span><span class="pc">;</span>
    <span class="pc">}</span>
  <span class="pc">});</span></code></pre>
			</div>

			<div class="step">
				<span class="step-label">4 &mdash; Spawn entities</span>
<pre><code><span class="id">world</span><span class="pc">.</span><span class="fn">spawn</span><span class="pc">({</span>
  <span class="pr">position</span><span class="pc">:</span> <span class="pc">{</span> <span class="pr">x</span><span class="pc">:</span> <span class="nr">0</span><span class="pc">,</span> <span class="pr">y</span><span class="pc">:</span> <span class="nr">0</span> <span class="pc">},</span>
  <span class="pr">velocity</span><span class="pc">:</span> <span class="pc">{</span> <span class="pr">x</span><span class="pc">:</span> <span class="nr">10</span><span class="pc">,</span> <span class="pr">y</span><span class="pc">:</span> <span class="nr">5</span> <span class="pc">},</span>
  <span class="pr">health</span><span class="pc">:</span> <span class="pc">{</span> <span class="pr">value</span><span class="pc">:</span> <span class="nr">100</span> <span class="pc">},</span>
<span class="pc">});</span></code></pre>
			</div>

			<div class="step">
				<span class="step-label">5 &mdash; Run</span>
<pre><code><span class="id">world</span><span class="pc">.</span><span class="fn">update</span><span class="pc">(</span><span class="nr">1</span> <span class="pc">/</span> <span class="nr">60</span><span class="pc">);</span></code></pre>
			</div>
		</div>
	</div>
</body>
</html>
`,
);

console.log('Built docs/index.html');

// Inject version into TypeDoc API landing page
const apiIndexPath = join(docsDir, 'api', 'index.html');
const apiIndex = await Bun.file(apiIndexPath).text();
await Bun.write(
	apiIndexPath,
	apiIndex.replace(
		'<div class="tsd-page-title"><h1>ecspresso</h1></div>',
		`<div class="tsd-page-title"><h1>ecspresso <small style="font-size:0.5em;color:#888;font-weight:normal;">${version}</small></h1></div>`,
	),
);

console.log('Injected version into docs/api/index.html');
