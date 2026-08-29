# Socratic: Interactive Automata Learning Environment 🧠🤖

<div align="center">
  <img src="public/favicon.svg" alt="Socratic Logo" width="120" />
</div>

<br/>

> **The tutor never tells. The canvas never lies. The student always figures it out.**

Welcome to **Socratic**, the ultimate blueprint laboratory designed to transform abstract computational theory into a tactile, interactive experience. Built for undergraduate Computer Science students wrestling with Automata Theory, this platform takes DFAs out of the textbook and onto an electrifying canvas where states are pucks, transitions are logic gates, and counterexamples are punched onto physical tapes.

No passive reading. Just building, testing, and debugging, guided by an embedded AI tutor that will push you to the answer without ever giving it away.

---

## ⚡ Power & Performance

- **Zero Friction Framework**: Engineered as a lightning-fast, client-side SPA with a modern React + Vite stack. 
- **The Canvas is Truth**: DFAs aren't abstract concepts here. They are interactive engines you can build by hand, stress-test in real-time, and mutate at will.
- **Socratic AI Guarantee**: Powered by advanced LLMs via **BYOK (Bring Your Own Key)**, the tutor acts as an orchestrator, not a cheat-sheet. It can highlight nodes, animate traces, and build dynamic counterexamples, but it is strictly forbidden from revealing direct answers.
- **Privacy-First**: No centralized backends. Your data, your keys, your progress—everything stays inside your local browser via `localStorage`.

---

## 🏗 The Blueprint Architecture

The interface isn't just a dashboard; it's a midnight lab bench built for focus and flow.

- **Discovery Lab**: Build DFAs by hand to solve categorized algorithmic challenges. Watch as punch-tapes feed your machine input and definitively reject or accept based on your logic.
- **Mutation Lab**: Compare DFAs side-by-side. Is your machine truly minimal? Run a language diff to find the exact strings where two identical-looking machines diverge.
- **Debugger**: Trace a crash step-by-step. Go back in time, inspect state transitions, and ask Socratic to point out where the logic failed.
- **Analytics & Progression**: Track your cognitive journey. The platform identifies your most common misconceptions (e.g., missing sink states, incorrect accept statuses) and adapts its pedagogy.

---

## 🚀 Quick Start (Local Lab Environment)

Socratic is engineered to be instantly deployable on your local machine with minimal dependencies.

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)

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

Visit `http://localhost:8080` in your browser. The blueprint awaits.

---

## 🔐 Bring Your Own Intelligence (BYOK)

To activate the **Socratic Tutor**, click the robot icon in the top right. 
Enter your API key from **NVIDIA NIM, Anthropic, OpenAI, or Google AI Studio**. 
- Keys are saved **locally** and never leave your machine.
- Requests are proxied safely to bypass CORS via Vite's local dev server.
- The tutor handles model deprecations automatically, falling back to top-tier active logic models (e.g., `llama2-70b`, `mistral-large-2-instruct`).

Don't have a key? No problem. **Every core module—Discovery, Debugger, NFA Lab, Analytics—is fully functional offline.**

---

## 📜 License

Socratic is open-source and released under the bold and permissive [MIT License](LICENSE). 
Build upon it, hack it, and make computational theory accessible to everyone.

**Design, Code, and Vision by Caleb Elisha Joseph (2026).**
