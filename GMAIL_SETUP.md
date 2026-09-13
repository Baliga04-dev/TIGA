# Gmail API Setup Guide for TIGA Email Bot

## Quick Start

### 1. Create Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing
3. Note your Project ID

### 2. Enable Gmail API
1. Navigate to **APIs & Services** → **Library**
2. Search for "Gmail API"
3. Click **Enable**

### 3. Configure OAuth Consent Screen
1. Go to **APIs & Services** → **OAuth consent screen**
2. Choose **External** user type
3. Fill required fields:
   - App name: "TIGA Email Bot"
   - User support email: your email
   - Developer contact: your email
4. Save and continue through scopes (no additional scopes needed)
5. Add test users: add `ymitigaa@gmail.com`
6. Save and continue

### 4. Create OAuth 2.0 Credentials
1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. Application type: **Desktop app**
4. Name: "TIGA Desktop Client"
5. Click **Create**
6. **Download the JSON file**
7. Rename it to `credentials.json`
8. Place it in the `tiga/` directory:
   ```
   tiga/
   ├── credentials.json    ← HERE
   ├── main.py
   ├── gmail_service.py
   └── ...
   ```

### 5. Configure Environment
1. Copy `.env.example` to `.env` in the `tiga/` directory:
   ```bash
   cd tiga
   cp .env.example .env
   ```
2. Edit `.env` and ensure:
   ```env
   GMAIL_CREDENTIALS_FILE=credentials.json
   GMAIL_TOKEN_FILE=token.json
   GMAIL_USER_EMAIL=ymitigaa@gmail.com
   ```

### 6. First Authentication
1. Start the backend:
   ```bash
   cd tiga
   python main.py
   ```
2. Browser will open automatically for OAuth authorization
3. Sign in with `ymitigaa@gmail.com`
4. Grant permissions
5. Token will be saved to `token.json` automatically

### 7. Verify Connection
1. Start both backend and frontend:
   ```bash
   # Terminal 1 - Backend
   cd tiga
   python main.py

   # Terminal 2 - Frontend
   cd frontend
   npm install
   npm run dev
   ```
2. Open http://localhost:3000
3. Go to **Settings** page
4. Click **Test Connection** - should show success

## Troubleshooting

### "Credentials file not found"
- Ensure `credentials.json` is in `tiga/` directory
- Check `.env` has `GMAIL_CREDENTIALS_FILE=credentials.json`

### "Redirect URI mismatch"
- In Google Cloud Console → Credentials → Your OAuth client
- Add `http://localhost:8080` to Authorized redirect URIs
- Or use the port shown in terminal during auth

### "Access blocked: Authorization Error"
- Add `ymitigaa@gmail.com` as test user in OAuth consent screen
- Or publish the app (requires verification)

### Token expired
- Delete `token.json` and restart backend
- Re-authorize in browser

## Scopes Used
The app requests these Gmail scopes:
- `gmail.readonly` - Read emails
- `gmail.send` - Send emails
- `gmail.modify` - Mark as read, archive, etc.

## Security Notes
- `credentials.json` and `token.json` are in `.gitignore`
- Never commit these files
- Token refreshes automatically when expired
- For production, consider using a service account with domain-wide delegation

## Testing Commands

Once set up, try these in Tiga Chat:
- "Check my email summary for today"
- "Fetch recent emails from last 3 days"
- "Generate a cold email template for web development"
- "Send a cold email to client@example.com with subject 'Proposal'"

Or use the Email Bot UI at `/email` page.