# 📎 ClipToFile — Copy to File Worker for Gemini Web & AI Agents

A lightweight worker and utility designed for one specific job: **Copy anything on your PC and paste it directly as an attached file into Gemini Web, ChatGPT, Claude, or any AI web interface**.

---

## ⚡ How It Solves The Problem

Normally, when you copy text/code and press `Ctrl+V` in Gemini Web or ChatGPT, the browser dumps thousands of lines of raw text into the message box.

**With ClipToFile:**
Whenever you copy text on your PC, the worker automatically saves it to a temporary file (e.g., `clip_20261102.py` or `.txt`) and places it on the Windows clipboard as a **real File object**.

When you press **`Ctrl+V`** in Gemini Web:
* The web app detects a file upload event.
* Gemini attaches it directly as an **uploaded document attachment**!

---

## 🚀 Two Ways to Use It

### Option 1: Windows Background Auto-Worker (Recommended)
1. Double-click [`start-worker.bat`](file:///c:/Users/HomePC/Desktop/Coded/clipboard-ai-worker/start-worker.bat) in this folder.
2. Copy any text, code, or logs anywhere on your PC (`Ctrl+C`).
3. The worker automatically detects the programming language (`.py`, `.js`, `.json`, `.sql`, `.html`, `.md`, `.txt`) and creates the file on your clipboard.
4. Go to **Gemini Web** (`gemini.google.com`) and hit **`Ctrl+V`**.
5. It attaches instantly as a file!

---

### Option 2: Browser Drag & Drop / Web Helper
If you don't want a background process running:
1. Open [`public/index.html`](file:///c:/Users/HomePC/Desktop/Coded/clipboard-ai-worker/public/index.html) in your browser.
2. Click **"Paste from Clipboard"**.
3. Grab the **Draggable File Chip** and drag it directly onto your Gemini Web tab or window.
4. Also includes a **Gemini 1-Click Bookmarklet** you can drag to your bookmarks bar.
