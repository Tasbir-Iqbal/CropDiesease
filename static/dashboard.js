document.addEventListener("DOMContentLoaded", () => {

  /* =====================================================
     VIEW SWITCHING (sidebar buttons <-> <section data-view>)
     ===================================================== */

  const navLinks = document.querySelectorAll("[data-view-link]");
  const views     = document.querySelectorAll(".dash-view");

  function switchView(viewName) {
    navLinks.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.viewLink === viewName);
    });

    views.forEach((section) => {
      section.classList.toggle("active", section.dataset.view === viewName);
    });
  }

  navLinks.forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.viewLink));
  });


  /* =====================================================
     SCAN VIEW
     ===================================================== */

  const scanFieldSelect = document.getElementById("scan-field-select");
  const dropzone         = document.getElementById("scan-dropzone");
  const fileInput        = document.getElementById("scan-file-input");
  const preview          = document.getElementById("scan-preview");
  const previewImg       = document.getElementById("scan-preview-img");
  const previewName      = document.getElementById("scan-preview-name");
  const retakeBtn        = document.getElementById("scan-retake-btn");
  const cropSelect        = document.getElementById("scan-crop-select");
  const analyzeBtn         = document.getElementById("scan-analyze-btn");

  const resultEmpty      = document.getElementById("result-empty");
  const resultLoading    = document.getElementById("result-loading");
  const resultError      = document.getElementById("result-error");
  const resultContent    = document.getElementById("result-content");

  const resultDisease     = document.getElementById("result-disease");
  const resultLatin       = document.getElementById("result-latin");
  const resultConfidence  = document.getElementById("result-confidence");
  const resultCrop        = document.getElementById("result-crop");
  const resultSpread      = document.getElementById("result-spread");
  const resultTreatment   = document.getElementById("result-treatment");
  const resultNote        = document.getElementById("result-note");

  let selectedFile = null;

  function showResultState(state) {
    // state: "empty" | "loading" | "error" | "content"
    [resultEmpty, resultLoading, resultError, resultContent].forEach((el) => {
      if (el) el.classList.remove("active");
    });

    const map = {
      empty: resultEmpty,
      loading: resultLoading,
      error: resultError,
      content: resultContent
    };

    if (map[state]) {
      map[state].classList.add("active");
    }
  }

  dropzone.addEventListener("click", () => fileInput.click());

  dropzone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropzone.classList.add("dragover");
  });

  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("dragover");
  });

  dropzone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropzone.classList.remove("dragover");

    if (event.dataTransfer.files.length) {
      handleFile(event.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener("change", () => {
    if (fileInput.files.length) {
      handleFile(fileInput.files[0]);
    }
  });

  function handleFile(file) {
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

    if (!allowedTypes.includes(file.type)) {
      alert("Please choose a JPG, PNG or WEBP image.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      alert("Image must be smaller than 10 MB.");
      return;
    }

    selectedFile = file;

    const reader = new FileReader();

    reader.onload = (event) => {
      previewImg.src = event.target.result;
      previewName.textContent = file.name;

      dropzone.style.display = "none";
      preview.classList.add("active");

      showResultState("empty");
    };

    reader.readAsDataURL(file);
  }

  retakeBtn.addEventListener("click", () => {
    selectedFile = null;
    fileInput.value = "";
    previewImg.src = "";

    preview.classList.remove("active");
    dropzone.style.display = "flex";

    showResultState("empty");
  });

  analyzeBtn.addEventListener("click", async () => {

    if (!selectedFile) {
      alert("Choose a leaf photo first.");
      return;
    }

    showResultState("loading");
    analyzeBtn.disabled = true;

    const formData = new FormData();
    formData.append("image", selectedFile);
    formData.append("crop", cropSelect.value);
    formData.append("field", scanFieldSelect ? scanFieldSelect.value : "");

    try {

      const response = await fetch("/api/analyze", {
        method: "POST",
        body: formData
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Analysis failed.");
      }

      renderResult(data);
      showResultState("content");
      addHistoryRow(data);

    } catch (err) {

      console.error("Analyze error:", err);
      showResultState("error");
      resultError.querySelector("p").textContent = err.message || "Something went wrong reading that result. Try analyzing again.";

    } finally {

      analyzeBtn.disabled = false;

    }

  });

  function renderResult(data) {

    resultDisease.textContent = (data.disease || "").replace(/_/g, " ");
    resultLatin.textContent = data.latin || "";
    resultConfidence.textContent = data.confidence != null ? `${data.confidence}% confidence` : "—";
    resultCrop.textContent = data.crop || "—";
    resultSpread.textContent = data.spread_risk || "—";
    resultNote.textContent = data.note || "";

    resultTreatment.innerHTML = "";
    (data.treatment || []).forEach((step) => {
      const li = document.createElement("li");
      li.textContent = step;
      resultTreatment.appendChild(li);
    });

    if (Array.isArray(data.top5)) {
      console.log("Top 5 predictions:", data.top5);
    }
  }

/* =====================================================
   HISTORY VIEW
   ===================================================== */

   const historyEmpty     = document.getElementById("history-empty");
   const historyTable     = document.getElementById("history-table");
   const historyTableBody = document.getElementById("history-table-body");
   
   function toggleHistoryEmptyState() {
     const hasRows = historyTableBody.children.length > 0;
     historyEmpty.classList.toggle("active", !hasRows);
     historyTable.style.display = hasRows ? "table" : "none";
   }
   
   function buildHistoryRow(scan) {
     const row = document.createElement("tr");
     row.innerHTML = `
       <td>${scan.date}</td>
       <td>${scan.field || "—"}</td>
       <td>${scan.crop || "—"}</td>
       <td>${(scan.disease || "").replace(/_/g, " ")}</td>
       <td>${scan.confidence != null ? scan.confidence + "% confidence" : "—"}</td>
       <td><a href="/api/report/${scan.scan_id}" target="_blank" rel="noopener">Download PDF</a></td>
     `;
     return row;
   }
   
   // Called right after a successful /api/analyze call
   function addHistoryRow(data) {
     const row = buildHistoryRow({
       date: new Date().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }),
       field: data.field,
       crop: data.crop,
       disease: data.disease,
       confidence: data.confidence,
       scan_id: data.scan_id
     });
     historyTableBody.prepend(row);
     toggleHistoryEmptyState();
   }
   
   // Called when the History view is opened, to load past scans from the DB
   async function loadHistory() {
     try {
       const response = await fetch("/api/history");
       const data = await response.json();
       if (!response.ok || !data.success) throw new Error(data.error || "Could not load history.");
   
       historyTableBody.innerHTML = "";
       data.scans.forEach((scan) => historyTableBody.appendChild(buildHistoryRow(scan)));
       toggleHistoryEmptyState();
     } catch (err) {
       console.error("History load error:", err);
     }
   }
   
   document.addEventListener("DOMContentLoaded", loadHistory);
   
   // Adjust this selector to match however your sidebar nav links to the history view
   const historyNavLink = document.querySelector('[data-view-link="history"]');
   if (historyNavLink) historyNavLink.addEventListener("click", loadHistory);
 

  /* =====================================================
     CHAT VIEW
     ===================================================== */
     (function () {
      const chatLog = document.getElementById('chat-log');
      const chatForm = document.getElementById('chat-form');
      const chatTextarea = document.getElementById('chat-textarea');
      const attachBtn = document.getElementById('chat-attach-btn');
      const attachInput = document.getElementById('chat-attach-input');
      const attachChip = document.getElementById('chat-attachment-chip');
      const attachName = document.getElementById('chat-attachment-name');
      const attachRemove = document.getElementById('chat-attachment-remove');
    
      // Holds the extracted text of the currently attached document, if any
      let attachedDocument = null; // { name, content }
    
      // ---------- lightweight markdown renderer ----------
      // Escapes HTML first, then converts a practical subset of Markdown:
      // headers, bold/italic, inline code, fenced code blocks, ul/ol lists,
      // paragraphs, and line breaks — similar to what ChatGPT renders.
      function escapeHtml(str) {
        return str
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
      }
    
      function renderMarkdown(md) {
        if (!md) return '';
    
        // 1. Pull out fenced code blocks first so their contents aren't
        //    touched by other rules, then restore them at the end.
        const codeBlocks = [];
        md = md.replace(/```([\s\S]*?)```/g, (_, code) => {
          codeBlocks.push(code.replace(/^\w*\n/, ''));
          return `\u0000CODEBLOCK${codeBlocks.length - 1}\u0000`;
        });
    
        let html = escapeHtml(md);
    
        // 2. Inline code
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    
        // 3. Headers (### / ## / #)
        html = html.replace(/^###\s?(.*)$/gm, '<h3>$1</h3>');
        html = html.replace(/^##\s?(.*)$/gm, '<h2>$1</h2>');
        html = html.replace(/^#\s?(.*)$/gm, '<h1>$1</h1>');
    
        // 4. Bold and italic
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/(?<!\*)\*(?!\*)(.+?)\*(?!\*)/g, '<em>$1</em>');
    
        // 5. Links [text](url)
        html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
          '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    
        // 6. Lists — group consecutive bullet/numbered lines into <ul>/<ol>
        html = html.replace(/(^|\n)((?:[-*]\s.+\n?)+)/g, (match, lead, block) => {
          const items = block.trim().split('\n')
            .map(line => `<li>${line.replace(/^[-*]\s/, '')}</li>`).join('');
          return `${lead}<ul>${items}</ul>`;
        });
        html = html.replace(/(^|\n)((?:\d+\.\s.+\n?)+)/g, (match, lead, block) => {
          const items = block.trim().split('\n')
            .map(line => `<li>${line.replace(/^\d+\.\s/, '')}</li>`).join('');
          return `${lead}<ol>${items}</ol>`;
        });
    
        // 7. Horizontal rules
        html = html.replace(/^---$/gm, '<hr>');
    
        // 8. Paragraphs — wrap remaining bare lines, skip lines that are
        //    already block-level HTML we just created.
        html = html
          .split(/\n{2,}/)
          .map(block => {
            const trimmed = block.trim();
            if (!trimmed) return '';
            if (/^<(h1|h2|h3|ul|ol|hr|pre)/.test(trimmed)) return trimmed;
            return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`;
          })
          .join('');
    
        // 9. Restore fenced code blocks as <pre><code>
        html = html.replace(/\u0000CODEBLOCK(\d+)\u0000/g, (_, i) =>
          `<pre><code>${escapeHtml(codeBlocks[Number(i)])}</code></pre>`);
    
        return html;
      }
    
      // ---------- helpers ----------
    
      function addMessage(text, sender) {
        const wrapper = document.createElement('div');
        wrapper.className = `msg msg-${sender === 'ai' ? 'ai' : 'user'}`;
    
        const label = document.createElement('span');
        label.className = 'msg-label';
        label.textContent = sender === 'ai' ? 'FieldScan AI' : 'You';
    
        const bubble = document.createElement('div');
        bubble.className = 'bubble';
    
        if (sender === 'ai') {
          // Render AI responses as parsed Markdown for a ChatGPT-style look
          bubble.innerHTML = renderMarkdown(text);
        } else {
          // Keep user input as plain text (avoid HTML injection)
          bubble.textContent = text;
        }
    
        wrapper.appendChild(label);
        wrapper.appendChild(bubble);
        chatLog.appendChild(wrapper);
        chatLog.scrollTop = chatLog.scrollHeight;
        return bubble;
      }
    
      function setAttachmentChip(name) {
        if (name) {
          attachName.textContent = name;
          attachChip.style.display = 'flex';
        } else {
          attachName.textContent = '';
          attachChip.style.display = 'none';
        }
      }
    
      function autoResizeTextarea() {
        chatTextarea.style.height = 'auto';
        chatTextarea.style.height = chatTextarea.scrollHeight + 'px';
      }
    
      // ---------- file attach ----------
    
      attachBtn.addEventListener('click', () => {
        attachInput.click();
      });
    
      attachInput.addEventListener('change', async () => {
        const file = attachInput.files[0];
        if (!file) return;
    
        const formData = new FormData();
        formData.append('file', file);
    
        addMessage(`Uploading "${file.name}"…`, 'ai');
        const statusBubble = chatLog.lastElementChild.querySelector('.bubble');
    
        try {
          const res = await fetch('/upload_document', {
            method: 'POST',
            body: formData
          });
          const data = await res.json();
    
          if (!res.ok || data.error) {
            statusBubble.textContent = `Couldn't read that file: ${data.error || 'unknown error'}`;
            attachedDocument = null;
            setAttachmentChip(null);
            return;
          }
    
          attachedDocument = { name: file.name, content: data.content };
          setAttachmentChip(file.name);
          statusBubble.textContent = `Got it — I've read "${file.name}". Ask me anything about it.`;
        } catch (err) {
          statusBubble.textContent = `Upload failed: ${err.message}`;
          attachedDocument = null;
          setAttachmentChip(null);
        } finally {
          // allow re-selecting the same file later
          attachInput.value = '';
        }
      });
    
      attachRemove.addEventListener('click', () => {
        attachedDocument = null;
        setAttachmentChip(null);
      });
    
      // ---------- sending a message ----------
    
      async function sendPrompt(userText) {
        if (!userText.trim()) return;
    
        addMessage(userText, 'user');
        chatTextarea.value = '';
        autoResizeTextarea();
    
        const thinkingBubble = addMessage('Thinking…', 'ai');
    
        // If a document is attached, give the model context from it
        let finalPrompt = userText;
        if (attachedDocument && attachedDocument.content) {
          finalPrompt =
            `Here is the content of an uploaded document named "${attachedDocument.name}":\n\n` +
            `${attachedDocument.content}\n\n---\n\n` +
            `Based on that document (and general knowledge if relevant), answer this question:\n${userText}`;
        }
    
        try {
          const res = await fetch('/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: finalPrompt })
          });
          const data = await res.json();
    
          if (!res.ok || data.error) {
            thinkingBubble.innerHTML = renderMarkdown(`Error: ${data.error || 'something went wrong'}`);
            return;
          }
    
          thinkingBubble.innerHTML = renderMarkdown(data.response || '(no response)');
        } catch (err) {
          thinkingBubble.innerHTML = renderMarkdown(`Request failed: ${err.message}`);
        }
      }
    
      chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        sendPrompt(chatTextarea.value);
      });
    
      chatTextarea.addEventListener('input', autoResizeTextarea);
    
      chatTextarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          chatForm.requestSubmit();
        }
      });
    
      // ---------- suggested questions ----------
    
      document.querySelectorAll('.suggested-q').forEach((btn) => {
        btn.addEventListener('click', () => {
          sendPrompt(btn.textContent);
        });
      });
    
      // start hidden
      setAttachmentChip(null);
    })();
  


  /* =====================================================
     SETTINGS VIEW — ACCOUNT
     ===================================================== */

  const settingsSaveBtn     = document.getElementById("settings-save-btn");
  const settingsSaveStatus  = document.getElementById("settings-save-status");
  const settingsName        = document.getElementById("settings-name");
  const settingsEmail       = document.getElementById("settings-email");
  const settingsNotify      = document.getElementById("settings-notify");
  const settingsUnits       = document.getElementById("settings-units");
  const settingsDeleteBtn   = document.getElementById("settings-delete-account-btn");

  if (settingsSaveBtn) {
    settingsSaveBtn.addEventListener("click", async () => {

      if (!settingsEmail.value.includes("@")) {
        settingsSaveStatus.textContent = "Enter a valid email.";
        return;
      }

      settingsSaveBtn.disabled = true;
      settingsSaveStatus.textContent = "Saving…";

      try {

        const response = await fetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: settingsName.value,
            email: settingsEmail.value,
            notify: settingsNotify.checked,
            metric_units: settingsUnits.checked
          })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || "Could not save settings.");
        }

        settingsSaveStatus.textContent = "Saved.";

      } catch (err) {

        console.error("Settings save error:", err);
        settingsSaveStatus.textContent = err.message || "Couldn't save — try again.";

      } finally {

        settingsSaveBtn.disabled = false;
        setTimeout(() => { settingsSaveStatus.textContent = ""; }, 3000);

      }

    });
  }


  /* =====================================================
     SETTINGS VIEW — PASSWORD
     ===================================================== */

  const settingsPasswordBtn     = document.getElementById("settings-password-btn");
  const settingsPasswordStatus  = document.getElementById("settings-password-status");
  const settingsCurrentPassword = document.getElementById("settings-current-password");
  const settingsNewPassword     = document.getElementById("settings-new-password");
  const settingsConfirmPassword = document.getElementById("settings-confirm-password");

  if (settingsPasswordBtn) {
    settingsPasswordBtn.addEventListener("click", async () => {

      const current = settingsCurrentPassword.value;
      const next    = settingsNewPassword.value;
      const confirm = settingsConfirmPassword.value;

      if (!current || !next || !confirm) {
        settingsPasswordStatus.textContent = "Fill in all three fields.";
        return;
      }

      if (next.length < 8) {
        settingsPasswordStatus.textContent = "New password must be at least 8 characters.";
        return;
      }

      if (next !== confirm) {
        settingsPasswordStatus.textContent = "New passwords don't match.";
        return;
      }

      settingsPasswordBtn.disabled = true;
      settingsPasswordStatus.textContent = "Updating…";

      try {

        const response = await fetch("/api/settings/password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            current_password: current,
            new_password: next
          })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || "Could not update password.");
        }

        settingsPasswordStatus.textContent = "Password updated.";
        settingsCurrentPassword.value = "";
        settingsNewPassword.value = "";
        settingsConfirmPassword.value = "";

      } catch (err) {

        console.error("Password update error:", err);
        settingsPasswordStatus.textContent = err.message || "Couldn't update — try again.";

      } finally {

        settingsPasswordBtn.disabled = false;
        setTimeout(() => { settingsPasswordStatus.textContent = ""; }, 4000);

      }

    });
  }


  /* =====================================================
     SETTINGS VIEW — BILLING
     ===================================================== */

  const settingsCardBtn     = document.getElementById("settings-card-btn");
  const settingsCardStatus  = document.getElementById("settings-card-status");
  const settingsCardName    = document.getElementById("settings-card-name");
  const settingsCardNumber  = document.getElementById("settings-card-number");
  const settingsCardExpiry  = document.getElementById("settings-card-expiry");
  const settingsCardCvc     = document.getElementById("settings-card-cvc");

  if (settingsCardNumber) {
    settingsCardNumber.addEventListener("input", () => {
      const digits = settingsCardNumber.value.replace(/\D/g, "").slice(0, 16);
      settingsCardNumber.value = digits.replace(/(.{4})/g, "$1 ").trim();
    });
  }

  if (settingsCardExpiry) {
    settingsCardExpiry.addEventListener("input", () => {
      const digits = settingsCardExpiry.value.replace(/\D/g, "").slice(0, 4);
      settingsCardExpiry.value = digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
    });
  }

  if (settingsCardCvc) {
    settingsCardCvc.addEventListener("input", () => {
      settingsCardCvc.value = settingsCardCvc.value.replace(/\D/g, "").slice(0, 4);
    });
  }

  function isValidExpiry(value) {
    const match = /^(\d{2})\/(\d{2})$/.exec(value);
    if (!match) return false;
    const month = parseInt(match[1], 10);
    return month >= 1 && month <= 12;
  }

  if (settingsCardBtn) {
    settingsCardBtn.addEventListener("click", async () => {

      const cardDigits = settingsCardNumber.value.replace(/\s/g, "");

      if (!settingsCardName.value.trim()) {
        settingsCardStatus.textContent = "Enter the name on the card.";
        return;
      }

      if (cardDigits.length < 13 || cardDigits.length > 16) {
        settingsCardStatus.textContent = "Enter a valid card number.";
        return;
      }

      if (!isValidExpiry(settingsCardExpiry.value)) {
        settingsCardStatus.textContent = "Enter expiry as MM/YY.";
        return;
      }

      if (settingsCardCvc.value.length < 3) {
        settingsCardStatus.textContent = "Enter a valid CVC.";
        return;
      }

      settingsCardBtn.disabled = true;
      settingsCardStatus.textContent = "Saving…";

      try {

        // In production this should go straight to a PCI-compliant
        // processor (Stripe, Braintree, etc.) rather than your own
        // backend — send it a one-time token instead of raw card data.
        const response = await fetch("/api/settings/billing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            card_name: settingsCardName.value,
            card_number: cardDigits,
            expiry: settingsCardExpiry.value,
            cvc: settingsCardCvc.value
          })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || "Could not save card.");
        }

        settingsCardStatus.textContent = "Card saved.";
        settingsCardNumber.value = data.last4 ? `•••• •••• •••• ${data.last4}` : "";
        settingsCardCvc.value = "";

      } catch (err) {

        console.error("Billing save error:", err);
        settingsCardStatus.textContent = err.message || "Couldn't save card — try again.";

      } finally {

        settingsCardBtn.disabled = false;
        setTimeout(() => { settingsCardStatus.textContent = ""; }, 4000);

      }

    });
  }


  /* =====================================================
     SETTINGS VIEW — DANGER ZONE
     ===================================================== */

  if (settingsDeleteBtn) {
    settingsDeleteBtn.addEventListener("click", async () => {

      const confirmed = confirm(
        "Delete your account? This removes your scan history and cannot be undone."
      );

      if (!confirmed) return;

      settingsDeleteBtn.disabled = true;

      try {

        const response = await fetch("/api/account", { method: "DELETE" });
        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || "Could not delete account.");
        }

        window.location.href = "/logout";

      } catch (err) {

        console.error("Delete account error:", err);
        alert("Something went wrong deleting your account. Please try again.");
        settingsDeleteBtn.disabled = false;

      }

    });
  }

});
