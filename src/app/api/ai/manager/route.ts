import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getFinanceSummary } from '@/lib/finance';
import { StaffType } from '@prisma/client';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const maxDuration = 60; // Allow enough time for LLM response and fallbacks

// ── GROQ CALL HANDLER ───────────────────────────────────────────────────────
async function callGroq(apiKey: string, messages: any[], systemPrompt: string): Promise<string> {
  const messagesPayload = [
    { role: 'system', content: systemPrompt },
    ...messages.map((m: any) => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content
    }))
  ];

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'qwen/qwen3.6-27b',
      messages: messagesPayload,
      temperature: 0.25,
      max_tokens: 4000
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Groq API Error: ${res.status} - ${errText}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

// ── OPENAI CALL HANDLER ────────────────────────────────────────────────────
async function callOpenAI(apiKey: string, messages: any[], systemPrompt: string): Promise<string> {
  const messagesPayload = [
    { role: 'system', content: systemPrompt },
    ...messages.map((m: any) => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content
    }))
  ];

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: messagesPayload,
      temperature: 0.25,
      max_tokens: 4000
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI API Error: ${res.status} - ${errText}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

// ── GROK (xAI) CALL HANDLER ────────────────────────────────────────────────
async function callGrok(apiKey: string, messages: any[], systemPrompt: string): Promise<string> {
  const messagesPayload = [
    { role: 'system', content: systemPrompt },
    ...messages.map((m: any) => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content
    }))
  ];

  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'grok-beta',
      messages: messagesPayload,
      temperature: 0.25,
      max_tokens: 4000
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`xAI Grok API Error: ${res.status} - ${errText}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = request.headers.get('x-user-id');
    const role = request.headers.get('x-user-role');

    if (!userId || role !== 'DIRECTOR') {
      return NextResponse.json({ error: 'Access denied. Director role required.', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const listThreads = searchParams.get('listThreads') === 'true';

    if (listThreads) {
      const threads = await prisma.aIChatMessage.findMany({
        where: { userId },
        distinct: ['threadId'],
        orderBy: { createdAt: 'desc' },
        select: {
          threadId: true,
          threadTitle: true,
          createdAt: true
        }
      });
      return NextResponse.json({ threads });
    }

    const threadId = searchParams.get('threadId') || 'default';
    const savedMessages = await prisma.aIChatMessage.findMany({
      where: { userId, threadId },
      orderBy: { createdAt: 'asc' },
      select: {
        role: true,
        content: true
      }
    });

    return NextResponse.json({ messages: savedMessages });
  } catch (error: any) {
    console.error('[AI_MANAGER_API] GET error:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch history', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = request.headers.get('x-user-id');
    const role = request.headers.get('x-user-role');

    if (!userId || role !== 'DIRECTOR') {
      return NextResponse.json({ error: 'Access denied. Director role required.', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const threadId = searchParams.get('threadId');

    if (threadId) {
      await prisma.aIChatMessage.deleteMany({
        where: { userId, threadId }
      });
    } else {
      await prisma.aIChatMessage.deleteMany({
        where: { userId }
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[AI_MANAGER_API] DELETE error:', error);
    return NextResponse.json({ error: error.message || 'Failed to clear history', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const role = request.headers.get('x-user-role');
    const userId = request.headers.get('x-user-id');

    if (!userId || role !== 'DIRECTOR') {
      return NextResponse.json({ error: 'Access denied. Director role required.', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { threadId, threadTitle } = await request.json();
    if (!threadId || !threadTitle) {
      return NextResponse.json({ error: 'Missing parameters', code: 'BAD_REQUEST' }, { status: 400 });
    }

    await prisma.aIChatMessage.updateMany({
      where: { userId, threadId },
      data: { threadTitle }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[AI_MANAGER_API] PATCH error:', error);
    return NextResponse.json({ error: error.message || 'Failed to rename thread', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const role = request.headers.get('x-user-role');
    const userId = request.headers.get('x-user-id');

    if (role !== 'DIRECTOR') {
      return NextResponse.json(
        { error: 'Access denied. Director role required.', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    const groqApiKey = process.env.GROQ_API_KEY;
    const openaiApiKey = process.env.OPENAI_API_KEY;
    const xaiApiKey = process.env.XAI_API_KEY;
    const geminiApiKey = process.env.GEMINI_API_KEY;

    if (!groqApiKey && !openaiApiKey && !xaiApiKey && !geminiApiKey) {
      return NextResponse.json(
        { 
          error: 'No AI service API keys (Groq, OpenAI, xAI, or Gemini) are configured. Please verify your environment variables.', 
          code: 'CONFIG_ERROR' 
        },
        { status: 500 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId || '' }
    });
    const directorName = user?.name || 'Director';

    const { messages, requestAudit, threadId = 'default', threadTitle } = await request.json();

    let activeTitle = threadTitle || 'New Chat';
    if (activeTitle === 'New Chat' && messages && messages.length > 0) {
      const firstUserMsg = messages[0]?.content || '';
      if (firstUserMsg) {
        activeTitle = firstUserMsg.length > 25 ? firstUserMsg.slice(0, 22) + '...' : firstUserMsg;
      }
    }

    // ── Save user message if not requestAudit ─────────────────────────────────
    if (!requestAudit && messages && messages.length > 0) {
      const lastUserMsg = messages[messages.length - 1];
      if (lastUserMsg && lastUserMsg.role === 'user') {
        await prisma.aIChatMessage.create({
          data: {
            userId: userId || '',
            role: 'user',
            content: lastUserMsg.content,
            threadId,
            threadTitle: activeTitle
          }
        });
      }
    }

    // ── Slice Chat History (Keep last 6 messages to prevent token bloat) ────
    const slicedMessages = messages && messages.length > 6 ? messages.slice(-6) : messages;

    // ── GATHER LIVE SYSTEM DATA ─────────────────────────────────────────────
    const [
      activeStudentsCount,
      activeStaffCount,
      activeTeachersCount,
      activeDriversCount,
      activeBusesCount,
      totalHostelRooms,
      totalHostelResidents,
      concessions,
      recentTransactions,
      financeSummary,
      dbUsers,
      dbStaff,
    ] = await Promise.all([
      prisma.student.count({ where: { status: 'ACTIVE' } }),
      prisma.staff.count({ where: { status: 'ACTIVE' } }),
      prisma.staff.count({ where: { status: 'ACTIVE', staffType: StaffType.TEACHER } }),
      prisma.staff.count({ where: { status: 'ACTIVE', staffType: StaffType.DRIVER } }),
      prisma.bus.count(),
      prisma.hostelRoom.count(),
      prisma.hostelResident.count({ where: { status: 'ACTIVE' } }),
      prisma.studentConcession.findMany({
        take: 10,
        orderBy: { value: 'desc' },
        include: {
          student: {
            select: {
              name: true,
              admissionNo: true,
              className: true,
              section: true,
              unitId: true,
            }
          }
        }
      }),
      prisma.transaction.findMany({
        take: 10,
        where: { isDeleted: false },
        orderBy: { date: 'desc' },
        include: {
          student: { select: { name: true, admissionNo: true } },
          staff: { select: { name: true } },
          unit: { select: { name: true } }
        }
      }),
      getFinanceSummary({ includeNullUnit: true }),
      prisma.user.findMany({
        select: { name: true, email: true, role: true }
      }),
      prisma.staff.findMany({
        where: { status: 'ACTIVE', email: { not: null, not: '' } },
        select: { name: true, email: true, roleOrDesignation: true }
      })
    ]);

    const totalConcessionCount = await prisma.studentConcession.count();
    const totalConcessionSum = await prisma.studentConcession.aggregate({
      _sum: { value: true }
    });

    // ── FORMULATE COMPACT SYSTEM CONTEXT ────────────────────────────────────
    const compactConcessions = concessions.map(c => ({
      studentName: c.student?.name || 'Unknown',
      admissionNo: c.student?.admissionNo || 'N/A',
      class: `${c.student?.className || ''} ${c.student?.section || ''}`.trim(),
      division: c.student?.unitId || 'General',
      feeComponent: c.feeComponentName,
      discountType: c.discountType,
      value: Number(c.value),
      reason: c.reason || 'Not specified'
    }));

    const compactTransactions = recentTransactions.map(tx => ({
      id: tx.id,
      voucherNo: tx.referenceNo || `TX-${tx.id.slice(0, 8).toUpperCase()}`,
      date: tx.date.toISOString().slice(0, 10),
      description: tx.description || 'N/A',
      category: tx.category,
      direction: tx.direction,
      amount: Number(tx.amount),
      unit: tx.unit?.name || 'General',
      payee: tx.student?.name || tx.staff?.name || 'N/A'
    }));

    const contactDirectory = [
      ...dbUsers.map(u => ({ name: u.name, email: u.email || 'N/A' })),
      ...dbStaff.map(s => ({ name: s.name, email: s.email || 'N/A' }))
    ];

    const systemContext = {
      currentTime: new Date().toISOString(),
      directorName,
      metrics: {
        activeStudents: activeStudentsCount,
        activeStaff: activeStaffCount,
        teachers: activeTeachersCount,
        drivers: activeDriversCount,
        buses: activeBusesCount,
        hostelRooms: totalHostelRooms,
        hostelResidents: totalHostelResidents,
        concessions: {
          totalCount: totalConcessionCount,
          totalValue: Number(totalConcessionSum._sum.value || 0)
        },
        finance: {
          totalIncome: financeSummary.totalIncome,
          totalExpense: financeSummary.totalExpense,
          netBalance: financeSummary.net,
          byCategory: financeSummary.byCategory
        }
      },
      topConcessions: compactConcessions,
      recentTransactions: compactTransactions
    };

    // ── SYSTEM INSTRUCTIONS ───────────────────────────────────────────
    const systemPrompt = [
      `You are the "AI Manager" — a highly sophisticated AI Auditor and Strategic Educational Management Consultant`,
      `built specifically for "Modern Group of Education" (MGE). MGE operates academic divisions (Hindi Medium, English Medium,`,
      `College) alongside dedicated supporting divisions (Hostel, Transport).`,
      ``,
      `You are communicating directly with ${directorName}, who is the Director of the MGE portal.`,
      `Address him respectfully (e.g., "Mr. ${directorName.split(' ')[0]}" or "Director").`,
      `Customize your analysis to match the executive level: do not give generic definitions, be direct, decisive, and data-grounded.`,
      ``,
      `=== YOUR DATA SCOPE ===`,
      `You have real-time access to the database state:`,
      JSON.stringify(systemContext, null, 2),
      ``,
      `=== CONTACT DIRECTORY (FOR EMAIL DRAFTING) ===`,
      `You have access to the names and email addresses of school users and staff. Use this directory to look up recipients:`,
      JSON.stringify(contactDirectory, null, 2),
      ``,
      `=== AUDITING RULES (PATTERN ANALYSIS) ===`,
      `- Identify any financial anomalies or suspicious activities:`,
      `  * Duplicate voucher payments (similar amounts and categories within short timeframes).`,
      `  * Unusual transaction categories for specific divisions (e.g., transport category used in hostel).`,
      `  * Transactions with missing/vague descriptions or references.`,
      `  * Abnormal spikes or drops in income vs expenses compared to expected averages.`,
      `  * Analyze student fee concessions: flag any excessively large discounts, unusual concession configurations, or missing audit reasons.`,
      `- Offer recommendations for optimization (e.g., resource allocations, fee follow-up improvements, saving fuel/mess costs).`,
      ``,
      `=== EMAIL DRAFTING CAPABILITY (CRITICAL RULE) ===`,
      `If the Director requests you to write, draft, or send an email to a staff member, user, or other contact (e.g. "Write an email to Kamlesh regarding..."), you MUST:`,
      `1. Search the contact directory above for the recipient's name to find their email address. If multiple matches or no matches, ask for clarification.`,
      `2. Draft the email subject and body professionally.`,
      `3. Inform the Director that you have drafted the email.`,
      `4. Append a structured JSON email draft action block at the VERY END of your reply.`,
      `The block must be formatted exactly like this with NO markdown around it, on a new line:`,
      `{"type": "EMAIL_DRAFT", "to": "recipient@email.com", "recipientName": "Recipient Name", "subject": "Subject Line", "body": "Dear Recipient Name,\\n\\nThis is a draft..."}`,
      ``,
      `=== EXPORT CAPABILITY ===`,
      `If the Director requests a file, report, spreadsheet, excel sheet, document, or PDF of some list/ledger,`,
      `you MUST generate the report contents and append a structured JSON action block at the VERY END of your reply.`,
      `The block must be formatted exactly like this with NO markdown around it, on a new line:`,
      `{"type": "EXPORT_ACTION", "exportType": "excel", "title": "Title of Report", "headers": ["Col 1", "Col 2"], "rows": [["Val A1", "Val B1"], ["Val A2", "Val B2"]]}`,
      `- "exportType" can be "excel" or "pdf".`,
      `- Ensure all numbers and currency fields in the spreadsheet rows are raw numbers (no currency symbols) for clean Excel formats.`,
      `- Use Excel format for spreadsheets, registers, and lists; use PDF format for formal executive letters, summaries, and audits.`,
      `- Limit rows to what the user requested or what is present in the context data.`,
      ``,
      `=== STYLE RULES ===`,
      `- Write in a professional, decisive corporate executive voice.`,
      `- NEVER print raw code snippets, programmatic JSON objects (except the EXPORT_ACTION or EMAIL_DRAFT blocks at the end if exporting/drafting),`,
      `  or software commands in the conversational text.`,
      `- Never generate placeholder images or diagrams.`
    ].join('\n');

    let contentText = '';

    // ── FALLBACK EXECUTION CHAIN (Groq Primary) ─────────────────────────────
    
    // Attempt 1: Groq (qwen/qwen3.6-27b)
    if (groqApiKey) {
      try {
        console.log('[AI_MANAGER] Attempting Groq call...');
        const chatMessages = requestAudit 
          ? [{ role: 'user', content: 'Audit our financial ledger and operational metrics.' }]
          : slicedMessages;
        
        contentText = await callGroq(groqApiKey, chatMessages, systemPrompt);
        console.log('[AI_MANAGER] Groq call successful.');
      } catch (groqErr: any) {
        console.warn('[AI_MANAGER] Groq call failed:', groqErr.message || groqErr);
      }
    }

    // Attempt 2: ChatGPT Fallback (gpt-4o-mini)
    if (!contentText && openaiApiKey) {
      try {
        console.log('[AI_MANAGER] Attempting ChatGPT (gpt-4o-mini) fallback...');
        const chatMessages = requestAudit 
          ? [{ role: 'user', content: 'Audit our financial ledger and operational metrics.' }]
          : slicedMessages;

        contentText = await callOpenAI(openaiApiKey, chatMessages, systemPrompt);
        console.log('[AI_MANAGER] ChatGPT fallback successful.');
      } catch (openaiErr: any) {
        console.warn('[AI_MANAGER] ChatGPT fallback failed:', openaiErr.message || openaiErr);
      }
    }

    // Attempt 3: Grok Fallback (grok-beta)
    if (!contentText && xaiApiKey) {
      try {
        console.log('[AI_MANAGER] Attempting Grok (grok-beta) fallback...');
        const chatMessages = requestAudit 
          ? [{ role: 'user', content: 'Audit our financial ledger and operational metrics.' }]
          : slicedMessages;

        contentText = await callGrok(xaiApiKey, chatMessages, systemPrompt);
        console.log('[AI_MANAGER] Grok fallback successful.');
      } catch (grokErr: any) {
        console.warn('[AI_MANAGER] Grok fallback failed:', grokErr.message || grokErr);
      }
    }

    // Attempt 4: Gemini Fallback (gemini-3.1-flash-lite)
    if (!contentText && geminiApiKey) {
      try {
        console.log('[AI_MANAGER] Attempting Gemini fallback...');
        const genAI = new GoogleGenerativeAI(geminiApiKey);
        const model = genAI.getGenerativeModel({
          model: 'gemini-3.1-flash-lite',
          systemInstruction: systemPrompt,
          generationConfig: { temperature: 0.25, maxOutputTokens: 4000 }
        });

        let contents = [];
        if (requestAudit) {
          contents = [{ role: 'user', parts: [{ text: 'Audit our financial ledger and operational metrics.' }] }];
        } else {
          contents = slicedMessages.map((m: any) => ({
            role: m.role === 'user' ? 'user' : 'model',
            parts: [{ text: m.content }]
          }));
        }

        const result = await model.generateContent({ contents });
        const response = await result.response;
        contentText = response.text() || '';
        console.log('[AI_MANAGER] Gemini fallback successful.');
      } catch (geminiErr: any) {
        console.warn('[AI_MANAGER] Gemini fallback failed:', geminiErr.message || geminiErr);
      }
    }

    if (!contentText) {
      throw new Error('All AI service providers (Groq, ChatGPT, Grok, Gemini) returned rate limits or connection errors. Please retry in a few seconds.');
    }

    // ── PARSE STRUCTURED METADATA ACTIONS ──────────────────────────────────
    let exportMetadata = null;
    let emailDraftMetadata = null;
    let cleanText = contentText;

    const actionIndex = contentText.indexOf('{"type": "EXPORT_ACTION"');
    const emailIndex = contentText.indexOf('{"type": "EMAIL_DRAFT"');

    if (actionIndex !== -1) {
      try {
        const potentialJson = contentText.slice(actionIndex).trim();
        exportMetadata = JSON.parse(potentialJson);
        cleanText = contentText.slice(0, actionIndex).trim();
      } catch (err) {
        console.error('[AI_MANAGER_API] Failed to parse export JSON block:', err);
      }
    } else if (emailIndex !== -1) {
      try {
        const potentialJson = contentText.slice(emailIndex).trim();
        emailDraftMetadata = JSON.parse(potentialJson);
        cleanText = contentText.slice(0, emailIndex).trim();
      } catch (err) {
        console.error('[AI_MANAGER_API] Failed to parse email draft JSON block:', err);
      }
    }

    // Save assistant message to database if not requestAudit
    if (!requestAudit && contentText) {
      await prisma.aIChatMessage.create({
        data: {
          userId: userId || '',
          role: 'assistant',
          content: contentText,
          threadId,
          threadTitle: activeTitle
        }
      });
    }

    return NextResponse.json({
      text: cleanText,
      export: exportMetadata,
      emailDraft: emailDraftMetadata,
      threadTitle: activeTitle
    });

  } catch (error: any) {
    console.error('[AI_MANAGER_API] Fatal execution error:', error);
    const groqStatus = process.env.GROQ_API_KEY ? 'Yes' : 'No';
    const geminiStatus = process.env.GEMINI_API_KEY ? 'Yes' : 'No';
    const openaiStatus = process.env.OPENAI_API_KEY ? 'Yes' : 'No';
    const xaiStatus = process.env.XAI_API_KEY ? 'Yes' : 'No';
    return NextResponse.json(
      { 
        error: `${error.message || 'An error occurred'} [Diagnostics - Groq: ${groqStatus}, Gemini: ${geminiStatus}, OpenAI: ${openaiStatus}, xAI: ${xaiStatus}]`, 
        code: 'INTERNAL_ERROR' 
      },
      { status: 500 }
    );
  }
}
