import base64
import json
import os
import re
from datetime import datetime, timedelta
from email.utils import parseaddr
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any

from bs4 import BeautifulSoup
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

import config

SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.modify",
]

class GmailService:
    def __init__(self):
        self.service = None
        self._authenticated = False

    def authenticate(self) -> bool:
        """Authenticate with Gmail API using OAuth2."""
        creds = None

        if os.path.exists(config.GMAIL_TOKEN_FILE):
            creds = Credentials.from_authorized_user_file(config.GMAIL_TOKEN_FILE, SCOPES)

        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                try:
                    creds.refresh(Request())
                except Exception:
                    creds = None
            if not creds:
                if not os.path.exists(config.GMAIL_CREDENTIALS_FILE):
                    raise FileNotFoundError(
                        f"Credentials file not found: {config.GMAIL_CREDENTIALS_FILE}. "
                        "Download from Google Cloud Console."
                    )
                flow = InstalledAppFlow.from_client_secrets_file(
                    config.GMAIL_CREDENTIALS_FILE, SCOPES
                )
                creds = flow.run_local_server(port=0)

            with open(config.GMAIL_TOKEN_FILE, "w") as token:
                token.write(creds.to_json())

        try:
            self.service = build("gmail", "v1", credentials=creds)
            self._authenticated = True
            return True
        except Exception as e:
            print(f"Gmail authentication failed: {e}")
            return False

    def _ensure_authenticated(self):
        if not self._authenticated:
            if not self.authenticate():
                raise RuntimeError("Gmail authentication failed")

    def send_email(
        self,
        to: str,
        subject: str,
        body: str,
        cc: str = "",
        bcc: str = "",
        is_html: bool = False,
    ) -> dict:
        """Send an email via Gmail API."""
        self._ensure_authenticated()

        message = MIMEMultipart("alternative")
        message["to"] = to
        message["subject"] = subject
        if cc:
            message["cc"] = cc
        if bcc:
            message["bcc"] = bcc
        message["from"] = config.GMAIL_USER_EMAIL

        if is_html:
            message.attach(MIMEText(body, "html"))
        else:
            message.attach(MIMEText(body, "plain"))

        raw = base64.urlsafe_b64encode(message.as_bytes()).decode()

        try:
            sent = (
                self.service.users()
                .messages()
                .send(userId="me", body={"raw": raw})
                .execute()
            )
            return {"ok": True, "message_id": sent.get("id"), "thread_id": sent.get("threadId")}
        except HttpError as e:
            return {"ok": False, "error": str(e)}

    def fetch_emails(
        self,
        query: str = "",
        max_results: int = 50,
        label_ids: list = None,
    ) -> list:
        """Fetch emails matching query."""
        self._ensure_authenticated()

        if label_ids is None:
            label_ids = ["INBOX"]

        try:
            results = (
                self.service.users()
                .messages()
                .list(userId="me", q=query, maxResults=max_results, labelIds=label_ids)
                .execute()
            )
            messages = results.get("messages", [])

            emails = []
            for msg in messages:
                email_data = self._get_message_details(msg["id"])
                if email_data:
                    emails.append(email_data)

            return emails
        except HttpError as e:
            print(f"Error fetching emails: {e}")
            return []

    def _get_message_details(self, message_id: str) -> dict | None:
        """Get full message details including body."""
        try:
            msg = (
                self.service.users()
                .messages()
                .get(userId="me", id=message_id, format="full")
                .execute()
            )

            headers = msg.get("payload", {}).get("headers", [])
            header_dict = {h["name"].lower(): h["value"] for h in headers}

            body = self._extract_body(msg.get("payload", {}))

            return {
                "id": message_id,
                "thread_id": msg.get("threadId"),
                "subject": header_dict.get("subject", ""),
                "from": header_dict.get("from", ""),
                "to": header_dict.get("to", ""),
                "date": header_dict.get("date", ""),
                "snippet": msg.get("snippet", ""),
                "body": body,
                "labels": msg.get("labelIds", []),
            }
        except HttpError as e:
            print(f"Error getting message {message_id}: {e}")
            return None

    def _extract_body(self, payload: dict) -> str:
        """Extract plain text body from email payload."""
        def decode_data(data: str) -> str:
            try:
                padded = data + "=" * (-len(data) % 4)
                return base64.urlsafe_b64decode(padded).decode("utf-8", errors="ignore")
            except Exception:
                return ""

        plain_parts: list[str] = []
        html_parts: list[str] = []

        def extract_parts(part: dict):
            mime_type = part.get("mimeType", "")
            data = part.get("body", {}).get("data", "")

            if mime_type == "text/plain" and data:
                plain_parts.append(decode_data(data))
            elif mime_type == "text/html" and data:
                soup = BeautifulSoup(decode_data(data), "lxml")
                html_parts.append(soup.get_text(separator="\n", strip=True))
            for subpart in part.get("parts", []):
                extract_parts(subpart)

        extract_parts(payload)
        return "".join(plain_parts or html_parts).strip()

    def parse_email_content(self, email: dict) -> dict:
        """Parse and analyze email content for key information."""
        body = email.get("body", "")
        subject = email.get("subject", "")
        from_addr = email.get("from", "")

        parsed = {
            "email": email,
            "is_cold_email": self._is_cold_email(subject, body, from_addr),
            "is_reply": self._is_reply(subject),
            "key_topics": self._extract_topics(subject, body),
            "action_items": self._extract_action_items(body),
            "contact_info": self._extract_contact_info(body, from_addr),
            "sentiment": self._analyze_sentiment(body),
            "summary": self._generate_summary(subject, body),
        }

        return parsed

    def _is_cold_email(self, subject: str, body: str, from_addr: str) -> bool:
        """Detect if email is a cold outreach."""
        cold_indicators = [
            "cold", "outreach", "proposal", "partnership", "collaboration",
            "freelance", "services", "agency", "development", "website",
            "software", "app development", "web development",
        ]
        text = (subject + " " + body).lower()
        return any(indicator in text for indicator in cold_indicators)

    def _is_reply(self, subject: str) -> bool:
        """Check if email is a reply."""
        return bool(re.match(r"\s*(?:re|aw)\s*(?:\[\d+\]|\(\d+\))?\s*:", subject, re.IGNORECASE))

    def _extract_topics(self, subject: str, body: str) -> list:
        """Extract key topics from email."""
        topics = []
        text = (subject + " " + body).lower()

        topic_keywords = {
            "web_development": ["website", "web development", "frontend", "backend", "react", "vue", "angular", "html", "css", "javascript"],
            "mobile_development": ["mobile", "app development", "ios", "android", "flutter", "react native"],
            "ai_ml": ["ai", "machine learning", "ml", "artificial intelligence", "llm", "gpt"],
            "freelance": ["freelance", "contractor", "contract", "hourly", "project-based"],
            "agency": ["agency", "outsourcing", "white label", "partner"],
            "ecommerce": ["ecommerce", "shopify", "woocommerce", "online store"],
            "saas": ["saas", "software as a service", "subscription"],
        }

        for topic, keywords in topic_keywords.items():
            if any(re.search(rf"\b{re.escape(kw)}s?\b", text) for kw in keywords):
                topics.append(topic)

        return topics

    def _extract_action_items(self, body: str) -> list:
        """Extract action items from email body."""
        action_patterns = [
            r"(?:please|kindly|can you|could you|would you|need to|should|must)\s+([^.!?]+)",
            r"(?:action required|todo|task|deliverable):\s*([^.!?]+)",
            r"(?:next steps?|follow up):\s*([^.!?]+)",
        ]

        actions = []
        for pattern in action_patterns:
            matches = re.findall(pattern, body, re.IGNORECASE)
            actions.extend([m.strip() for m in matches if len(m.strip()) > 10])

        return actions[:5]

    def _extract_contact_info(self, body: str, from_addr: str) -> dict:
        """Extract contact information from email."""
        email_regex = r"[\w.+-]+@[\w-]+\.[\w.-]+"
        phone_regex = r"(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}"
        linkedin_regex = r"linkedin\.com/in/[\w-]+"
        website_regex = r"(?<![@\w.-])(?:https?://|www\.)[\w-]+(?:\.[\w-]+)+(?:/[^\s,;)\"']*)?"

        sender = parseaddr(from_addr)[1]
        emails = set(re.findall(email_regex, body))
        if sender:
            emails.add(sender)

        return {
            "emails": sorted(emails),
            "phones": sorted({m.group(0).strip() for m in re.finditer(phone_regex, body)}),
            "linkedin": sorted(set(re.findall(linkedin_regex, body))),
            "websites": sorted({w.rstrip(".") for w in re.findall(website_regex, body)}),
        }

    def _analyze_sentiment(self, body: str) -> str:
        """Simple sentiment analysis."""
        positive = ["interested", "excited", "great", "love", "perfect", "yes", "sure", "happy", "pleased"]
        negative = ["not interested", "decline", "pass", "no thanks", "unsubscribe", "remove", "spam"]

        def hits(words, text):
            return [w for w in words if re.search(rf"\b{re.escape(w)}\b", text)]

        body_lower = body.lower()
        neg_hits = hits(negative, body_lower)
        positive_text = body_lower
        for phrase in neg_hits:
            positive_text = positive_text.replace(phrase, " ")
        pos_score = len(hits(positive, positive_text))
        neg_score = len(neg_hits)

        if pos_score > neg_score:
            return "positive"
        elif neg_score > pos_score:
            return "negative"
        return "neutral"

    def _generate_summary(self, subject: str, body: str) -> str:
        """Generate a brief summary of the email."""
        sentences = re.split(r"[.!?]+", body)
        sentences = [s.strip() for s in sentences if len(s.strip()) > 20]

        if not sentences:
            return subject

        return f"{subject}: {sentences[0]}..."

    def get_daily_summary(self, days: int = 1) -> dict:
        """Get summary of emails from the last N days."""
        self._ensure_authenticated()

        since_date = (datetime.now() - timedelta(days=days)).strftime("%Y/%m/%d")
        query = f"after:{since_date}"

        emails = self.fetch_emails(query=query, max_results=100)
        parsed_emails = [self.parse_email_content(e) for e in emails]

        cold_emails = [e for e in parsed_emails if e["is_cold_email"]]
        replies = [e for e in parsed_emails if e["is_reply"]]
        positive = [e for e in parsed_emails if e["sentiment"] == "positive"]
        action_items = []
        for e in parsed_emails:
            action_items.extend(e["action_items"])

        return {
            "period_days": days,
            "total_emails": len(emails),
            "cold_emails": len(cold_emails),
            "replies_received": len(replies),
            "positive_responses": len(positive),
            "action_items": action_items[:10],
            "top_topics": self._get_top_topics(parsed_emails),
            "emails": parsed_emails[:20],
        }

    def _get_top_topics(self, parsed_emails: list) -> dict:
        """Get frequency of topics."""
        topic_counts = {}
        for e in parsed_emails:
            for topic in e["key_topics"]:
                topic_counts[topic] = topic_counts.get(topic, 0) + 1
        return dict(sorted(topic_counts.items(), key=lambda x: x[1], reverse=True))

    def create_cold_email_template(
        self,
        recipient_name: str,
        company_name: str,
        service: str,
        portfolio_link: str = "",
        cta: str = "schedule a quick call",
    ) -> dict:
        """Generate a cold email template for freelancing."""
        templates = {
            "web_development": {
                "subject": f"Website development for {company_name}",
                "body": f"""Hi {recipient_name},

I came across {company_name} and was impressed by your work in [specific area/industry].

I'm a freelance web developer specializing in building modern, performant websites and web applications. I've helped businesses like [similar client] increase their online presence and conversions through custom React/Next.js solutions.

A few relevant projects:
• {portfolio_link or '[Portfolio link]'}

I'd love to explore how I can help {company_name} with [specific need - e.g., a new marketing site, web app, performance optimization]. Would you be open to {cta} this week?

Best regards,
[Your Name]""",
            },
            "software_development": {
                "subject": f"Custom software development for {company_name}",
                "body": f"""Hi {recipient_name},

I've been following {company_name}'s work in [industry] and think there's an opportunity to build something impactful together.

I'm a software engineer specializing in custom web applications, APIs, and automation tools. Recently, I built [relevant project] which helped [result].

I'd love to discuss how custom software could help {company_name} with [specific pain point - e.g., automating manual processes, building a customer portal, integrating systems]. Interested in {cta}?

Best,
[Your Name]""",
            },
            "general": {
                "subject": f"Freelance {service} services for {company_name}",
                "body": f"""Hi {recipient_name},

I'm reaching out because I believe I can help {company_name} with {service}.

As a freelance {service} specialist, I've delivered projects for clients in [industry], including [brief example/result].

I'd love to understand your current challenges and see if there's a fit. Would you be open to {cta}?

Best regards,
[Your Name]""",
            },
        }

        return templates.get(service, templates["general"])


gmail_service = GmailService()