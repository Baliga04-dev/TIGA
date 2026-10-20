import { defineConfig, devices } from '@playwright/test'

const API_PORT = 8765
const WEB_PORT = 3100

// The backend runs with every integration switched off so tests never touch Gmail, GitHub or an LLM.
const isolatedEnv = {
  PORT: String(API_PORT),
  OPENAI_API_KEY: '',
  ELEVENLABS_API_KEY: '',
  METRICS_ENDPOINT: '',
  BOOKING_WEBHOOK: '',
  GITHUB_TOKEN: '',
  GITHUB_SYNC_INTERVAL_MINUTES: '0',
  GMAIL_CREDENTIALS_FILE: '/nonexistent/credentials.json',
  GMAIL_TOKEN_FILE: '/nonexistent/token.json',
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 5'] }, testMatch: /responsive\.spec\.ts/ },
  ],
  webServer: [
    {
      command: '../tiga/.venv/bin/python main.py',
      cwd: '../tiga',
      url: `http://127.0.0.1:${API_PORT}/api/status`,
      env: isolatedEnv,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'npx vite --host 127.0.0.1',
      url: `http://localhost:${WEB_PORT}`,
      env: { TIGA_API_URL: `http://127.0.0.1:${API_PORT}`, TIGA_WEB_PORT: String(WEB_PORT) },
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
})
