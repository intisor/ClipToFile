// ClipAI Application Logic
(function () {
  // Application State
  const state = {
    backendConnected: false,
    isWatching: false,
    selectedFileHandle: null,
    selectedFileName: 'saved_clips.md',
    clips: [],
    chatMessages: [],
    attachedClip: null,
    settings: {
      apiKey: localStorage.getItem('clipai_api_key') || '',
      model: localStorage.getItem('clipai_model') || 'gemini-2.5-flash',
      systemInstruction:
        localStorage.getItem('clipai_system_instruction') ||
        'You are a sharp, helpful, and concise AI assistant. You specialize in analyzing code clips, notes, and documents.'
    }
  };

  // DOM Elements
  const el = {
    backendIndicator: document.getElementById('backend-indicator'),
    backendStatus: document.getElementById('backend-status'),
    btnPickFile: document.getElementById('btn-pick-file'),
    activeFileLabel: document.getElementById('active-file-label'),
    btnToggleWatch: document.getElementById('btn-toggle-watch'),
    watcherBtnLabel: document.getElementById('watcher-btn-label'),
    btnOpenSettings: document.getElementById('btn-open-settings'),
    btnCloseSettings: document.getElementById('btn-close-settings'),
    settingsModal: document.getElementById('settings-modal'),
    btnSaveSettings: document.getElementById('btn-save-settings'),
    inputApiKey: document.getElementById('input-api-key'),
    selectModel: document.getElementById('select-model'),
    inputSystemInstruction: document.getElementById('input-system-instruction'),
    activeModelTag: document.getElementById('active-model-tag'),

    // Clipboard Section
    clipInput: document.getElementById('clip-input'),
    charCount: document.getElementById('char-count'),
    btnPasteClipboard: document.getElementById('btn-paste-clipboard'),
    btnClearInput: document.getElementById('btn-clear-input'),
    btnSaveFile: document.getElementById('btn-save-file'),
    btnSendToChat: document.getElementById('btn-send-to-chat'),
    btnOpenGeminiWeb: document.getElementById('btn-open-gemini-web'),
    clipsList: document.getElementById('clips-list'),
    btnOpenLogFile: document.getElementById('btn-open-log-file'),

    // Chat Section
    chatMessages: document.getElementById('chat-messages'),
    chatForm: document.getElementById('chat-form'),
    chatInput: document.getElementById('chat-input'),
    btnChatSubmit: document.getElementById('btn-chat-submit'),
    chatClipBadge: document.getElementById('chat-clip-badge'),
    chatClipBadgeTitle: document.getElementById('chat-clip-badge-title'),
    btnRemoveChatClip: document.getElementById('btn-remove-chat-clip'),
    btnSaveChatToFile: document.getElementById('btn-save-chat-to-file'),
    btnClearChat: document.getElementById('btn-clear-chat'),

    // Toast
    toast: document.getElementById('toast'),
    toastMsg: document.getElementById('toast-msg'),
    toastIcon: document.getElementById('toast-icon')
  };

  // Initialize Lucide icons
  function refreshIcons() {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  // Toast helper
  function showToast(message, type = 'success') {
    el.toastMsg.textContent = message;
    el.toast.classList.remove('opacity-0', 'translate-y-12', 'pointer-events-none');
    el.toast.classList.add('opacity-100', 'translate-y-0');

    if (type === 'error') {
      el.toastIcon.setAttribute('data-lucide', 'alert-circle');
      el.toastIcon.classList.replace('text-emerald-400', 'text-rose-400');
    } else {
      el.toastIcon.setAttribute('data-lucide', 'check-circle');
      el.toastIcon.classList.replace('text-rose-400', 'text-emerald-400');
    }
    refreshIcons();

    setTimeout(() => {
      el.toast.classList.add('opacity-0', 'translate-y-12', 'pointer-events-none');
      el.toast.classList.remove('opacity-100', 'translate-y-0');
    }, 3200);
  }

  // Check Backend Connection
  async function checkBackend() {
    try {
      const res = await fetch('/api/status', { method: 'GET' });
      if (res.ok) {
        const data = await res.json();
        state.backendConnected = true;
        state.isWatching = !!data.isWatching;

        el.backendIndicator.className = 'inline-block w-2 h-2 rounded-full bg-emerald-400';
        el.backendStatus.textContent = 'PC Worker Connected';
        updateWatcherBtn();
        loadClips();
        return;
      }
    } catch (err) {
      // Backend not running (standalone web mode)
    }

    state.backendConnected = false;
    el.backendIndicator.className = 'inline-block w-2 h-2 rounded-full bg-sky-400';
    el.backendStatus.textContent = 'Standalone Web Mode';
    updateWatcherBtn();
    loadClipsFromLocal();
  }

  function updateWatcherBtn() {
    if (state.isWatching) {
      el.btnToggleWatch.classList.add('bg-indigo-600/30', 'border-indigo-500/50', 'text-indigo-300');
      el.watcherBtnLabel.textContent = 'Watching PC';
    } else {
      el.btnToggleWatch.classList.remove('bg-indigo-600/30', 'border-indigo-500/50', 'text-indigo-300');
      el.watcherBtnLabel.textContent = 'Auto-Watch';
    }
  }

  // File System Access API: Pick Target File on PC
  async function pickTargetFile() {
    if ('showSaveFilePicker' in window) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: 'notes.md',
          types: [
            {
              description: 'Markdown Document',
              accept: { 'text/markdown': ['.md', '.markdown'] }
            },
            {
              description: 'Text Document',
              accept: { 'text/plain': ['.txt'] }
            }
          ]
        });

        state.selectedFileHandle = handle;
        state.selectedFileName = handle.name;
        el.activeFileLabel.textContent = `Target: ${handle.name}`;
        showToast(`Target set to ${handle.name}`);
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('File picker error:', err);
        }
      }
    } else {
      showToast('File System Access API supported in Chromium browsers (Chrome/Edge).', 'info');
    }
  }

  // Append text to the selected File Handle directly via browser
  async function appendToFileHandle(text, title = 'Clip') {
    if (!state.selectedFileHandle) return false;
    try {
      const file = await state.selectedFileHandle.getFile();
      const existingText = await file.text();
      const writable = await state.selectedFileHandle.createWritable();
      const timestamp = new Date().toLocaleString();
      const formatted = `${existingText}\n\n### [${title}] ${timestamp}\n\`\`\`\n${text}\n\`\`\`\n`;
      await writable.write(formatted);
      await writable.close();
      return true;
    } catch (err) {
      console.error('Error writing to file handle:', err);
      return false;
    }
  }

  // Paste from Clipboard
  async function pasteClipboard() {
    try {
      let text = '';
      if (navigator.clipboard && navigator.clipboard.readText) {
        text = await navigator.clipboard.readText();
      }

      // If browser clipboard empty or blocked, try worker
      if (!text && state.backendConnected) {
        const res = await fetch('/api/clipboard');
        const data = await res.json();
        text = data.clipboard || '';
      }

      if (text) {
        el.clipInput.value = text;
        updateCharCount();
        showToast('Pasted from clipboard!');
      } else {
        showToast('Clipboard is currently empty', 'error');
      }
    } catch (err) {
      // Browser permission prompt or fallback
      if (state.backendConnected) {
        const res = await fetch('/api/clipboard');
        const data = await res.json();
        if (data.clipboard) {
          el.clipInput.value = data.clipboard;
          updateCharCount();
          showToast('Pasted from PC clipboard!');
          return;
        }
      }
      showToast('Click in textarea and press Ctrl+V to paste', 'info');
    }
  }

  // Save Active Clip to File
  async function saveActiveClip() {
    const text = el.clipInput.value.trim();
    if (!text) {
      showToast('Nothing to save! Paste or enter text first.', 'error');
      return;
    }

    const title = text.slice(0, 45).replace(/\n/g, ' ') + (text.length > 45 ? '...' : '');

    // 1. Direct browser File System Access if selected
    if (state.selectedFileHandle) {
      const ok = await appendToFileHandle(text, title);
      if (ok) {
        showToast(`Appended to ${state.selectedFileName}!`);
        addLocalClip(text, title);
        return;
      }
    }

    // 2. Local PC worker
    if (state.backendConnected) {
      try {
        const res = await fetch('/api/clips', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: text, title, source: 'Web UI' })
        });
        if (res.ok) {
          showToast('Saved to saved_clips.md on PC!');
          loadClips();
          return;
        }
      } catch (err) {
        console.error(err);
      }
    }

    // 3. Fallback: Download file directly
    downloadTextFile(
      `# ${title}\n*Saved: ${new Date().toLocaleString()}*\n\n${text}\n`,
      `clip_${Date.now()}.md`
    );
    addLocalClip(text, title);
    showToast('Downloaded clip as Markdown file!');
  }

  // Download helper
  function downloadTextFile(content, filename) {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Open in Gemini Web
  async function openInGeminiWeb(customPrompt = '') {
    const clip = el.clipInput.value.trim();
    let promptToSend = customPrompt;

    if (clip) {
      promptToSend = customPrompt
        ? `${customPrompt}\n\nHere is my text/code:\n\`\`\`\n${clip}\n\`\`\``
        : clip;
    }

    if (promptToSend) {
      try {
        await navigator.clipboard.writeText(promptToSend);
      } catch (err) {
        if (state.backendConnected) {
          await fetch('/api/clipboard', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: promptToSend })
          });
        }
      }
      showToast('Copied to clipboard! Ready to Ctrl+V in Gemini.');
    }

    window.open('https://gemini.google.com/app', '_blank');
  }

  // Attach Clip to Chat
  function attachClipToChat(customInstruction = '') {
    const clip = el.clipInput.value.trim();
    if (!clip) {
      showToast('Clipboard input is empty. Paste some text first!', 'error');
      return;
    }

    state.attachedClip = {
      content: clip,
      title: clip.slice(0, 35).replace(/\n/g, ' ') + '...'
    };

    el.chatClipBadgeTitle.textContent = state.attachedClip.title;
    el.chatClipBadge.classList.remove('hidden');

    if (customInstruction) {
      el.chatInput.value = customInstruction;
      sendChatMessage();
    } else {
      el.chatInput.focus();
    }
  }

  // Remove attached clip
  function removeAttachedClip() {
    state.attachedClip = null;
    el.chatClipBadge.classList.add('hidden');
    el.chatClipBadgeTitle.textContent = '';
  }

  // Load clips from backend
  async function loadClips() {
    if (!state.backendConnected) return;
    try {
      const res = await fetch('/api/clips');
      if (res.ok) {
        const data = await res.json();
        state.clips = data.clips || [];
        renderClipsList();
      }
    } catch (err) {
      console.error('Error loading clips:', err);
    }
  }

  // Local fallback clips
  function loadClipsFromLocal() {
    try {
      const stored = localStorage.getItem('clipai_clips');
      if (stored) {
        state.clips = JSON.parse(stored);
        renderClipsList();
      }
    } catch (e) {}
  }

  function addLocalClip(content, title) {
    const newClip = {
      id: 'clip_' + Date.now(),
      content,
      title,
      timestamp: new Date().toISOString()
    };
    state.clips.unshift(newClip);
    if (state.clips.length > 50) state.clips.pop();
    try {
      localStorage.setItem('clipai_clips', JSON.stringify(state.clips));
    } catch (e) {}
    renderClipsList();
  }

  // Render Clips list
  function renderClipsList() {
    if (state.clips.length === 0) {
      el.clipsList.innerHTML = `
        <div class="text-center py-10 text-slate-500 text-xs">
          No clips saved yet. Click "Paste Clipboard" or "Save to File" to start!
        </div>
      `;
      return;
    }

    el.clipsList.innerHTML = state.clips
      .map((clip) => {
        const time = new Date(clip.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const preview = clip.content.replace(/</g, '&lt;').replace(/>/g, '&gt;').slice(0, 140);
        return `
          <div class="group bg-slate-950/60 hover:bg-slate-950/90 border border-slate-800/80 hover:border-slate-700/80 rounded-xl p-3 transition flex flex-col gap-2">
            <div class="flex items-center justify-between text-[11px]">
              <span class="font-medium text-slate-300 truncate max-w-[200px]">${clip.title || 'Clip'}</span>
              <div class="flex items-center gap-1.5 text-slate-500">
                <span>${time}</span>
                <button data-id="${clip.id}" class="btn-delete-clip opacity-0 group-hover:opacity-100 p-1 hover:text-rose-400 transition" title="Delete">
                  <i data-lucide="trash-2" class="w-3 h-3"></i>
                </button>
              </div>
            </div>
            <pre class="text-xs text-slate-400 font-mono overflow-hidden max-h-12 leading-relaxed whitespace-pre-wrap select-all">${preview}</pre>
            <div class="flex items-center justify-end gap-1.5 pt-1 border-t border-slate-900">
              <button data-content="${encodeURIComponent(clip.content)}" class="btn-clip-to-chat px-2 py-0.5 rounded bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 hover:text-indigo-300 text-[11px] font-medium transition flex items-center gap-1">
                <i data-lucide="message-square" class="w-3 h-3"></i>
                <span>Discuss</span>
              </button>
              <button data-content="${encodeURIComponent(clip.content)}" class="btn-copy-clip px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] transition flex items-center gap-1">
                <i data-lucide="copy" class="w-3 h-3"></i>
                <span>Copy</span>
              </button>
            </div>
          </div>
        `;
      })
      .join('');

    refreshIcons();

    // Attach listener for delete & copy
    el.clipsList.querySelectorAll('.btn-delete-clip').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const id = btn.getAttribute('data-id');
        if (state.backendConnected) {
          await fetch(`/api/clips/${id}`, { method: 'DELETE' });
          loadClips();
        } else {
          state.clips = state.clips.filter((c) => c.id !== id);
          localStorage.setItem('clipai_clips', JSON.stringify(state.clips));
          renderClipsList();
        }
        showToast('Clip deleted');
      });
    });

    el.clipsList.querySelectorAll('.btn-copy-clip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const content = decodeURIComponent(btn.getAttribute('data-content'));
        navigator.clipboard.writeText(content);
        showToast('Copied clip to clipboard!');
      });
    });

    el.clipsList.querySelectorAll('.btn-clip-to-chat').forEach((btn) => {
      btn.addEventListener('click', () => {
        const content = decodeURIComponent(btn.getAttribute('data-content'));
        el.clipInput.value = content;
        updateCharCount();
        attachClipToChat();
      });
    });
  }

  // Update Character Count
  function updateCharCount() {
    const len = el.clipInput.value.length;
    el.charCount.textContent = `${len.toLocaleString()} chars`;
  }

  // AI Chat Handler
  async function sendChatMessage() {
    const prompt = el.chatInput.value.trim();
    if (!prompt && !state.attachedClip) return;

    let fullPrompt = prompt;
    if (state.attachedClip) {
      fullPrompt = `${prompt ? prompt + '\n\n' : ''}Context / Attached Clip:\n\`\`\`\n${state.attachedClip.content}\n\`\`\``;
    }

    // Add user message to UI
    appendMessage('user', prompt || 'Analyze attached clip');
    el.chatInput.value = '';
    removeAttachedClip();

    // Loading indicator
    const assistantMsgId = appendMessage('assistant', '...', true);

    try {
      let replyText = '';

      if (state.backendConnected) {
        // Backend chat proxy
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-gemini-key': state.settings.apiKey
          },
          body: JSON.stringify({
            prompt: fullPrompt,
            model: state.settings.model,
            systemInstruction: state.settings.systemInstruction,
            apiKey: state.settings.apiKey
          })
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to get AI response');
        }
        replyText = data.reply;
      } else {
        // Client-side direct call to Gemini API
        if (!state.settings.apiKey) {
          throw new Error('Please set your Google Gemini API key in Settings (top right gear icon)');
        }

        const model = state.settings.model;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${state.settings.apiKey}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
            systemInstruction: state.settings.systemInstruction
              ? { parts: [{ text: state.settings.systemInstruction }] }
              : undefined
          })
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error?.message || 'Gemini API call failed');
        }
        replyText = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response returned.';
      }

      updateMessage(assistantMsgId, replyText);
    } catch (err) {
      updateMessage(
        assistantMsgId,
        `⚠️ **Error:** ${err.message}\n\n*Tip: If you don't have an API key handy, click "Gemini Web" above to use Google Gemini for free directly in your browser!*`
      );
    }
  }

  // Append Chat Message to DOM
  function appendMessage(role, content, isLoading = false) {
    const id = 'msg_' + Date.now();
    const isUser = role === 'user';

    const msgDiv = document.createElement('div');
    msgDiv.id = id;
    msgDiv.className = `flex gap-3 animate-fade-in ${isUser ? 'flex-row-reverse' : ''}`;

    const iconHtml = isUser
      ? `<div class="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 mt-0.5 text-slate-300"><i data-lucide="user" class="w-3.5 h-3.5"></i></div>`
      : `<div class="w-7 h-7 rounded-full bg-indigo-600/30 border border-indigo-500/30 flex items-center justify-center shrink-0 mt-0.5 text-indigo-400"><i data-lucide="bot" class="w-3.5 h-3.5"></i></div>`;

    const bodyClass = isUser
      ? 'bg-indigo-600 text-white rounded-2xl rounded-tr-sm p-3.5 text-sm max-w-[85%] leading-relaxed shadow-md shadow-indigo-600/10'
      : 'flex-1 bg-slate-950/70 border border-slate-800/80 rounded-2xl rounded-tl-sm p-3.5 text-sm max-w-[90%] chat-prose shadow-md';

    const rendered = isUser
      ? `<p class="whitespace-pre-wrap">${content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`
      : isLoading
      ? `<div class="flex items-center gap-2 text-slate-400"><span class="w-2 h-2 rounded-full bg-indigo-400 animate-bounce"></span><span>Thinking...</span></div>`
      : marked.parse(content);

    const actionButtons = isUser
      ? ''
      : `
      <div class="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-end gap-1.5 text-xs text-slate-400">
        <button class="btn-copy-reply px-2 py-1 rounded hover:bg-slate-800 hover:text-white transition flex items-center gap-1">
          <i data-lucide="copy" class="w-3 h-3"></i>
          <span>Copy</span>
        </button>
        <button class="btn-save-reply px-2 py-1 rounded hover:bg-slate-800 hover:text-emerald-400 transition flex items-center gap-1">
          <i data-lucide="file-plus" class="w-3 h-3"></i>
          <span>Save to File</span>
        </button>
      </div>
    `;

    msgDiv.innerHTML = `
      ${iconHtml}
      <div class="${bodyClass}">
        <div class="msg-content">${rendered}</div>
        ${actionButtons}
      </div>
    `;

    el.chatMessages.appendChild(msgDiv);
    el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
    refreshIcons();

    // Attach copy & save listeners for this message
    if (!isUser && !isLoading) {
      attachMessageActions(msgDiv, content);
    }

    return id;
  }

  function updateMessage(id, markdownContent) {
    const msgDiv = document.getElementById(id);
    if (!msgDiv) return;

    const contentDiv = msgDiv.querySelector('.msg-content');
    if (contentDiv) {
      contentDiv.innerHTML = marked.parse(markdownContent);

      // Highlight code blocks
      contentDiv.querySelectorAll('pre code').forEach((block) => {
        if (window.hljs) hljs.highlightElement(block);

        // Add code copy button
        const pre = block.parentElement;
        const copyBtn = document.createElement('button');
        copyBtn.className = 'code-copy-btn';
        copyBtn.textContent = 'Copy';
        copyBtn.onclick = () => {
          navigator.clipboard.writeText(block.textContent);
          copyBtn.textContent = 'Copied!';
          setTimeout(() => (copyBtn.textContent = 'Copy'), 2000);
        };
        pre.appendChild(copyBtn);
      });
    }

    attachMessageActions(msgDiv, markdownContent);
    el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
    refreshIcons();
  }

  function attachMessageActions(msgDiv, rawContent) {
    const copyBtn = msgDiv.querySelector('.btn-copy-reply');
    if (copyBtn) {
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(rawContent);
        showToast('AI response copied!');
      };
    }

    const saveBtn = msgDiv.querySelector('.btn-save-reply');
    if (saveBtn) {
      saveBtn.onclick = async () => {
        if (state.selectedFileHandle) {
          await appendToFileHandle(rawContent, 'AI Response');
          showToast(`Saved answer to ${state.selectedFileName}!`);
        } else if (state.backendConnected) {
          await fetch('/api/clips', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: rawContent, title: 'AI Response', source: 'Gemini' })
          });
          showToast('Saved answer to saved_clips.md!');
          loadClips();
        } else {
          downloadTextFile(rawContent, `ai_response_${Date.now()}.md`);
          showToast('Downloaded AI answer!');
        }
      };
    }
  }

  // Export full chat conversation
  function exportChat() {
    const messages = el.chatMessages.querySelectorAll('.msg-content');
    if (messages.length === 0) {
      showToast('No chat messages to export', 'error');
      return;
    }

    let exportText = `# 🤖 ClipAI Conversation Export\n*Date: ${new Date().toLocaleString()}*\n\n---\n\n`;
    messages.forEach((msg, idx) => {
      exportText += `${msg.innerText}\n\n---\n\n`;
    });

    downloadTextFile(exportText, `chat_export_${Date.now()}.md`);
    showToast('Exported entire chat to file!');
  }

  // Event Listeners Setup
  function setupEventListeners() {
    // Input changes
    el.clipInput.addEventListener('input', updateCharCount);

    // Paste button
    el.btnPasteClipboard.addEventListener('click', pasteClipboard);

    // Clear input
    el.btnClearInput.addEventListener('click', () => {
      el.clipInput.value = '';
      updateCharCount();
    });

    // Save to File
    el.btnSaveFile.addEventListener('click', saveActiveClip);

    // Pick target file
    el.btnPickFile.addEventListener('click', pickTargetFile);

    // Send to Chat button
    el.btnSendToChat.addEventListener('click', () => {
      attachClipToChat();
    });

    // Remove attached clip badge
    el.btnRemoveChatClip.addEventListener('click', removeAttachedClip);

    // Open in Gemini Web
    el.btnOpenGeminiWeb.addEventListener('click', () => {
      openInGeminiWeb();
    });

    // Toggle Auto-Watcher
    el.btnToggleWatch.addEventListener('click', async () => {
      if (!state.backendConnected) {
        showToast('Background clipboard watcher requires running the local PC worker (`node server.js`).', 'info');
        return;
      }

      const nextState = !state.isWatching;
      try {
        const res = await fetch('/api/watcher', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: nextState })
        });
        const data = await res.json();
        state.isWatching = data.isWatching;
        updateWatcherBtn();
        showToast(state.isWatching ? 'Auto-watch enabled! Now capturing copies.' : 'Auto-watch paused');
      } catch (err) {
        showToast('Failed to toggle watcher', 'error');
      }
    });

    // Quick Action Prompt Buttons
    document.querySelectorAll('.btn-prompt-action').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.getAttribute('data-action');
        let prompt = '';
        if (action === 'summarize') prompt = 'Please summarize this clip clearly into key bullet points and high-level takeaways:';
        else if (action === 'debug') prompt = 'Please review and debug this code, highlight potential edge cases, and show improved code:';
        else if (action === 'explain') prompt = 'Please explain this clearly in simple terms suitable for quick understanding:';
        else if (action === 'action-items') prompt = 'Please extract all actionable items, tasks, and follow-ups from this text:';

        attachClipToChat(prompt);
      });
    });

    // Welcome Chips
    document.querySelectorAll('.welcome-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        el.chatInput.value = chip.textContent.replace(/"/g, '');
        sendChatMessage();
      });
    });

    // Chat submit
    el.chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      sendChatMessage();
    });

    el.chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
      }
    });

    // Clear chat
    el.btnClearChat.addEventListener('click', () => {
      el.chatMessages.innerHTML = `
        <div class="text-center py-6 text-slate-500 text-xs">
          Chat cleared. Type a question or attach a clip to start!
        </div>
      `;
      showToast('Chat cleared');
    });

    // Export chat
    el.btnSaveChatToFile.addEventListener('click', exportChat);

    // Open log file on PC
    el.btnOpenLogFile.addEventListener('click', async () => {
      if (state.backendConnected) {
        await fetch('/api/open-log', { method: 'POST' });
        showToast('Opening saved_clips.md in default editor');
      } else {
        showToast('Connect to local worker to open file on PC', 'info');
      }
    });

    // Settings Modal
    el.btnOpenSettings.addEventListener('click', () => {
      el.inputApiKey.value = state.settings.apiKey;
      el.selectModel.value = state.settings.model;
      el.inputSystemInstruction.value = state.settings.systemInstruction;
      el.settingsModal.classList.remove('hidden');
      el.settingsModal.classList.add('flex');
    });

    el.btnCloseSettings.addEventListener('click', () => {
      el.settingsModal.classList.add('hidden');
      el.settingsModal.classList.remove('flex');
    });

    el.btnSaveSettings.addEventListener('click', () => {
      state.settings.apiKey = el.inputApiKey.value.trim();
      state.settings.model = el.selectModel.value;
      state.settings.systemInstruction = el.inputSystemInstruction.value.trim();

      localStorage.setItem('clipai_api_key', state.settings.apiKey);
      localStorage.setItem('clipai_model', state.settings.model);
      localStorage.setItem('clipai_system_instruction', state.settings.systemInstruction);

      el.activeModelTag.textContent = state.settings.model;
      el.settingsModal.classList.add('hidden');
      el.settingsModal.classList.remove('flex');
      showToast('Settings saved successfully!');
    });
  }

  // Periodic poll for clips when watcher is active
  setInterval(() => {
    if (state.backendConnected && state.isWatching) {
      loadClips();
    }
  }, 3500);

  // Initialize
  function init() {
    el.activeModelTag.textContent = state.settings.model;
    setupEventListeners();
    checkBackend();
    refreshIcons();
  }

  init();
})();
