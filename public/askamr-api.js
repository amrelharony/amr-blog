// askamr-api.js — window._AskAmrAPI contract consumed by mascot-assistant.js.
// M6 STUB: keeps the chat panel functional (non-crashing) until the server-backed
// implementation (M7: /api/chat SSE + server-side KB) replaces streamChat/matchQuery.
(function () {
  "use strict";
  if (window._AskAmrAPI && window._AskAmrAPI.__real) return;

  var TOPICS = [
    "Who is Amr?",
    "What do you write about?",
    "Latest articles",
    "How to subscribe",
    "Contact",
    "About this blog",
  ];

  window._AskAmrAPI = {
    __real: false,
    TOPICS: TOPICS,
    rateLimits: null,
    serverAvailable: false,
    llmReady: false,
    llmLoading: true,
    getFollowUps: function () {
      return [];
    },
    clearHistory: function () {},
    matchQuery: function () {
      return {
        answer:
          "I'm still warming up — the chat brain is being connected. Please try again in a moment!",
        source: "kb",
        topics: [],
        followUps: [],
      };
    },
    streamChat: function (q, onChunk, onDone, onError) {
      try {
        var msg =
          "I'm still warming up — the chat brain is being connected. Please try again in a moment!";
        if (typeof onChunk === "function") onChunk(msg, 1);
        if (typeof onDone === "function")
          onDone(msg, { topics: [], followUps: [] }, { source: "kb", tokPerSec: 0 });
      } catch (e) {
        if (typeof onError === "function") onError(e);
      }
    },
  };
})();
