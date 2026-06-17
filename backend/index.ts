import "dotenv/config"
import express from "express"
import cors from "cors";
import z from "zod";
import { tavily } from '@tavily/core';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { supabase } from "./supabaseClient.ts";
import { PromptTemplate, SYSTEM_PROMPT } from "./prompt.ts";
import { authMiddleware } from "./middleware.ts";

const client = tavily({ apiKey: process.env.TAVILY_API_KEY! });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: SYSTEM_PROMPT
});

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

app.post(["/perplexity_ask", "/perplexityAsk"], async (req, res) => {
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

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const sendSSE = (event: string, data: any) => {
            res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        };

        const webSearchResponse = await client.search(query, { searchDepth: "advanced" });
        const results = webSearchResponse.results;
        const sources = results.map(r => ({ title: r.title, url: r.url }));
        sendSSE('sources', sources);

        const promptText = PromptTemplate
            .replace("{{CONVERSATION_HISTORY}}", "No previous history.")
            .replace("{{WEB_SEARCH_RESULTS}}", results.map((r, i) => `Source [${i+1}]:\nTitle: ${r.title}\nURL: ${r.url}\nContent: ${r.content}`).join("\n\n"))
            .replace("{{USER_QUERY}}", query);

        const resultStream = await model.generateContentStream(promptText);

        let aiFullContent = '';
        for await (const chunk of resultStream.stream) {
            const chunkText = chunk.text();
            aiFullContent += chunkText;
            sendSSE('text', { delta: chunkText });
        }

        const followUps = ["What else happened?", "Can you explain more?"];
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
        if (!res.headersSent) res.status(500).json({ error: "Internal Server Error", details: error.message });
        else { res.write(`event: error\ndata: ${JSON.stringify({ message: error.message })}\n\n`); res.end(); }
    }
});

app.post("/perplexity_ask/follow-up", async (req, res) => {
    try {
        const { query, conversationID } = req.body;
        if (!query) return res.status(400).json({ error: "Query is required" });
        if (!conversationID) return res.status(400).json({ error: "conversationID is required" });

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

        // Get history
        let historyStr = "No previous history.";
        if (req.user.isMock) {
            const historyData = mockMessages
                .filter(m => m.conversation_id === conversationID)
                .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
            historyStr = historyData ? historyData.map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n") : "No previous history.";
        } else {
            const { data: historyData } = await supabase.from('messages').select('*').eq('conversation_id', conversationID).order('created_at', { ascending: true });
            historyStr = historyData ? historyData.map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n") : "No previous history.";
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const sendSSE = (event: string, data: any) => {
            res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        };

        const webSearchResponse = await client.search(query, { searchDepth: "advanced" });
        const results = webSearchResponse.results;
        const sources = results.map(r => ({ title: r.title, url: r.url }));
        sendSSE('sources', sources);

        const promptText = PromptTemplate
            .replace("{{CONVERSATION_HISTORY}}", historyStr)
            .replace("{{WEB_SEARCH_RESULTS}}", results.map((r, i) => `Source [${i+1}]:\nTitle: ${r.title}\nURL: ${r.url}\nContent: ${r.content}`).join("\n\n"))
            .replace("{{USER_QUERY}}", query);

        const resultStream = await model.generateContentStream(promptText);

        let aiFullContent = '';
        for await (const chunk of resultStream.stream) {
            const chunkText = chunk.text();
            aiFullContent += chunkText;
            sendSSE('text', { delta: chunkText });
        }

        const followUps = ["Tell me more about this", "What are the counter-arguments?"];
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
        if (!res.headersSent) res.status(500).json({ error: "Internal Server Error", details: error.message });
        else { res.write(`event: error\ndata: ${JSON.stringify({ message: error.message })}\n\n`); res.end(); }
    }
});

const PORT = 5000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
