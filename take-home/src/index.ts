/**
 * AI-Powered Feedback Classification Pipeline
 * 
 * Endpoints:
 * - GET /process - Process unclassified feedback
 * - GET /summary - Generate daily summary
 */

interface Feedback {
	id: number;
	content: string;
	sentiment: string | null;
	urgency: string | null;
	created_at: string;
}

interface ClassificationResult {
	sentiment: 'positive' | 'negative' | 'neutral';
	urgency: 'high' | 'medium' | 'low';
}

export default {
	async fetch(req, env, ctx): Promise<Response> {
		const url = new URL(req.url);
		const path = url.pathname;

		// Dashboard route
		if (path === '/' && req.method === 'GET') {
			return await renderDashboard(env);
		}

		// Process unclassified feedback
		if (path === '/process' && req.method === 'GET') {
			return await processFeedback(env);
		}

		// Generate daily summary
		if (path === '/summary' && req.method === 'GET') {
			return await generateSummary(env);
		}

		// Default response
		return new Response(JSON.stringify({
			endpoints: {
				'/': 'GET - PM Dashboard',
				'/process': 'GET - Process unclassified feedback',
				'/summary': 'GET - Generate daily summary'
			}
		}), {
			headers: { 'content-type': 'application/json' }
		});
	},
} satisfies ExportedHandler<Env>;

/**
 * Process unclassified feedback using AI
 */
async function processFeedback(env: Env): Promise<Response> {
	try {
		// Get unprocessed feedback (where sentiment or urgency is NULL)
		const result = await env.feedback_db.prepare(
			'SELECT id, content, sentiment, urgency, created_at FROM feedback WHERE sentiment IS NULL OR urgency IS NULL LIMIT 10'
		).all<Feedback>();

		if (!result.success || !result.results || result.results.length === 0) {
			return new Response(JSON.stringify({ message: 'No unprocessed feedback found' }), {
				headers: { 'content-type': 'application/json' }
			});
		}

		const processed = [];
		const errors = [];

		// Process each feedback item
		for (const feedback of result.results) {
			try {
				const classification = await classifyFeedback(feedback.content, env);
				
				// Update database
				await env.feedback_db.prepare(
					'UPDATE feedback SET sentiment = ?, urgency = ? WHERE id = ?'
				).bind(classification.sentiment, classification.urgency, feedback.id).run();

				processed.push({
					id: feedback.id,
					content: feedback.content.substring(0, 50) + '...',
					sentiment: classification.sentiment,
					urgency: classification.urgency
				});
			} catch (error) {
				errors.push({ id: feedback.id, error: String(error) });
			}
		}

		return new Response(JSON.stringify({
			processed: processed.length,
			items: processed,
			errors: errors.length > 0 ? errors : undefined
		}), {
			headers: { 'content-type': 'application/json' }
		});
	} catch (error) {
		return new Response(JSON.stringify({ error: String(error) }), {
			status: 500,
			headers: { 'content-type': 'application/json' }
		});
	}
}

/**
 * Classify feedback using Workers AI
 */
async function classifyFeedback(text: string, env: Env): Promise<ClassificationResult> {
	// Use a chat model to classify sentiment and urgency
	const prompt = `Analyze this customer feedback and classify it. Return ONLY a JSON object with "sentiment" (positive/negative/neutral) and "urgency" (high/medium/low).

Feedback: "${text}"

Response format: {"sentiment": "positive|negative|neutral", "urgency": "high|medium|low"}`;

	const response = await env.AI.run('@cf/openai/gpt-oss-120b', {
		input: [
			{ role: 'system', content: 'You are a feedback classification assistant. Always respond with valid JSON only.' },
			{ role: 'user', content: prompt }
		]
	} as any) as any;

	// Extract JSON from response
	const responseText = response.response || JSON.stringify(response);
	let classification: ClassificationResult;

	try {
		// Try to parse JSON from the response
		const jsonMatch = responseText.match(/\{[\s\S]*\}/);
		if (jsonMatch) {
			classification = JSON.parse(jsonMatch[0]);
		} else {
			throw new Error('No JSON found in response');
		}
	} catch (error) {
		// Fallback: simple keyword-based classification
		const lowerText = text.toLowerCase();
		const sentiment = lowerText.includes('great') || lowerText.includes('love') || lowerText.includes('excellent') 
			? 'positive' 
			: lowerText.includes('bad') || lowerText.includes('hate') || lowerText.includes('terrible')
			? 'negative'
			: 'neutral';
		
		const urgency = lowerText.includes('urgent') || lowerText.includes('asap') || lowerText.includes('critical')
			? 'high'
			: lowerText.includes('soon') || lowerText.includes('important')
			? 'medium'
			: 'low';

		classification = { sentiment, urgency };
	}

	// Validate and normalize
	return {
		sentiment: ['positive', 'negative', 'neutral'].includes(classification.sentiment) 
			? classification.sentiment as 'positive' | 'negative' | 'neutral'
			: 'neutral',
		urgency: ['high', 'medium', 'low'].includes(classification.urgency)
			? classification.urgency as 'high' | 'medium' | 'low'
			: 'low'
	};
}

