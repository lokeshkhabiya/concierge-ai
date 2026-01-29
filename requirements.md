# **Design an Cursor for Real-World Task Completion**

## Context

Most AI assistants can answer questions, but they often struggle to **complete real-world tasks**. They may stop at suggestions, fail to gather the necessary information, or skip the final steps required to complete the job.

In this assignment, you will design a system that can take a user’s intent and reliably drive it to **clear completion** using **agent-based reasoning and generative UI (Optional)**, not just a chat interface.

---

## The tasks

Design a system that supports **two real-world tasks**.

### 1) Find a medicine near the user

Example prompt:

> “Find paracetamol near me”
> 

Your system should handle:

- Ambiguous input (location, urgency, brand preference, quantity)
- Discovery of nearby pharmacies
- Uncertain availability and partial results
- Optional calling, messaging, or reservation workflows

If a call or confirmation is required, **do not place real calls**. Instead, generate a **simulated but realistic result** (for example, a short call transcript or confirmation message) and **clearly label it as simulated**.

---

### 2) Create a travel itinerary

Example prompt:

> “Create an itinerary for Bali”
> 

Your system should handle:

- Preference gathering (dates, budget, interests, pace)
- Multi-day planning
- Iterative refinement with the user
- A clear, structured final itinerary that someone could realistically follow

---

## What you should design

You are not expected to fully implement the system. Focus on **design, architecture, and reasoning**.

---

### 1) Multi-agent architecture

Propose an agent-based system and explain:

- What each agent is responsible for (for example, planning, retrieval, execution, UI generation)
- How agents coordinate with each other

---

### 2) Generative UI flow (Website, Optional)

Create generative UI:

- Asks follow-up questions
- Shows progress and intermediate state
- Presents options and trade-offs
- Let users make selections
- Reaches a clear end state

---

### 3) Simulated end-mile execution

For actions like calling a pharmacy or confirming availability:

- Generate a **simulated, realistic outcome** (for example, a simulated call transcript)
- Use it to move the task to completion

---

### 4) Scalability

Explain how your design could support **additional real-world tasks** in the future (for example, booking a plumber, grocery pickup, weekend trips) without major changes to the core system.

---

## Helpful references (optional)

You may reference or draw inspiration from:

- CopilotKit (generative and agentic UI)
- LangChain or LangGraph
- Web search providers (for example, Exa or Parallel web search)

You do not need to use any specific framework.

---

## Deliverables

Please submit:

- A written design explanation (doc or Markdown)
- Diagrams (if helpful)
- Clear assumptions and trade-offs
- GitHub link shared to https://github.com/darkshredder
- Can be a terminal implementation without UI, or a website with chat or generative UI

---

## What we are evaluating

We care about:

- Systems thinking
- Clear abstractions
- UX judgment (Optional)
- Ability to scale beyond the initial tasks

We are not evaluating polish or production-ready code.