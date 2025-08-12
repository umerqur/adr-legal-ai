/* static/app.js */
"use strict";

(function () {
  let documentCount = 0;
  let isLoading = false;

  const analysisQueries = {
    "contract-summary": "Provide a comprehensive summary of all contractual obligations, key terms, and critical provisions",
    "risk-assessment": "Identify and analyze all potential legal risks, liability exposures, and areas of concern",
    "dispute-clauses": "Extract and analyze all dispute resolution mechanisms, arbitration clauses, and mediation provisions",
    "critical-dates": "Identify all important dates, deadlines, termination dates, and time-sensitive obligations",
    "ip-confidentiality": "Analyze intellectual property rights, confidentiality provisions, and proprietary information clauses",
    "financial-terms": "Review payment obligations, penalties, damages, and financial risk provisions",
    "termination-rights": "Analyze termination conditions, notice requirements, and post-termination obligations",
    "jurisdiction-law": "Identify governing law, jurisdiction clauses, and cross-border legal considerations"
  };

  function formatMarkdown(text) {
    let formatted = text || "";
    const lines = formatted.split("\n");
    const result = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.indexOf("### ") === 0) result.push("<h3>" + line.substring(4) + "</h3>");
      else if (line.indexOf("## ") === 0) result.push("<h2>" + line.substring(3) + "</h2>");
      else if (line.indexOf("# ") === 0) result.push("<h1>" + line.substring(2) + "</h1>");
      else if (line.indexOf("- ") === 0) result.push("<li>" + line.substring(2) + "</li>");
      else result.push(line);
    }

    formatted = result.join("<br>");

    // Simple bold replacement
    while (formatted.indexOf("**") !== -1) {
      const start = formatted.indexOf("**");
      const end = formatted.indexOf("**", start + 2);
      if (end === -1) break;
      const before = formatted.substring(0, start);
      const bold = formatted.substring(start + 2, end);
      const after = formatted.substring(end + 2);
      formatted = before + "<strong>" + bold + "</strong>" + after;
    }
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
      addMessage("system", "Successfully processed " + successCount + " documents");

      await loadDocumentSummary();
    } catch (err) {
      console.error("Upload error:", err);
      addMessage("system", "Error uploading documents. Please try again.");
    } finally {
      const uploadButton = document.getElementById("uploadButton");
      uploadButton.textContent = "Upload Documents";
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
      document.getElementById("chunksCount").textContent = summary.total_chunks || 0;
      document.getElementById("filesCount").textContent = (summary.unique_files || []).length;

      const filesList = document.getElementById("filesList");
      filesList.innerHTML = "<strong>Loaded Documents:</strong>";
      (summary.unique_files || []).forEach(name => {
        const div = document.createElement("div");
        div.textContent = name;
        filesList.appendChild(div);
      });

      const documentLibrary = document.getElementById("documentLibrary");
      const quickAnalysis = document.getElementById("quickAnalysis");
      if (documentCount > 0) {
        documentLibrary.classList.remove("hidden");
        quickAnalysis.classList.remove("hidden");
      } else {
        documentLibrary.classList.add("hidden");
        quickAnalysis.classList.add("hidden");
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
