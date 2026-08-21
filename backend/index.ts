import "dotenv/config"
import express from "express"
import cors from "cors";
import z from "zod";
import { tavily } from '@tavily/core';
import OpenAI from "openai";
import { supabase } from "./supabaseClient.ts";
import { PromptTemplate, SYSTEM_PROMPT, CHAT_SYSTEM_PROMPT, CHAT_TEMPLATE } from "./prompt.ts";
import { authMiddleware } from "./middleware.ts";

const client = tavily({ apiKey: process.env.TAVILY_API_KEY! });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

/**
 * Answers stream token by token, so time-to-first-token is what the user feels.
 * gpt-4.1-mini is the fastest model that still holds the citation format
 * reliably; set OPENAI_MODEL=gpt-4.1-nano to trade some of that for more speed.
 */
const ANSWER_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
/** Follow-ups are three short questions — the smallest model is plenty. */
const FOLLOW_UP_MODEL = process.env.OPENAI_FOLLOW_UP_MODEL || "gpt-4.1-nano";

/**
 * The search prompt requires a citation on every claim, which is impossible
 * when there are no sources. Conversational turns use their own instructions.
 */
function systemPromptFor(route: Route): string {
    return route === 'search' ? SYSTEM_PROMPT : CHAT_SYSTEM_PROMPT;
}

interface MockConversation {
    id: string;
    user_id: string;
    title: string;
    created_at: string;
}

interface MockMessage {
    id: string;
    conversation_id: string;
    role: string;
    content: string;
    sources?: string;
    follow_ups?: string;
    created_at: string;
}

const mockConversations: MockConversation[] = [];
const mockMessages: MockMessage[] = [];

/**
 * Follow-ups were hardcoded to "What else happened?" regardless of topic, which
 * is worse than showing nothing. Derive them from the answer instead, and fall
 * back to an empty list if the model is unavailable — the UI hides the section
 * when there are none.
 */
async function generateFollowUps(query: string, answer: string): Promise<string[]> {
    if (!answer.trim()) return [];
    try {
        // CHAT_SYSTEM_PROMPT, not SYSTEM_PROMPT: the search instructions would
        // try to add citations to what has to come back as a bare JSON array.
        const completion = await openai.chat.completions.create({
            model: FOLLOW_UP_MODEL,
            messages: [
                { role: "system", content: CHAT_SYSTEM_PROMPT },
                {
                    role: "user",
                    content:
                        `A user asked: "${query}"

They received this answer:
${answer.slice(0, 4000)}

` +
                        `Write 3 short follow-up questions they would plausibly ask next. ` +
                        `Each must be a standalone question under 12 words. ` +
                        `Return ONLY a JSON array of 3 strings, no markdown fence, no commentary.`
                }
            ]
        });
        const raw = (completion.choices[0]?.message?.content || '').trim().replace(/^```(?:json)?|```$/g, '').trim();
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
            .slice(0, 3);
    } catch (err) {
        console.error('Follow-up generation failed', err);
        return [];
    }
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
    res.send("hello from kaushal perplexity backend")
})