/**
 * Generate daily summary for PM using AI
 */
async function generateSummary(env: Env): Promise<Response> {
	try {
		const today = '2026-01-18';
		
		// Get all processed feedback for the specified date
		const feedbackResult = await env.feedback_db.prepare(
			`SELECT content, sentiment, urgency FROM feedback 
			 WHERE DATE(created_at) = ? AND sentiment IS NOT NULL AND urgency IS NOT NULL
			 ORDER BY urgency DESC, sentiment ASC`
		).bind(today).all<{ content: string; sentiment: string; urgency: string }>();

		if (!feedbackResult.success || !feedbackResult.results || feedbackResult.results.length === 0) {
			return new Response(JSON.stringify({ 
				date: today,
				message: 'No processed feedback found for the specified date' 
			}), {
				headers: { 'content-type': 'application/json' }
			});
		}

		// Format feedback data as JSON
		const feedbackData = feedbackResult.results.map(f => ({
			content: f.content,
			sentiment: f.sentiment,
			urgency: f.urgency
		}));

		const feedbackJson = JSON.stringify(feedbackData, null, 2);

		// Create AI prompt
		const prompt = `Below is customer feedback collected from multiple channels (support, GitHub, Discord, social media).

Each item includes sentiment and urgency labels.

Data:

${feedbackJson}

Produce a concise PM-facing summary with EXACTLY the following structure. Use the exact section headers shown:

**Summary**

[One sentence describing the single most critical product risk. Be specific about the risk and its impact.]

**Key Themes**

[Three bullet points synthesizing feedback into user problems. Focus on developer pain points, not feature requests. Avoid repeating similar wording across bullets.]

**Critical Issues**

[Maximum 3 bullet points focusing on root causes, not symptoms. Explain why these issues are blocking or risky. Use concrete examples when possible.]

**Recommendation**

[Maximum 2 bullet points that are opinionated and actionable. Suggest what to do first and what can wait. Be specific about actions, timelines, or priorities.]

Guidelines:
- Use the exact section headers: **Summary**, **Key Themes**, **Critical Issues**, **Recommendation**
- Do NOT repeat phrases across sections
- Do NOT use vague language like "prioritize" or "address issues" without specifics
- Write as if this will be read by a Director of Product
- Keep the entire response under 150 words
- Focus on developer experience, runtime stability, deployment workflows, and tooling reliability`;

		// Generate summary using Workers AI
		const aiResponse = await env.AI.run('@cf/openai/gpt-oss-120b', {
			input: [
				{ 
					role: 'system', 
					content: 'You are a senior product manager at Cloudflare writing for a Director of Product. Generate concise, opinionated summaries that focus on root causes and specific recommendations. Follow the exact structure provided. Context: This feedback is about Cloudflare Workers and the Cloudflare Developer Platform. Focus on developer experience, runtime stability, deployment workflows, and tooling reliability. Avoid consumer SaaS language such as refunds or end-user outages.' 
				},
				{ role: 'user', content: prompt }
			]
		} as any) as any;

		// Extract text from gpt-oss-120b response format
		let summaryText: string;
		try {
			// Response might be a JSON string or object
			const parsed = typeof aiResponse === 'string' ? JSON.parse(aiResponse) : aiResponse;
			
			if (parsed.output && Array.isArray(parsed.output)) {
				// Extract text from output array
				const textParts = parsed.output
					.filter((item: any) => item.type === 'message' && item.content && Array.isArray(item.content))
					.flatMap((item: any) => item.content)
					.filter((c: any) => c.type === 'output_text' && c.text)
					.map((c: any) => c.text);
				summaryText = textParts.join('') || JSON.stringify(parsed);
			} else if (parsed.response) {
				summaryText = parsed.response;
			} else {
				summaryText = JSON.stringify(parsed);
			}
		} catch (error) {
			summaryText = typeof aiResponse === 'string' ? aiResponse : JSON.stringify(aiResponse);
		}

		return new Response(JSON.stringify({
			date: today,
			summary: summaryText,
			feedback_count: feedbackData.length
		}, null, 2), {
			headers: { 'content-type': 'application/json' }
		});
	} catch (error) {
		return new Response(JSON.stringify({ error: String(error) }), {
			status: 500,
			headers: { 'content-type': 'application/json' }
		});
	}
}

/**
 * Render PM Dashboard
 */
