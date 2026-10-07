import { Groq } from 'groq-sdk';
import { query } from '../db';
import axios from 'axios';

const groqKeys = (process.env.GROQ_API_KEYS || '').split(',');
let currentKeyIndex = 0;

async function executeTool(toolCall: any) {
    const name = toolCall.function.name;
    const args = JSON.parse(toolCall.function.arguments);
    
    if (name === 'get_weather') {
        try {
            const apiKey = process.env.WEATHER_API_KEY || '7d03d2ac34664540ba282008261809';
            const res = await axios.get(`http://api.weatherapi.com/v1/current.json?key=${apiKey}&q=${args.location}`);
            return JSON.stringify(res.data.current);
        } catch(e: any) {
            return "Error fetching weather: " + e.message;
        }
    } else if (name === 'query_sql') {
        try {
            if (!args.sql.toLowerCase().trim().startsWith('select')) {
                return "Error: Only SELECT queries are allowed.";
            }
            const res = await query(args.sql);
            return JSON.stringify(res.recordset).substring(0, 2000); // truncate if too long
        } catch(e: any) {
            return "SQL Error: " + e.message;
        }
    } else if (name === 'search_news_and_events') {
        try {
            const res = await axios.get(`https://news.google.com/rss/search?q=${encodeURIComponent(args.query)}&hl=en-IN&gl=IN&ceid=IN:en`);
            // Simple regex to extract titles
            const matches = [...res.data.matchAll(/<title>(.*?)<\/title>/g)].map(m => m[1]).filter(t => !t.includes('Google News'));
            return JSON.stringify(matches.slice(0, 5));
        } catch(e: any) {
            return "News Error: " + e.message;
        }
    }
    return "Unknown tool";
}

export async function handleChat(req: any, res: any) {
    try {
        const { userMsg, history } = req.body;
        
        if ((userMsg || '').toLowerCase().includes('run the pipeline') || (userMsg || '').toLowerCase().includes('run agents')) {
            return res.json({ reply: "I will now run the pipeline to update forecasts and allocations. You can also trigger this via the top button." });
        }

        const messages = [
            { role: "system", content: "You are the Retail AI Command Center assistant. You have tools to get weather and query the SQL database (RetailAI) which has dbo.FactInventory(StoreKey, ProductKey, AvailableQty), dbo.DimStore(StoreKey, StoreName, City), dbo.DimProduct(ProductKey, ProductName). Use tools to answer the user's question accurately." },
            ...(history || []).map((m: any) => ({ role: m.role, content: m.content })),
            { role: "user", content: userMsg }
        ];

        const tools = [
            {
                type: "function" as const,
                function: {
                    name: "get_weather",
                    description: "Get the current weather for a given city.",
                    parameters: { type: "object", properties: { location: { type: "string" } }, required: ["location"] }
                }
            },
            {
                type: "function" as const,
                function: {
                    name: "query_sql",
                    description: "Run a SELECT SQL query against the database to get stock, store, or product info. Use standard SQL.",
                    parameters: { type: "object", properties: { sql: { type: "string" } }, required: ["sql"] }
                }
            },
            {
                type: "function" as const,
                function: {
                    name: "search_news_and_events",
                    description: "Search for current local events, news, or trends on social media for a specific location.",
                    parameters: { type: "object", properties: { query: { type: "string", description: "Search query, e.g., 'Chennai local events'" } }, required: ["query"] }
                }
            }
        ];

        if (groqKeys.length === 0 || !groqKeys[0]) {
            return res.json({ reply: "Groq API keys are not configured." });
        }

        let attempts = 0;
        
        while (attempts < groqKeys.length) {
            try {
                const groq = new Groq({ apiKey: groqKeys[currentKeyIndex].trim() });
                
                let currentMessages = [...messages];
                let responseMsg: any;
                
                for (let i = 0; i < 3; i++) {
                    const completion = await groq.chat.completions.create({
                        messages: currentMessages as any,
                        model: 'openai/gpt-oss-120b',
                        tools: tools as any,
                        tool_choice: "auto"
                    });
                    
                    responseMsg = completion.choices[0].message;
                    
                    if (responseMsg.tool_calls && responseMsg.tool_calls.length > 0) {
                        currentMessages.push(responseMsg as any);
                        
                        for (const toolCall of responseMsg.tool_calls) {
                            const toolResult = await executeTool(toolCall);
                            currentMessages.push({
                                role: "tool",
                                tool_call_id: toolCall.id,
                                name: toolCall.function.name,
                                content: toolResult
                            } as any);
                        }
                    } else {
                        break;
                    }
                }
                return res.json({ reply: responseMsg.content || "Done." });
            } catch (e: any) {
                if (e.status === 429) {
                    currentKeyIndex = (currentKeyIndex + 1) % groqKeys.length;
                    attempts++;
                } else {
                    throw e;
                }
            }
        }
        return res.json({ reply: "Sorry, I am currently experiencing high traffic. Please try again later." });

    } catch(e: any) {
        console.error("Chat error:", e);
        res.status(500).json({ error: e.message });
    }
}
