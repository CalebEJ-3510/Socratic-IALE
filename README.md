<div align="center">
  <img src="public/favicon.svg" alt="Socratic Logo" width="120" />
  <h1>Socratic: Interactive Automata Learning Environment 🧠🤖</h1>
  <p>
    <a href="https://socratic-iale.netlify.app/"><img src="https://img.shields.io/badge/Live_Demo-Deploy_on_Netlify-38bdf8?style=for-the-badge&logo=netlify" alt="Live Demo" /></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-emerald?style=for-the-badge" alt="MIT License" /></a>
    <img src="https://img.shields.io/badge/React-19-blue?style=for-the-badge&logo=react" alt="React 19" />
    <img src="https://img.shields.io/badge/Tailwind_CSS-v4-38bdf8?style=for-the-badge&logo=tailwind-css" alt="Tailwind v4" />
  </p>
</div>

<br/>

> **The tutor never tells. The canvas never lies. The student always figures it out.**

Welcome to **Socratic** (Interactive Automata Learning Environment / IALE), the ultimate blueprint laboratory designed to transform abstract computational theory into a tactile, interactive experience. Built for undergraduate Computer Science students wrestling with Automata Theory, this platform takes DFAs, NFAs, and Regex out of the textbook and onto an electrifying canvas where states are pucks, transitions are logic gates, and counterexamples are punched onto physical tapes.

No passive reading. Just building, testing, and debugging, guided by an embedded AI tutor that will push you to the answer without ever giving it away.

---

## 🌍 Live Environment

Experience the platform instantly in your browser. No sign-ups or databases required.

👉 **[Launch Socratic Automata Lab](https://socratic-iale.netlify.app/)**

---

## ⚡ Power & Performance

- **Zero Friction Framework**: Engineered as a lightning-fast, client-side SPA with a modern React 19 + Vite + Tailwind v4 stack.
- **The Canvas is Truth**: Automata aren't abstract concepts here. They are interactive engines you can build by hand, stress-test with punch-tapes in real-time, and mutate at will.
- **Socratic AI Guarantee**: The tutor acts as an orchestrator, not a cheat-sheet. It can highlight nodes, animate traces, and build dynamic counterexamples on your canvas, but it is strictly forbidden from revealing direct answers.
- **Privacy-First (Local Storage)**: No centralized backends. Your data, your API keys, and your progress stay permanently inside your local browser via `localStorage`.

---

## 🏗 The Blueprint Architecture

The interface isn't just a dashboard; it's a midnight lab bench built for focus and flow.

- 🔍 **Discovery Lab**: Build DFAs by hand to solve categorized algorithmic challenges. Watch as punch-tapes feed your machine input and definitively reject or accept based on your logic.
- 🧬 **Mutation & Minimizer Lab**: Compare DFAs side-by-side. Is your machine truly minimal? Run a language diff to find the exact strings where two identical-looking machines diverge.
- 🐛 **Debugger**: Trace a crash step-by-step. Go back in time, inspect state transitions, and ask Socratic to point out where the logic failed.
- 🔄 **Converter**: Play through algorithmic transformations like Subset Construction (NFA → DFA) and State Elimination (DFA → Regex) step-by-step.
- 📊 **Analytics & Progression**: Track your cognitive journey. The platform identifies your most common misconceptions (e.g., missing sink states, incorrect accept statuses) and adapts its pedagogy.

---

## 🔐 Bring Your Own Intelligence (BYOK)

To activate the **Socratic Tutor**, click the robot icon in the top right. 
Socratic is designed with a **Bring Your Own Key (BYOK)** architecture. You can enter an API key from any major provider:

- **Anthropic** (Claude 3.5 Sonnet, Haiku)
- **OpenAI** (GPT-4o)
- **Google AI Studio** (Gemini 2.5 Flash, Pro)
- **NVIDIA NIM** (Mistral, Llama)
- **OpenRouter**

*Your key is securely saved **locally** and never leaves your machine. Requests are made directly from your browser to the provider to ensure total privacy.*

> **Offline Mode:** Don't have a key? No problem. Every core module—Discovery, Debugger, NFA Lab, Analytics—is fully functional completely offline.

---

## 🚀 Quick Start (Local Lab Environment)

Socratic is engineered to be instantly deployable on your local machine with minimal dependencies.

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+ recommended)

### Fire up the Lab
```bash
# 1. Clone the repository
git clone https://github.com/yourusername/socratic-automata-lab.git
cd socratic-automata-lab

# 2. Install dependencies
npm install

# 3. Ignite the engine
npm run dev
```

Visit `http://localhost:5173` (or the port Vite provides) in your browser. The blueprint awaits.

---

## 📜 License

Socratic is open-source and proudly released under the bold and permissive **[MIT License](LICENSE)**. 
Build upon it, hack it, and make computational theory accessible to everyone.

<br />

<div align="center">
  <b>Design, Code, and Vision by Caleb Elisha Joseph (2026).</b><br/>
  <b>Collaborator: <a href="https://github.com/harishramaswamy28-oss">Harish</a> (@harishramaswamy28-oss)</b>
</div>