async function renderDashboard(env: Env): Promise<Response> {
	try {
		// Fetch summary data
		const summaryResponse = await generateSummary(env);
		const summaryData = await summaryResponse.json() as { date: string; summary: string; feedback_count?: number; error?: string; message?: string };

		if (summaryData.error || summaryData.message) {
			return new Response(renderDashboardHTML({
				error: summaryData.error || summaryData.message || 'Failed to load summary'
			}), {
				headers: { 'content-type': 'text/html' }
			});
		}

		// Parse summary text into structured sections
		const parsed = parseSummary(summaryData.summary);

		return new Response(renderDashboardHTML({
			date: summaryData.date,
			headline: parsed.headline,
			themes: parsed.themes,
			criticalIssues: parsed.criticalIssues,
			recommendation: parsed.recommendation,
			feedbackCount: summaryData.feedback_count
		}), {
			headers: { 'content-type': 'text/html' }
		});
	} catch (error) {
		return new Response(renderDashboardHTML({
			error: String(error)
		}), {
			headers: { 'content-type': 'text/html' }
		});
	}
}

/**
 * Parse summary text into structured sections
 */
function parseSummary(summaryText: string): {
	headline: string;
	themes: string[];
	criticalIssues: string[];
	recommendation: string[];
} {
	// Match **Summary** or **Headline** format
	const headlineMatch = summaryText.match(/\*\*Summary[:\*]?\*\*\s*\n?(.+?)(?=\n\*\*|$)/is) || 
		summaryText.match(/\*\*Headline[:\*]?\*\*\s*\n?(.+?)(?=\n\*\*|$)/is) ||
		summaryText.match(/Summary[:\-]?\s*\n?(.+?)(?=\n\*\*|$)/is) ||
		summaryText.match(/Headline[:\-]?\s*\n?(.+?)(?=\n\*\*|$)/is);
	const headline = headlineMatch ? headlineMatch[1].trim() : 'No headline available';

	// Extract themes - match **Key Themes** or **Top 3 Themes**
	const themesMatch = summaryText.match(/\*\*Key\s*Themes[:\*]?\*\*\s*\n?([\s\S]*?)(?=\n\*\*|$)/i) ||
		summaryText.match(/\*\*Top\s*3\s*Themes[:\*]?\*\*\s*\n?([\s\S]*?)(?=\n\*\*|$)/i) ||
		summaryText.match(/Key\s*Themes[:\-]?\s*\n?([\s\S]*?)(?=\n\*\*|$)/i) ||
		summaryText.match(/Top\s*3\s*Themes[:\-]?\s*\n?([\s\S]*?)(?=\n\*\*|$)/i);
	const themesText = themesMatch ? themesMatch[1] : '';
	const themes = extractBullets(themesText);

	// Extract critical issues
	const issuesMatch = summaryText.match(/\*\*Critical\s*Issues[:\*]?\*\*\s*\n?([\s\S]*?)(?=\n\*\*|$)/i) ||
		summaryText.match(/Critical\s*Issues[:\-]?\s*\n?([\s\S]*?)(?=\n\*\*|$)/i);
	const issuesText = issuesMatch ? issuesMatch[1] : '';
	const criticalIssues = extractBullets(issuesText);

	// Extract recommendation
	const recMatch = summaryText.match(/\*\*Recommendation[:\*]?\*\*\s*\n?([\s\S]*?)(?=\n\*\*|$)/i) ||
		summaryText.match(/Recommendation[:\-]?\s*\n?([\s\S]*?)(?=\n\*\*|$)/i);
	const recText = recMatch ? recMatch[1] : '';
	const recommendation = extractBullets(recText);

	return {
		headline,
		themes: themes.slice(0, 3),
		criticalIssues: criticalIssues.slice(0, 3),
		recommendation: recommendation.slice(0, 2)
	};
}

/**
 * Extract bullet points from text
 */
function extractBullets(text: string): string[] {
	const bullets: string[] = [];
	// Match various bullet formats: •, *, -, +, or numbered
	const bulletRegex = /[•\*\-\+]\s*(.+?)(?=\n[•\*\-\+]|\n\n|$)/g;
	const numberedRegex = /\d+[\.\)]\s*(.+?)(?=\n\d+[\.\)]|\n\n|$)/g;
	
	let match;
	while ((match = bulletRegex.exec(text)) !== null) {
		bullets.push(match[1].trim());
	}
	while ((match = numberedRegex.exec(text)) !== null) {
		bullets.push(match[1].trim());
	}
	
	// Fallback: split by newlines and clean
	if (bullets.length === 0) {
		const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
		bullets.push(...lines);
	}
	
	return bullets.filter(b => b.length > 0);
}

/**
 * Render dashboard HTML
 */
