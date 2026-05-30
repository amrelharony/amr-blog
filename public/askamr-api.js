// askamr-api.js — window._AskAmrAPI consumed by mascot-assistant.js.
// Server-backed chat: streams from /api/chat (OpenClaw SSE) with server-side KB context.
// Auth is the visitor's anonymous Supabase session (cookie), ensured via window._ensureChatAuth
// which the <Mascot> client component installs before this script loads.
(function () {
  "use strict";

  var MAX_HISTORY = 10;
  var LS_HISTORY = "amr_chat_history";

  var TOPICS = [
    "career", "certifications", "skills", "book", "fintech", "agile", "data",
    "conferences", "mentoring", "education", "testimonials", "impact", "contact",
    "organizations", "digital transformation",
  ];

  var CAT_FOLLOW_UPS = {
    identity: ["career journey", "certifications", "book", "mentoring"],
    career: ["certifications", "education", "skills", "conferences"],
    cert: ["agile", "career", "education", "data"],
    book: ["conferences", "mentoring", "testimonials", "writing process"],
    conf: ["book", "fintech", "career", "speaking"],
    skill: ["certifications", "career", "data", "agile"],
    mentor: ["testimonials", "book session", "contact", "impact"],
    contact: ["mentoring", "linkedin", "career", "speaking"],
    testimonial: ["mentoring", "career", "book", "leadership"],
    edu: ["certifications", "career", "digital transformation", "skills"],
    impact: ["career", "mentoring", "certifications", "conferences"],
    org: ["career", "fintech", "community", "banking"],
  };

  var _history = [];
  try {
    var saved = JSON.parse(localStorage.getItem(LS_HISTORY) || "[]");
    if (Array.isArray(saved)) _history = saved.slice(-MAX_HISTORY * 2);
  } catch (e) {}

  function _saveHistory() {
    try {
      localStorage.setItem(LS_HISTORY, JSON.stringify(_history.slice(-MAX_HISTORY * 2)));
    } catch (e) {}
  }

  function getFollowUps(cats) {
    var all = {};
    (cats || []).forEach(function (c) {
      (CAT_FOLLOW_UPS[c] || []).forEach(function (f) { all[f] = 1; });
    });
    return Object.keys(all).slice(0, 4);
  }

  function _parseRateLimit(headers) {
    API.rateLimits = {
      daily: parseInt(headers.get("x-ratelimit-daily") || "0", 10),
      dailyMax: parseInt(headers.get("x-ratelimit-daily-max") || "25", 10),
      weekly: parseInt(headers.get("x-ratelimit-weekly") || "0", 10),
      weeklyMax: parseInt(headers.get("x-ratelimit-weekly-max") || "100", 10),
      monthly: parseInt(headers.get("x-ratelimit-monthly") || "0", 10),
      monthlyMax: parseInt(headers.get("x-ratelimit-monthly-max") || "300", 10),
    };
  }

  // Build a mascot-compatible result ({matches:[{entry:{cat}}]}) from the X-KB-Cats header.
  function _resultFromCats(catsHeader) {
    var cats = (catsHeader || "").split(",").map(function (c) { return c.trim(); }).filter(Boolean);
    return { matches: cats.map(function (c) { return { entry: { cat: c } }; }), confidence: "good", topScore: 0 };
  }

  async function streamChat(q, onChunk, onDone, onError) {
    if (window._ensureChatAuth) {
      try { await window._ensureChatAuth(); } catch (e) {}
    }

    var historyForApi = _history.slice(-MAX_HISTORY);
    var controller = new AbortController();
    var timeoutId = setTimeout(function () { controller.abort(); }, 35000);

    try {
      var res = await fetch("/api/chat", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: String(q).slice(0, 500), history: historyForApi }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      _parseRateLimit(res.headers);

      if (res.status === 429) { if (onError) onError(new Error("rate_limited")); return; }
      if (res.status === 401) { API.serverAvailable = false; if (onError) onError(new Error("auth_required")); return; }
      if (res.status === 503 || res.status === 502) { API.serverAvailable = false; if (onError) onError(new Error("server_unavailable")); return; }
      if (!res.ok || !res.body) { if (onError) onError(new Error("server_error_" + res.status)); return; }

      var result = _resultFromCats(res.headers.get("x-kb-cats"));
      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var fullText = "";
      var tokenCount = 0;
      var buffer = "";
      var t0 = (performance && performance.now) ? performance.now() : Date.now();

      while (true) {
        var chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        var lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (var i = 0; i < lines.length; i++) {
          var line = lines[i].trim();
          if (!line || line.indexOf("data: ") !== 0) continue;
          var data = line.slice(6);
          if (data === "[DONE]") continue;
          try {
            var parsed = JSON.parse(data);
            var content = parsed.choices && parsed.choices[0] && parsed.choices[0].delta && parsed.choices[0].delta.content;
            if (content) {
              fullText += content;
              tokenCount++;
              if (onChunk) onChunk(fullText, tokenCount);
            }
          } catch (e) {}
        }
      }

      var elapsed = (((performance && performance.now) ? performance.now() : Date.now()) - t0) / 1000;
      var tokPerSec = elapsed > 0 ? Math.round(tokenCount / elapsed) : 0;

      _history.push({ role: "user", content: String(q) });
      _history.push({ role: "assistant", content: fullText });
      if (_history.length > MAX_HISTORY * 2) _history = _history.slice(-MAX_HISTORY * 2);
      _saveHistory();

      API.serverAvailable = true;
      if (onDone) onDone(fullText, result, { tokenCount: tokenCount, tokPerSec: tokPerSec, model: "GLM-5.1", source: "server" });
    } catch (err) {
      clearTimeout(timeoutId);
      API.serverAvailable = false;
      if (onError) onError(err && err.name === "AbortError" ? new Error("server_timeout") : err);
    }
  }

  // Client KB fallback (KB lives on the server now → generic graceful answer + topic chips).
  function matchQuery() {
    return {
      confidence: "low",
      matches: [
        {
          entry: {
            cat: "",
            answer:
              "I couldn't reach the AI just now. Try a topic below, or ask again in a moment!",
          },
        },
      ],
      topScore: 0,
    };
  }

  function clearHistory() {
    _history = [];
    _saveHistory();
  }

  var API = {
    __real: true,
    TOPICS: TOPICS,
    rateLimits: null,
    serverAvailable: true,
    llmReady: false,
    llmLoading: false,
    getFollowUps: getFollowUps,
    clearHistory: clearHistory,
    matchQuery: matchQuery,
    streamChat: streamChat,
  };

  window._AskAmrAPI = API;
})();
