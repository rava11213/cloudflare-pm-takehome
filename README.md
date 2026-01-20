# Cloudflare Feedback Signal Prototype

A lightweight prototype that aggregates noisy customer feedback and turns it into clear, actionable product insights using Cloudflare’s developer platform.

## Live Demo
**Demo:** <https://drive.google.com/drive/my-drive?dmr=1&ec=wgc-drive-hero-goto>

---

## Problem Statement

Product teams receive feedback from many channels — GitHub issues, support tickets, community posts, and social platforms.  
This feedback is fragmented, noisy, and difficult to synthesize into themes, urgency, and next steps.

The goal of this prototype is to help PMs quickly answer:
- What are the most important issues right now?
- How urgent are they?
- What should we do next?

---

## What This Prototype Does

- Aggregates mock feedback inspired by Cloudflare Workers users across multiple channels
- Uses AI to classify feedback by sentiment and urgency
- Surfaces key themes and critical issues
- Generates an executive-style daily summary with recommended actions

This project intentionally focuses on **signal extraction**, not full ingestion pipelines or alerting systems.

---

## Architecture Overview

This prototype is built entirely on the Cloudflare Developer Platform:

- **Cloudflare Workers**  
  Acts as the application layer and orchestration logic.

- **D1 Database**  
  Stores raw feedback entries and AI-enriched fields such as sentiment and urgency.

- **Workers AI**  
  Classifies feedback and generates summaries without relying on external APIs or credentials.

