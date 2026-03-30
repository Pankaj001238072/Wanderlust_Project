document.addEventListener("DOMContentLoaded", () => {
  const toggleBtn = document.getElementById("aiChatToggleBtn");
  const chatWindow = document.getElementById("aiChatWindow");
  const chatBody = document.getElementById("aiChatBody");
  const chatInput = document.getElementById("aiChatInput");
  const sendBtn = document.getElementById("aiChatSendBtn");

  if (!toggleBtn) return;

  // Toggle chat window
  toggleBtn.addEventListener("click", () => {
    chatWindow.classList.toggle("open");
    toggleBtn.classList.toggle("active");
    if (toggleBtn.classList.contains("active")) {
      toggleBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    } else {
      toggleBtn.innerHTML = '<i class="fa-solid fa-robot"></i>';
    }
  });

  // Basic markdown parser for bold and bullet points
  function parseMarkdown(text) {
    let html = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    html = html.replace(/\n\*/g, '<br>•');
    html = html.replace(/\n/g, '<br>');
    return html;
  }

  function appendMessage(text, isUser = false) {
    const bubble = document.createElement("div");
    bubble.className = `chat-bubble ${isUser ? 'chat-bubble-user' : 'chat-bubble-ai'}`;
    bubble.innerHTML = isUser ? text : parseMarkdown(text);
    chatBody.appendChild(bubble);
    chatBody.scrollTop = chatBody.scrollHeight;
  }

  function appendTyping() {
    const bubble = document.createElement("div");
    bubble.className = "chat-bubble chat-bubble-ai chat-typing-indicator";
    bubble.innerHTML = `<div class="chat-typing"><span></span><span></span><span></span></div>`;
    chatBody.appendChild(bubble);
    chatBody.scrollTop = chatBody.scrollHeight;
    return bubble;
  }

  async function sendMessage() {
    const message = chatInput.value.trim();
    if (!message) return;

    appendMessage(message, true);
    chatInput.value = "";
    
    const typingIndicator = appendTyping();

    try {
      const csrfTokenMeta = document.querySelector('meta[name="csrf-token"]');
      const csrfToken = csrfTokenMeta ? csrfTokenMeta.getAttribute("content") : "";
      
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "CSRF-Token": csrfToken
        },
        body: JSON.stringify({ message })
      });

      const data = await response.json();
      typingIndicator.remove();

      if (response.ok) {
        appendMessage(data.reply);
      } else {
        appendMessage(data.error || "An error occurred. Please try again.");
      }
    } catch (err) {
      typingIndicator.remove();
      appendMessage("Unable to connect to the server. Please check your internet connection.");
    }
  }

  sendBtn.addEventListener("click", sendMessage);
  chatInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendMessage();
  });
});
