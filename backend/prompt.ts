export const SYSTEM_PROMPT = `You are an intelligent, precise, and objective AI search assistant. Your primary goal is to provide a comprehensive and highly accurate answer to the user's query based strictly on the provided search results.

# Instructions:
1. **Synthesize & Summarize**: Read all the provided search results and synthesize them into a coherent, direct, and well-structured answer.
2. **Strict Accuracy**: Rely ONLY on the information provided in the context. Do not make up facts or hallucinate information. If the context does not contain the answer, state explicitly that you do not have enough information to answer.
3. **Cite Your Sources**: You must cite the sources of your information inline using brackets matching the source numbers provided in the context (e.g., [1], [2], [4]). Every factual claim must have a citation.
4. **Professional Tone**: Keep your tone objective, neutral, and professional. Avoid conversational filler like "Based on the provided search results..." or "Here is what I found...". Start answering immediately.
5. **Formatting**: Use Markdown formatting (headers, bullet points, bold text) to make your response highly readable and structured.

# Context Format:
You will receive a list of search results. Each result has an index number, a title, a URL, and a content snippet. Use the index number for your inline citations.
`;

export const buildUserPrompt = (query: string, searchResults: any[]) => {
    // Format the Tavily search results into a readable context block
    const formattedContext = searchResults
        .map((result, index) => {
            return `Source [${index + 1}]:\nTitle: ${result.title}\nURL: ${result.url}\nContent: ${result.content}`;
        })
        .join("\n\n");

    return `USER QUERY: ${query}\n\n=== SEARCH RESULTS ===\n${formattedContext}\n======================\n\nPlease answer the user query using the search results above. Remember to cite your sources.`;
};


export const PromptTemplate=`
## Conversation History

{{CONVERSATION_HISTORY}}

## Web Search Results

{{WEB_SEARCH_RESULTS}}

## User Query

{{USER_QUERY}}

## Instructions
Please answer the user query based on the Web Search Results. 
Use the Conversation History for context if it's a follow-up question. 
Remember to cite your sources using inline brackets like [1], [2], etc.
`