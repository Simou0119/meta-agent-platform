# MetaAgent Platform

MetaAgent Platform is a research prototype for building, executing, and analyzing multi-agent workflows.

Users can describe a workflow in natural language, generate multiple agents, connect external tools such as Gmail and Google Calendar, run workflows dynamically with LangGraph, and analyze execution behavior through Metrics and Process Mining.

## Main Features

- Generate agents and workflows from natural-language requirements
- Configure and save multi-agent workflows
- Execute workflows with LangGraph
- Support conditional workflow routing
- Integrate Gmail and Google Calendar
- View workflow execution history
- Analyze duration and token usage through Metrics
- Discover real execution paths through Process Mining
- Check workflow conformance
- Generate optimization suggestions with an LLM Process Advisor

## Example Workflow

```text
Incoming Gmail
      ↓
Email Reader
      ↓
Meeting Request Parser
      ↓
Calendar Availability Checker
      ↓
 Is time available?
   /          \
 Yes           No
  ↓             ↓
Create Event   Reply Writer
  ↓
Reply Writer
```

This workflow can produce different execution paths depending on calendar availability. These paths can later be analyzed with Process Mining.

## Process Mining

The Process Mining module analyzes actual workflow execution records.

It currently supports:

- Process discovery
- Execution variant analysis
- Conformance checking
- Agent performance analysis
- Issue detection
- Rule-based optimization suggestions
- LLM-based recommendations

The LLM Process Advisor uses Process Mining results as evidence and converts them into understandable optimization recommendations.

## Technology Stack

### Backend

- Python
- FastAPI
- LangGraph
- SQLite
- OpenAI API

### Frontend

- Next.js
- React
- TypeScript
- Tailwind CSS

### Integrations

- Gmail API
- Google Calendar API
- Google OAuth 2.0

## Project Structure

```text
meta-agent-platform/
├── backend/
│   ├── app/
│   ├── requirements.txt
│   └── .env.example
│
├── frontend/
│   ├── app/
│   ├── components/
│   ├── package.json
│   └── package-lock.json
│
├── README.md
└── .gitignore
```

## Installation

### 1. Backend

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Create a `.env` file based on `.env.example`.

At minimum, OpenAI features require:

```env
OPENAI_API_KEY=your_openai_api_key
```

Start the backend:

```powershell
python -m uvicorn app.main:app --reload
```

Backend address:

```text
http://127.0.0.1:8000
```

### 2. Frontend

Open another terminal:

```powershell
cd frontend
npm install
npm run dev
```

Frontend address:

```text
http://127.0.0.1:3000
```

If needed, start Next.js with Webpack:

```powershell
npx next dev --webpack -H 127.0.0.1 -p 3000
```

## Gmail and Google Calendar

To use Gmail or Google Calendar features:

1. Create Google OAuth credentials.
2. Enable the Gmail API and Google Calendar API.
3. Configure the required Google credentials in the backend environment.
4. Connect the Google account through the platform.

Each user should authorize their own Google account.
