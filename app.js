/* static/app.js */
"use strict";

(function () {
  let documentCount = 0;
  let isLoading = false;

  const analysisQueries = {
    "contract-summary": "Provide a comprehensive summary of the key terms, parties, and main provisions of this contract",
    "risk-assessment": "Identify and analyze all potential legal risks, liability exposures, and areas of concern",
    "dispute-clauses": "Extract and analyze all dispute resolution mechanisms, arbitration clauses, and mediation provisions",
    "critical-dates": "Identify all important dates, deadlines, milestones, and time-sensitive obligations",
    "ip-confidentiality": "Analyze intellectual property rights, confidentiality provisions, and proprietary information clauses",
    "financial-terms": "Review payment obligations, penalties, damages, and financial risk provisions",
    "termination-rights": "Analyze termination conditions, notice requirements, and post-termination obligations",
    "jurisdiction-law": "Identify governing law, jurisdiction clauses, and cross-border legal considerations"
  };

  function formatMarkdown(text) {
    let formatted = text || "";
    
    // Convert line breaks to HTML first
    formatted = formatted.replace(/\n/g, '<br>');
    
    // Table detection - completely rewritten to handle various formats
    // Look for any lines that have multiple | characters
    formatted = formatted.replace(/(<br>.*?\|.*?\|.*?<br>)+/g, function(tableMatch) {
      const lines = tableMatch.split('<br>').filter(line => {
        const pipeCount = (line.match(/\|/g) || []).length;
        return line.trim() && pipeCount >= 2;
      });
      
      if (lines.length < 2) return tableMatch;
      
      let tableHtml = '<table style="border-collapse: collapse; width: 100%; margin: 1rem 0; border: 1px solid #ddd; font-size: 0.9rem;">';
      let headerProcessed = false;
      
      lines.forEach((line, index) => {
        // Skip lines that are just separators
        if (line.includes('---') || line.includes('===')) return;
        
        // Split by | and clean up cells
        let cells = line.split('|').map(cell => cell.trim()).filter(cell => cell);
        
        // Skip if we don't have enough cells
        if (cells.length < 2) return;
        
        const isHeader = !headerProcessed;
        const tag = isHeader ? 'th' : 'td';
        const style = isHeader ? 
          'style="background: #8B1538; color: white; font-weight: bold; padding: 0.75rem; border: 1px solid #ddd; text-align: left;"' :
          'style="padding: 0.75rem; border: 1px solid #ddd; vertical-align: top;"';
        
        tableHtml += '<tr>';
        cells.forEach(cell => {
          tableHtml += `<${tag} ${style}>${cell}</${tag}>`;
        });
        tableHtml += '</tr>';
        
        if (isHeader) headerProcessed = true;
      });
      
      tableHtml += '</table>';
      return tableHtml;
    });
    
    // Headers
    formatted = formatted.replace(/### (.*?)(<br>|$)/g, '<h3>$1</h3>');
    formatted = formatted.replace(/## (.*?)(<br>|$)/g, '<h2>$1</h2>');
    formatted = formatted.replace(/# (.*?)(<br>|$)/g, '<h1>$1</h1>');
    
    // Bold text
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Italic text
    formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // Bullet points - only convert actual bullet lists (lines that start with "- " after line breaks)
    formatted = formatted.replace(/(^|<br>)- ([^-].*?)(?=<br>|$)/gm, function(match, prefix, content) {
      return prefix + '<li>' + content + '</li>';
    });
    
    // Wrap consecutive list items in ul tags
    formatted = formatted.replace(/(<li>.*?<\/li>)+/g, function(match) {
      return '<ul>' + match + '</ul>';
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
    if (query) {
      console.log("Quick analysis triggered:", type, "->", query);
      sendMessage(query);
    } else {
      console.error("No query found for analysis type:", type);
    }
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