app.post("/signin", async (req, res) => {
    const { email, password } = req.body;
    if (email === 'test@example.com' && password === 'password123') {
        return res.json({
            user: { id: 'da3b3b3b-3b3b-3b3b-3b3b-3b3b3b3b3b3b', email: 'test@example.com' },
            session: { access_token: 'mock-jwt-token-for-testing' }
        });
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return res.status(400).json({ error: error.message });
    
    if (data.user) {
        await supabase.from('users').upsert([{ id: data.user.id, email: data.user.email }]);
    }
    res.json(data);
});

app.post("/signup", async (req, res) => {
    const { email, password } = req.body;
    if (email === 'test@example.com' && password === 'password123') {
        return res.json({
            user: { id: 'da3b3b3b-3b3b-3b3b-3b3b-3b3b3b3b3b3b', email: 'test@example.com' },
            session: { access_token: 'mock-jwt-token-for-testing' }
        });
    }
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return res.status(400).json({ error: error.message });
    
    if (data.user) {
        await supabase.from('users').insert([{ id: data.user.id, email: data.user.email }]);
    }
    res.json(data);
});

// Protected routes below
app.use(authMiddleware);

app.get("/conversations", async (req, res) => {
    if (req.user.isMock) {
        const sorted = [...mockConversations]
            .filter(c => c.user_id === req.user.id)
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        return res.json(sorted);
    }
    const { data, error } = await supabase.from('conversations').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
});

app.post("/conversations/:conversationID", async (req, res) => {
    const { conversationID } = req.params;
    if (req.user.isMock) {
        const filtered = mockMessages
            .filter(m => m.conversation_id === conversationID)
            .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        return res.json(filtered);
    }
    const { data, error } = await supabase.from('messages').select('*').eq('conversation_id', conversationID).order('created_at', { ascending: true });
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
});

app.post("/newChat", async (req, res) => {
    const { title } = req.body;
    if (req.user.isMock) {
        const newConv = {
            id: `mock-conv-${Date.now()}`,
            user_id: req.user.id,
            title: title || 'New Conversation',
            created_at: new Date().toISOString()
        };
        mockConversations.unshift(newConv);
        return res.json([newConv]);
    }
    const { data, error } = await supabase.from('conversations').insert([{ user_id: req.user.id, title }]).select();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
});

/**
 * Not every message deserves a web search. "hi", "thanks", "who are you" and
 * self-contained tasks were all being sent to Tavily, which cost a search call
 * and several seconds before the model could say "Hello". These go straight to
 * the model instead.
 *
 * The test is deliberately a cheap pattern match rather than a classifier call:
 * an extra LLM round trip to decide whether to search would add latency to
 * every real question, which is the case that matters most.
 */
const SMALL_TALK = /^\s*(hi+|hey+|hello+|hii+|yo|sup|hola|namaste|greetings|good\s*(morning|afternoon|evening|night)|how(?:'?s)?\s+(are\s+(you|u)|is\s+it\s+going|it\s+going|are\s+things|things)|what'?s\s+up|wassup|thanks?|thank\s+you|thx|ty|cheers|ok(ay)?|k|cool|nice|great|awesome|perfect|got\s+it|lol|haha|bye|goodbye|see\s+(ya|you)|test(ing)?|ping|who\s+(are|r)\s+(you|u)|what\s+(are|r)\s+(you|u)|what\s+(can|do)\s+you\s+do|how\s+do\s+you\s+work|help)\s*[!.?,]*\s*$/i;

/** Tasks the model performs on the text it was given — no outside facts needed. */
const SELF_CONTAINED_TASK = /^\s*(write|compose|draft|rewrite|re-?write|rephrase|paraphrase|translate|summari[sz]e|shorten|expand|correct|proofread|fix|refactor|debug|explain\s+this\s+code|convert|calculate|compute|solve)\b/i;

/** Bare arithmetic, e.g. "2+2" or "(15 * 3) / 4". */
const ARITHMETIC = /^[\s\d+\-*/().,^%=]+$/;

type Route = 'direct' | 'search';

function routeQuery(query: string): Route {
    const q = query.trim();
    if (!q) return 'direct';
    if (SMALL_TALK.test(q)) return 'direct';
    if (ARITHMETIC.test(q)) return 'direct';
    if (SELF_CONTAINED_TASK.test(q)) return 'direct';
    return 'search';
}

/** Both ask endpoints do the same work; only the history differs. */
async function handleAsk(req: any, res: any, opts: { withHistory: boolean }) {
    try {
        const { query, conversationID } = req.body;
        if (!query) {
            return res.status(400).json({ error: "Query is required in request body" });
        }
        if (!conversationID) {
            return res.status(400).json({ error: "conversationID is required" });
        }

        // Save user message
        if (req.user.isMock) {
            mockMessages.push({
                id: `mock-msg-${Date.now()}-user`,
                conversation_id: conversationID,
                role: 'user',
                content: query,
                created_at: new Date().toISOString()
            });
        } else {
            await supabase.from('messages').insert([{ conversation_id: conversationID, role: 'user', content: query }]);
        }

        // Build history. The user's own message was just saved, so drop the
        // last row — it is the query being answered, not prior context.
        let historyStr = "No previous history.";
        if (opts.withHistory) {
            let historyData: MockMessage[] | any[] | null = null;
            if (req.user.isMock) {
                historyData = mockMessages
                    .filter(m => m.conversation_id === conversationID)
                    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
            } else {
                const { data } = await supabase.from('messages').select('*').eq('conversation_id', conversationID).order('created_at', { ascending: true });
                historyData = data;
            }
            const prior = (historyData || []).slice(0, -1);
            if (prior.length) {
                historyStr = prior.map(m => `${String(m.role).toUpperCase()}: ${m.content}`).join("\n\n");
            }
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        // Stops nginx and friends from buffering the stream into one blob.
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();

        const sendSSE = (event: string, data: any) => {
            // JSON.stringify never emits a raw newline, so each frame stays a
            // single data line and the client's frame boundaries hold.
            res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        };

        const route = routeQuery(query);
        // Tells the client whether to say "Searching the web" or "Thinking".
        sendSSE('mode', { mode: route });

        let sources: { title: string; url: string }[] = [];
        let promptText: string;

        if (route === 'search') {
            const webSearchResponse = await client.search(query, { searchDepth: "advanced" });
            const results = webSearchResponse.results;
            sources = results.map(r => ({ title: r.title, url: r.url }));
            sendSSE('sources', sources);

            promptText = PromptTemplate
                .replace("{{CONVERSATION_HISTORY}}", historyStr)
                .replace("{{WEB_SEARCH_RESULTS}}", results.map((r, i) => `Source [${i + 1}]:\nTitle: ${r.title}\nURL: ${r.url}\nContent: ${r.content}`).join("\n\n"))
                .replace("{{USER_QUERY}}", query);
        } else {
            // Still announce an empty source list so the client can clear any
            // "Reading sources" state instead of waiting on a rail that never comes.
            sendSSE('sources', sources);

            promptText = CHAT_TEMPLATE
                .replace("{{CONVERSATION_HISTORY}}", historyStr)
                .replace("{{USER_QUERY}}", query);
        }

        const resultStream = await openai.chat.completions.create({
            model: ANSWER_MODEL,
            stream: true,
            messages: [
                { role: "system", content: systemPromptFor(route) },
                { role: "user", content: promptText }
            ]
        });

        let aiFullContent = '';
        for await (const chunk of resultStream) {
            const chunkText = chunk.choices[0]?.delta?.content || '';
            if (!chunkText) continue;
            aiFullContent += chunkText;
            sendSSE('text', { delta: chunkText });
        }

        // Small talk doesn't warrant a "keep going" list, and generating one
        // costs an extra model call for no benefit.
        const followUps = route === 'search'
            ? await generateFollowUps(query, aiFullContent)
            : [];
        sendSSE('followUps', followUps);

        // Save AI message
        if (req.user.isMock) {
            mockMessages.push({
                id: `mock-msg-${Date.now()}-ai`,
                conversation_id: conversationID,
                role: 'assistant',
                content: aiFullContent,
                sources: JSON.stringify(sources),
                follow_ups: JSON.stringify(followUps),
                created_at: new Date().toISOString()
            });
        } else {
            await supabase.from('messages').insert([{
                conversation_id: conversationID,
                role: 'assistant',
                content: aiFullContent,
                sources: JSON.stringify(sources),
                follow_ups: JSON.stringify(followUps)
            }]);
        }

        res.write('event: end\ndata: {}\n\n');
        res.end();
    } catch (error: any) {
        console.error('Ask failed', error);
        if (!res.headersSent) res.status(500).json({ error: "Internal Server Error", details: error.message });
        else { res.write(`event: error\ndata: ${JSON.stringify({ message: error.message })}\n\n`); res.end(); }
    }
}

app.post(["/perplexity_ask", "/perplexityAsk"], (req, res) => handleAsk(req, res, { withHistory: false }));

app.post("/perplexity_ask/follow-up", (req, res) => handleAsk(req, res, { withHistory: true }));

const PORT = 5000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
