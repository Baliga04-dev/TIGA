import { existsSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig, devices } from '@playwright/test'

// Optional: Chromium libraries unpacked without sudo (see README, "Browser tests").
const userLibs = join(homedir(), '.local/chromium-libs/root/usr/lib/x86_64-linux-gnu')
if (existsSync(userLibs)) process.env.LD_LIBRARY_PATH = `${userLibs}:${process.env.LD_LIBRARY_PATH ?? ''}`

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
  TIGA_AI_PROVIDER: 'off', // never spend the owner's Claude limits from browser tests
  TIGA_ANALYST_TICK_MINUTES: '0',
  TIGA_ROUTINE_TICK_SECONDS: '0',
  TIGA_LEARN_ENABLED: '',
  TIGA_DB_PATH: join(tmpdir(), `tiga-e2e-${process.pid}.db`),
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
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /responsive\.spec\.ts/ },
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
