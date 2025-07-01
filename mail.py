import time
import json
import re
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from google.auth.transport.requests import Request
from bs4 import BeautifulSoup

# --- Constants ---
SCOPES = ['https://www.googleapis.com/auth/gmail.readonly']
CREDENTIALS_FILE = 'credentials.json'  # tumhara OAuth client JSON file
TOKEN_FILE = 'token.json'  # cached token file
POLL_INTERVAL = 30  # seconds, polling frequency

# --- Transaction extraction regex ---
def extract_transaction_info(text):
    try:
        match = re.search(
            r"Rs\.(\d+\.\d{2}) is successfully credited.*?reference number is (\d+)",
            text,
            re.DOTALL
        )
        if match:
            return {
                "amount": float(match.group(1)),
                "utr": match.group(2)
            }
    except Exception as e:
        print("Parsing error:", e)
    return None

# --- Email body extraction from Gmail API message payload ---
def get_email_body(payload):
    body = ""
    if 'parts' in payload:
        for part in payload['parts']:
            mime_type = part.get('mimeType')
            data = part.get('body', {}).get('data')
            if not data:
                continue
            decoded_bytes = base64.urlsafe_b64decode(data.encode('UTF-8'))
            content = decoded_bytes.decode(errors='ignore')
            if mime_type == 'text/plain':
                return content.strip()
            elif mime_type == 'text/html':
                soup = BeautifulSoup(content, "html.parser")
                return soup.get_text().strip()
    else:
        data = payload.get('body', {}).get('data')
        if data:
            decoded_bytes = base64.urlsafe_b64decode(data.encode('UTF-8'))
            content = decoded_bytes.decode(errors='ignore')
            if payload.get('mimeType') == 'text/plain':
                return content.strip()
            elif payload.get('mimeType') == 'text/html':
                soup = BeautifulSoup(content, "html.parser")
                return soup.get_text().strip()
    return body

# --- Authenticate user and get credentials ---
def authenticate_gmail():
    creds = None
    try:
        creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
    except Exception:
        pass

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(CREDENTIALS_FILE, SCOPES)
            creds = flow.run_local_server(port=8080)  # fixed port, remember to add in Google Console
        with open(TOKEN_FILE, 'w') as token:
            token.write(creds.to_json())
    return creds

# --- Main polling loop ---
def main():
    creds = authenticate_gmail()
    service = build('gmail', 'v1', credentials=creds)

    seen_message_ids = set()

    print(f"✅ Starting polling every {POLL_INTERVAL} seconds... (Press Ctrl+C to stop)")

    try:
        while True:
            query = 'from:alerts@hdfcbank.net "successfully credited to your account"'
            results = service.users().messages().list(userId='me', q=query, maxResults=10).execute()
            messages = results.get('messages', [])

            new_found = False

            for msg in messages:
                msg_id = msg['id']
                if msg_id in seen_message_ids:
                    continue

                msg_data = service.users().messages().get(userId='me', id=msg_id, format='full').execute()
                payload = msg_data.get('payload', {})
                body_text = get_email_body(payload)

                txn = extract_transaction_info(body_text)
                if txn:
                    print(f"\n🆕 New Transaction found:\n{json.dumps(txn, indent=4)}\n")
                    new_found = True

                seen_message_ids.add(msg_id)

            if not new_found:
                print(".", end="", flush=True)

            time.sleep(POLL_INTERVAL)

    except KeyboardInterrupt:
        print("\n👋 Polling stopped by user.")

if __name__ == "__main__":
    import base64  # import here to avoid unused import if not main
    main()
