const token = document.getElementById("token");
const server = document.getElementById("server");
const status = document.getElementById("status");
chrome.storage.local.get(["token", "server", "status"]).then((s) => {
  token.value = s.token || "";
  if (s.server) server.value = s.server;
  status.textContent = s.status === "connected" ? "Connected to Tiga." : "Not connected yet.";
});
document.getElementById("save").addEventListener("click", async () => {
  if (!server.value.startsWith("ws://127.0.0.1:")) { status.textContent = "The address must start with ws://127.0.0.1:"; return; }
  await chrome.storage.local.set({ token: token.value.trim(), server: server.value.trim() });
  status.textContent = "Saved. Connecting...";
  setTimeout(async () => {
    const s = await chrome.storage.local.get("status");
    status.textContent = s.status === "connected" ? "Connected to Tiga." : "Not connected: is Tiga running, and is the token right?";
  }, 1500);
});
