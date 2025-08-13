/* static/app.js */
"use strict";

(function () {
  let documentCount = 0;
  let isLoading = false;

  const analysisQueries = {
    "risk-assessment": "Identify and analyze all potential legal risks, liability exposures, and areas of concern",
    "dispute-clauses": "Extract and analyze all dispute resolution mechanisms, arbitration clauses, and mediation provisions",
    "ip-confidentiality": "Analyze intellectual property rights, confidentiality provisions, and proprietary information clauses",
    "financial-terms": "Review payment obligations, penalties, damages, and financial risk provisions",
    "termination-rights": "Analyze termination conditions, notice requirements, and post-termination obligations",
    "jurisdiction-law": "Identify governing law, jurisdiction clauses, and cross-border legal considerations"
  };

  function formatMarkdown(text) {
    let formatted = text || "";
    
    // Convert line breaks to HTML first
    formatted = formatted.replace(/\n/g, '<br>');
    
    // Headers - only convert clear header patterns
    formatted = formatted.replace(/(^|<br>)### ([^<]+?)(<br>|$)/g, '$1<h3 style="margin: 1.5rem 0 0.5rem 0; color: #333; font-size: 1.2rem;">$2</h3>$3');
    formatted = formatted.replace(/(^|<br>)## ([^<]+?)(<br>|$)/g, '$1<h2 style="margin: 1.5rem 0 0.5rem 0; color: #333; font-size: 1.4rem;">$2</h2>$3');
    formatted = formatted.replace(/(^|<br>)# ([^<]+?)(<br>|$)/g, '$1<h1 style="margin: 1.5rem 0 0.5rem 0; color: #333; font-size: 1.6rem;">$2</h1>$3');
    
    // Bold text - more conservative approach
    formatted = formatted.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
    
    // Italic text - conservative
    formatted = formatted.replace(/\*([^*\s][^*]*?[^*\s])\*/g, '<em>$1</em>');
    
    // Bullet points - only convert actual intentional lists using flexbox
    const bulletPattern = /((?:(?:^|<br>)- [^<\n]+?(?=<br>|$))+)/gm;
    formatted = formatted.replace(bulletPattern, function(listMatch) {
      const items = listMatch.split(/<br>/).filter(item => item.trim().startsWith('- '));
      if (items.length < 2) return listMatch; // Don't convert single items
      
      let listHtml = '<div style="margin: 0.5rem 0;">';
      items.forEach(item => {
        const content = item.replace(/^- /, '').trim();
        if (content) {
          listHtml += `<div style="display: flex; margin: 0.25rem 0; line-height: 1.5;">
            <span style="margin-right: 0.5rem; flex-shrink: 0;">•</span>
            <span style="flex: 1;">${content}</span>
          </div>`;
        }
      });
      listHtml += '</div>';
      
      return listMatch.replace(bulletPattern, listHtml);
    });
    
    return formatted;
  }

  function addMessage(role, content, loading, sources, chunks) {
    loading = !!loading;
    sources = sources || [];
    chunks = chunks || 0;

    const messagesContainer = document.getElementById("messagesContainer");
    const messageDiv = document.createElement("div");
    messageDiv.className = "message " + role;

    const contentDiv = document.createElement("div");
    contentDiv.className = "message-content" + (loading ? " loading" : "");

    if (role === "assistant" && !loading) {
      contentDiv.innerHTML = formatMarkdown(content);
    } else {
      contentDiv.innerHTML = (content || "").replace(/\n/g, "<br>");
    }

    if (sources && sources.length > 0) {
      const sourcesDiv = document.createElement("div");
      sourcesDiv.className = "message-sources";
      sourcesDiv.textContent = "Sources: " + sources.join(", ") + " - Retrieved " + chunks + " sections";
      contentDiv.appendChild(sourcesDiv);
    }

    messageDiv.appendChild(contentDiv);
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  function setLoading(loading) {
    isLoading = loading;
    const sendButton = document.getElementById("sendButton");
    const messageInput = document.getElementById("messageInput");
    sendButton.disabled = loading;
    messageInput.disabled = loading;
  }

  async function handleFileUpload(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const formData = new FormData();
    for (let i = 0; i < files.length; i++) formData.append("files", files[i]);

    try {
      const uploadButton = document.getElementById("uploadButton");
      uploadButton.textContent = "Processing...";
      uploadButton.disabled = true;

      const response = await fetch("/api/upload", { method: "POST", body: formData });
      const results = await response.json();

      const successCount = results.filter(r => r.status === "success").length;
      addMessage("system", "Successfully processed " + successCount + " document" + (successCount !== 1 ? "s" : ""));

      await loadDocumentSummary();
    } catch (err) {
      console.error("Upload error:", err);
      addMessage("system", "Error uploading documents. Please try again.");
    } finally {
      const uploadButton = document.getElementById("uploadButton");
      uploadButton.textContent = "Upload Legal Documents";
      uploadButton.disabled = false;
      document.getElementById("fileInput").value = "";
    }
  }

  async function sendMessage(message) {
    const input = document.getElementById("messageInput");
    const text = (message || input.value || "").trim();
    if (!text || isLoading) return;

    addMessage("user", text);
    input.value = "";

    setLoading(true);
    addMessage("assistant", "Analyzing your legal documents...", true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text })
      });
      const data = await response.json();

      // Remove loading bubble
      const messages = document.getElementById("messagesContainer");
      const last = messages.lastElementChild;
      if (last && last.querySelector(".loading")) messages.removeChild(last);

      addMessage("assistant", data.response, false, data.sources, data.retrieved_chunks);
    } catch (err) {
      console.error("Chat error:", err);
      const messages = document.getElementById("messagesContainer");
      const last = messages.lastElementChild;
      if (last && last.querySelector(".loading")) messages.removeChild(last);
      addMessage("assistant", "Sorry, I encountered an error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function loadDocumentSummary() {
    try {
      const response = await fetch("/api/documents/summary");
      const summary = await response.json();

      documentCount = summary.total_chunks || 0;
      
      // Show Quick Analysis in sidebar when documents are loaded
      const quickAnalysis = document.getElementById("quickAnalysis");
      if (documentCount > 0) {
        quickAnalysis.classList.remove("hidden");
        console.log("Showing quick analysis - document count:", documentCount);
      } else {
        quickAnalysis.classList.add("hidden");
        console.log("Hiding quick analysis - no documents");
      }
    } catch (err) {
      console.error("Error loading document summary:", err);
    }
  }

  async function clearDocuments() {
    try {
      await fetch("/api/documents", { method: "DELETE" });
      document.getElementById("messagesContainer").innerHTML = "";
      await loadDocumentSummary();
    } catch (err) {
      console.error("Error clearing documents:", err);
    }
  }

  // Make quickAnalysis available to buttons in HTML
  window.quickAnalysis = function (type) {
    const query = analysisQueries[type];
    if (query) sendMessage(query);
  };

  // Init
  document.addEventListener("DOMContentLoaded", function () {
    console.log("DOM loaded, setting up event listeners...");

    const uploadButton = document.getElementById("uploadButton");
    const fileInput = document.getElementById("fileInput");
    const sendButton = document.getElementById("sendButton");
    const messageInput = document.getElementById("messageInput");

    uploadButton.addEventListener("click", function (e) {
      e.preventDefault();
      fileInput.click();
    });

    fileInput.addEventListener("change", handleFileUpload);

    sendButton.addEventListener("click", function (e) {
      e.preventDefault();
      sendMessage();
    });

    messageInput.addEventListener("keypress", function (e) {
      if (e.key === "Enter" && !isLoading) sendMessage();
    });

    document.addEventListener("click", function (e) {
      if (e.target && e.target.id === "clearButton") clearDocuments();
    });

    // Ensure enabled
    messageInput.disabled = false;
    sendButton.disabled = false;

    // Optional: quick health check
    fetch("/api/health").then(r => r.json()).then(console.log).catch(console.error);

    loadDocumentSummary();
  });
})();
