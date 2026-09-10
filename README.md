# Shahed AI 

Create a fast MVP full-stack Public AI chat web app named “Shahed AI” that will be connected to subdomain ai.shahedit.com.

Goal:
Public Bengali-first AI chat app (ChatGPT-like) with authentication, chat history, usage limits, and an admin panel.

Pages:
1) Landing (Bangla-first): Hero, features, how it works, pricing (Free/Pro placeholder), FAQ, CTA.
2) Auth: Sign up / Login (email+password). Add Google OAuth if easy.
3) App: Chat UI
   - Left sidebar: New chat, list of chats, search
   - Main chat: bubbles, markdown, copy, regenerate, stop
   - Typing/streaming indicator
4) Admin dashboard (role=admin):
   - Users table (ban/unban)
   - Usage: messages per day per user, simple token estimate
   - Global system prompt editor
   - Blocked topics/keywords list
   - Logs: last 100 errors
5) Legal: Terms + Privacy pages (simple placeholders).

Business rules (Public AI MVP):
- Signup required (no guest).
- Free tier limit: 20 messages per day per user.
- If limit exceeded: show friendly upgrade message.
- Basic moderation: refuse illegal/unsafe content categories with polite Bengali message.

Backend:
- DB (Postgres if available) to store users, conversations, messages, daily usage counters, settings.
- API route /api/chat that calls an OpenAI-compatible LLM provider.
- Read API key from server environment variable (e.g., LLM_API_KEY). Never expose in client.
- Support streaming if platform allows; otherwise simulate typing.

Data model:
- User(id, name, email, role, createdAt, banned)
- Conversation(id, userId, title, createdAt, updatedAt)
- Message(id, conversationId, role, content, createdAt, tokenEstimate)
- UsageDaily(id, userId, date, messageCount, tokenEstimate)
- Setting(key, value)

Design:
- Modern, clean, animated micro-interactions.
- Dark/light mode.
- Bengali-friendly typography.

Deliver:
- Working app with seeded admin user (admin@example.com / change-me-password).
- In-app README page showing:
  - How to set LLM_API_KEY
  - How to set base URL for ai.shahedit.com
  - DNS instruction: CNAME ai -> deploy domain.

Make it production-ready enough for quick launch.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://shahed-ai.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/192d1d58-69cf-4807-ad77-e1ef9d87ed87).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
