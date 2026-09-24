/**
 * @file src/lib/aiInsights.ts
 * @description Generate an executive summary of the monthly financial report.
 *
 * Provider: Groq (OpenAI-compatible Chat Completions API), model `llama-3.3-70b-versatile`.
 * Why Groq: truly free with no credit card, no regional quota games, and the
 * 70B Llama is genuinely on par with GPT-4o-mini / Gemini Flash for this style
 * of "analyze numbers, write a 4-paragraph summary" task. Free tier is 14,400
 * requests/day; we use ~1/month so we're nowhere near the cap.
 *
 * Failure mode: if GROQ_API_KEY is missing OR the API errors out, return `null`
 * and the caller falls back to a static template summary so the monthly email
 * still goes out. AI quality must never block delivery.
 */

import { categoryLabel, type MonthlyReport } from '@/lib/monthlyReport';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'qwen/qwen3.6-27b';

/** Strip a MonthlyReport down to what the LLM actually needs (saves tokens). */
function compactReport(r: MonthlyReport) {
  return {
    month: r.label,
    totals: {
      income:  Math.round(r.totals.income),
      expense: Math.round(r.totals.expense),
      net:     Math.round(r.totals.net),
      count:   r.totals.count,
    },
    byCategory: Object.fromEntries(
      Object.entries(r.byCategory).map(([k, v]) => [categoryLabel(k), {
        income: Math.round(v.income), expense: Math.round(v.expense), net: Math.round(v.net), count: v.count,
      }])
    ),
    byUnit: Object.fromEntries(
      Object.entries(r.byUnit).map(([, v]) => [v.unitName, {
        income: Math.round(v.income), expense: Math.round(v.expense), net: Math.round(v.net), count: v.count,
      }])
    ),
    // Top 10 by amount in each direction — enough context without bloating prompt cost.
    topIncome: r.transactions
      .filter(t => t.direction === 'INCOME')
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10)
      .map(t => ({ date: t.date, category: categoryLabel(t.category), description: t.description, amount: Math.round(t.amount) })),
    topExpense: r.transactions
      .filter(t => t.direction === 'EXPENSE')
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10)
      .map(t => ({ date: t.date, category: categoryLabel(t.category), description: t.description, amount: Math.round(t.amount) })),
  };
}

/**
 * Ask Groq for a 4-paragraph executive summary. Returns null on any failure
 * so the caller falls back to a template.
 */
export async function generateExecutiveSummary(
  current: MonthlyReport,
  previous?: MonthlyReport | null
): Promise<string | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.warn('[aiInsights] GROQ_API_KEY not set — skipping AI summary.');
    return null;
  }

  const systemPrompt = [
    `You are the financial analyst for "Modern Group of Education" (MGE), an Indian school`,
    `group with Hindi-Medium, English-Medium, and College units, plus a Hostel and a`,
    `Transport service. Write executive summaries for the Director that are decisive,`,
    `respectful, and grounded in the actual numbers — no hedging, no waffle.`,
  ].join(' ');

  const userPrompt = [
    `Write a 4-paragraph EXECUTIVE SUMMARY for the Director about ${current.label}.`,
    `Tone: respectful, clear, decisive. Plain English with the occasional Hindi term where natural ("fees", "salary", etc.).`,
    `Be specific — quote actual rupee amounts and percentages from the data.`,
    ``,
    `Structure (four short paragraphs, in order):`,
    `  1. Overall financial health this month — income vs expense, net result.`,
    `  2. What changed versus the previous month. Call out the single biggest mover.`,
    `  3. What is working well — biggest income source, on-track collections.`,
    `  4. What needs attention — largest expenses, concerning trends, concrete suggestions.`,
    ``,
    `Formatting rules:`,
    `  - No markdown. No headings, no bullets, no bold. Plain paragraphs only.`,
    `  - Separate paragraphs with a single blank line.`,
    `  - Write rupees as "Rs. 12,345" — do NOT use the ₹ symbol (PDF font compatibility).`,
    `  - Do not greet ("Dear Director" etc.) — the email wrapper handles greetings.`,
    `  - Do not sign off — the email wrapper handles closings too.`,
    ``,
    `=== CURRENT MONTH (${current.label}) ===`,
    JSON.stringify(compactReport(current), null, 2),
    previous
      ? `\n=== PREVIOUS MONTH (${previous.label}) FOR COMPARISON ===\n${JSON.stringify(compactReport(previous), null, 2)}`
      : `\n(No previous month data — likely the first month of operations.)`,
  ].join('\n');

  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt },
        ],
        temperature: 0.4,        // Some warmth in tone, mostly factual.
        max_tokens: 900,         // ~4 paragraphs of English.
        top_p: 0.9,
        stream: false,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`[aiInsights] Groq API ${res.status}:`, errText.slice(0, 500));
      return null;
    }

    const data = await res.json() as {
      choices?: { message?: { content?: string } }[];
      error?: { message?: string };
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) {
      console.error('[aiInsights] Groq returned no content:', JSON.stringify(data).slice(0, 500));
      return null;
    }
    return text;
  } catch (err) {
    console.error('[aiInsights] Groq API call failed:', err);
    return null;
  }
}
