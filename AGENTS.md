<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:ai-model-rules -->
# AI Model Rules

This project uses **Gemini exclusively**. Never introduce Anthropic/Claude code.

- Model: `gemini-3-flash-preview`
- Client: `@google/generative-ai` (`GoogleGenerativeAI`)
- Key: `process.env.GEMINI_API_KEY`
<!-- END:ai-model-rules -->
