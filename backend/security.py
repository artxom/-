import os
from cryptography.fernet import Fernet
import base64

SECRET_KEY_FILE = ".secret.key"

def _get_or_create_key() -> bytes:
    if os.path.exists(SECRET_KEY_FILE):
        with open(SECRET_KEY_FILE, "rb") as f:
            return f.read().strip()
    
    # Generate a new key and save it
    key = Fernet.generate_key()
    with open(SECRET_KEY_FILE, "wb") as f:
        f.write(key)
    # Try to secure the file
    try:
        os.chmod(SECRET_KEY_FILE, 0o600)
    except Exception:
        pass
    return key

_fernet = Fernet(_get_or_create_key())

def encrypt_secret(plain_text: str) -> str:
    if not plain_text:
        return plain_text
    # If already encrypted (heuristic), don't double encrypt
    if plain_text.startswith("ENC:") :
        return plain_text
    
    encoded = _fernet.encrypt(plain_text.encode('utf-8'))
    return "ENC:" + encoded.decode('utf-8')

def decrypt_secret(cipher_text: str) -> str:
    if not cipher_text or not cipher_text.startswith("ENC:"):
        return cipher_text
    
    actual_cipher = cipher_text[4:]
    try:
        decoded = _fernet.decrypt(actual_cipher.encode('utf-8')).decode('utf-8')
        return decoded
    except Exception:
        # If decryption fails (e.g. key changed), return empty or original to avoid crash
        return ""