function renderDashboardHTML(data: {
	date?: string;
	headline?: string;
	themes?: string[];
	criticalIssues?: string[];
	recommendation?: string[];
	feedbackCount?: number;
	error?: string;
}): string {
	if (data.error) {
		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Customer Feedback Intelligence</title>
	<style>
		* { margin: 0; padding: 0; box-sizing: border-box; }
		body {
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
			line-height: 1.6;
			color: #1a1a1a;
			background: #ffffff;
			padding: 60px 40px;
			max-width: 900px;
			margin: 0 auto;
		}
		header {
			margin-bottom: 60px;
			padding-bottom: 30px;
			border-bottom: 2px solid #e0e0e0;
		}
		header h1 {
			font-size: 32px;
			font-weight: 600;
			color: #000;
			letter-spacing: -0.5px;
		}
		header p {
			color: #666;
			margin-top: 8px;
			font-size: 16px;
		}
		.error {
			padding: 40px;
			background: #f8f8f8;
			border-left: 4px solid #d32f2f;
			margin-top: 40px;
		}
		.error h2 { color: #d32f2f; margin-bottom: 12px; }
		footer {
			margin-top: 80px;
			padding-top: 40px;
			border-top: 1px solid #e0e0e0;
			color: #666;
			font-size: 14px;
		}
	</style>
</head>
<body>
	<header>
		<h1>Customer Feedback Intelligence</h1>
		<p>Daily Product Signal Overview</p>
	</header>
	<div class="error">
		<h2>Error</h2>
		<p>${data.error}</p>
	</div>
	<footer>
		Prototype built with Cloudflare Workers + Workers AI
	</footer>
</body>
</html>`;
	}

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Customer Feedback Intelligence</title>
	<style>
		* { margin: 0; padding: 0; box-sizing: border-box; }
		body {
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
			line-height: 1.5;
			color: #1a1a1a;
			background: #fafafa;
			padding: 24px;
			max-width: 800px;
			margin: 0 auto;
		}
		header {
			margin-bottom: 20px;
			padding-bottom: 12px;
			border-bottom: 1px solid #e0e0e0;
		}
		header h1 {
			font-size: 24px;
			font-weight: 600;
			color: #000;
			letter-spacing: -0.3px;
			margin-bottom: 2px;
		}
		header p {
			color: #666;
			font-size: 13px;
		}
		.date {
			color: #888;
			font-size: 12px;
			margin-bottom: 16px;
			text-transform: uppercase;
			letter-spacing: 0.5px;
		}
		.headline {
			font-size: 20px;
			font-weight: 600;
			line-height: 1.4;
			color: #000;
			margin-bottom: 20px;
			padding-bottom: 16px;
			border-bottom: 1px solid #e8e8e8;
		}
		.section {
			margin-bottom: 20px;
			background: #fff;
			border: 1px solid #e8e8e8;
			border-radius: 4px;
			padding: 16px;
		}
		.section h2 {
			font-size: 11px;
			font-weight: 600;
			color: #666;
			margin-bottom: 12px;
			text-transform: uppercase;
			letter-spacing: 0.8px;
		}
		.section ul {
			list-style: none;
			padding: 0;
		}
		.section li {
			margin-bottom: 10px;
			padding-left: 16px;
			position: relative;
			color: #333;
			line-height: 1.5;
			font-size: 14px;
		}
		.section li:last-child {
			margin-bottom: 0;
		}
		.section li:before {
			content: "•";
			position: absolute;
			left: 4px;
			color: #999;
			font-weight: bold;
		}
		.critical {
			border-left: 3px solid #d32f2f;
		}
		.critical h2 {
			color: #d32f2f;
		}
		.recommendation {
			border-left: 3px solid #1976d2;
		}
		.recommendation h2 {
			color: #1976d2;
		}
		footer {
			margin-top: 32px;
			padding-top: 16px;
			border-top: 1px solid #e8e8e8;
			color: #999;
			font-size: 11px;
			text-align: center;
		}
	</style>
</head>
<body>
	<header>
		<h1>Customer Feedback Intelligence</h1>
		<p>Daily Product Signal Overview</p>
	</header>

	<div class="date">${data.date || 'Today'}</div>

	<div class="headline">${data.headline || 'No headline available'}</div>

	<div class="section">
		<h2>Key Themes</h2>
		<ul>
			${(data.themes || []).map(theme => `<li>${theme}</li>`).join('')}
		</ul>
	</div>

	<div class="section critical">
		<h2>Critical Issues</h2>
		<ul>
			${(data.criticalIssues || []).map(issue => `<li>${issue}</li>`).join('')}
		</ul>
	</div>

	<div class="section recommendation">
		<h2>Recommendation</h2>
		<ul>
			${(data.recommendation || []).map(rec => `<li>${rec}</li>`).join('')}
		</ul>
	</div>

	<footer>
		Prototype built with Cloudflare Workers + Workers AI
	</footer>
</body>
</html>`;
}
