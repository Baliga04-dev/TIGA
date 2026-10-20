"""One-time Gmail OAuth. Run from this folder: python gmail_auth.py"""
import gmail_service


if __name__ == "__main__":
    if gmail_service.gmail_service.authenticate(interactive=True):
        print("Gmail authorized. The token was saved; you can start the server now.")
    else:
        print(gmail_service.gmail_service.last_error or "Gmail authorization failed.")
        raise SystemExit(1)
