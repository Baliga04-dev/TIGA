// Tiga Bridge: a WebSocket to Tiga on this machine. Tiga sends one command at a time; we answer with its id.
// Only these commands exist; anything else is refused. Tiga decides what needs the owner's click.
const DEFAULT_SERVER = "ws://127.0.0.1:8000/ws/bridge";
let socket = null;

async function settings() {
  const { token = "", server = DEFAULT_SERVER } = await chrome.storage.local.get(["token", "server"]);
  return { token, server };
}

async function connect() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
  const { token, server } = await settings();
  if (!token || !server.startsWith("ws://127.0.0.1:")) return; // local only
  socket = new WebSocket(`${server}?token=${encodeURIComponent(token)}`);
  socket.onopen = () => chrome.storage.local.set({ status: "connected" });
  socket.onclose = () => { socket = null; chrome.storage.local.set({ status: "disconnected" }); };
  socket.onerror = () => {};
  socket.onmessage = async (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }
    try {
      const result = await handle(msg.cmd, msg.args || {});
      socket?.send(JSON.stringify({ id: msg.id, result }));
    } catch (error) {
      socket?.send(JSON.stringify({ id: msg.id, error: String(error && error.message || error) }));
    }
  };
}

async function handle(cmd, args) {
  if (cmd === "list_tabs") {
    const tabs = await chrome.tabs.query({});
    return { tabs: tabs.map((t) => ({ id: t.id, title: t.title || "", url: t.url || "", active: t.active && isFocusedWindow(t), windowId: t.windowId })) };
  }
  if (cmd === "activate") {
    const tab = await chrome.tabs.update(Number(args.tabId), { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
    return { ok: true };
  }
  if (cmd === "close") {
    await chrome.tabs.remove((args.tabIds || []).map(Number));
    return { ok: true };
  }
  if (cmd === "read") {
    const tabId = Number(args.tabId);
    const tab = await chrome.tabs.get(tabId);
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => (document.body ? document.body.innerText : "").slice(0, 20000),
    });
    return { title: tab.title || "", url: tab.url || "", text: result || "" };
  }
  throw new Error(`unknown command ${cmd}`);
}

let focusedWindowId = null;
chrome.windows.onFocusChanged.addListener((id) => { if (id !== chrome.windows.WINDOW_ID_NONE) focusedWindowId = id; });
function isFocusedWindow(tab) { return focusedWindowId === null || tab.windowId === focusedWindowId; }

// Keep the link up: reconnect on start, on settings change, and every 30 seconds; ping to stay awake.
chrome.runtime.onStartup.addListener(connect);
chrome.runtime.onInstalled.addListener(connect);
chrome.storage.onChanged.addListener((changes) => { if (changes.token || changes.server) { socket?.close(); connect(); } });
chrome.alarms.create("tiga-keepalive", { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(() => {
  if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "ping" }));
  else connect();
});
connect();
