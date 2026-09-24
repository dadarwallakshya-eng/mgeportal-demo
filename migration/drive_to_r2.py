import os
import re
import ssl
import urllib.request
import urllib.parse
import urllib.error

# Try to import boto3; if not installed, install it dynamically or guide the user
try:
    import boto3
    from botocore.client import Config
except ImportError:
    print("Installing boto3 dependency...")
    import subprocess
    subprocess.check_call([os.sys.executable, "-m", "pip", "install", "boto3"])
    import boto3
    from botocore.client import Config

try:
    import pg8000.dbapi
except ImportError:
    print("Installing pg8000 dependency...")
    import subprocess
    subprocess.check_call([os.sys.executable, "-m", "pip", "install", "pg8000"])
    import pg8000.dbapi

# Read .env file
env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
config = {}
if os.path.exists(env_path):
    with open(env_path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#'):
                parts = line.split('=', 1)
                if len(parts) == 2:
                    config[parts[0].strip()] = parts[1].strip().strip('"').strip("'")

# DB Config
db_url = config.get('DATABASE_URL') or os.environ.get('DATABASE_URL')
if not db_url:
    print("Error: DATABASE_URL not found in .env or environment.")
    exit(1)

# R2 Config
r2_access_key = config.get('CLOUDFLARE_R2_ACCESS_KEY_ID')
r2_secret_key = config.get('CLOUDFLARE_R2_SECRET_ACCESS_KEY')
r2_endpoint = config.get('CLOUDFLARE_R2_ENDPOINT')
r2_bucket = config.get('CLOUDFLARE_R2_BUCKET_NAME')

if not all([r2_access_key, r2_secret_key, r2_endpoint, r2_bucket]):
    print("Error: Cloudflare R2 credentials (CLOUDFLARE_R2_ACCESS_KEY_ID, CLOUDFLARE_R2_SECRET_ACCESS_KEY, CLOUDFLARE_R2_ENDPOINT, CLOUDFLARE_R2_BUCKET_NAME) are missing in .env.")
    print("Please populate them in .env before running the migration.")
    exit(1)

# Initialize S3 Client for Cloudflare R2
s3 = boto3.client(
    service_name='s3',
    endpoint_url=r2_endpoint,
    aws_access_key_id=r2_access_key,
    aws_secret_access_key=r2_secret_key,
    config=Config(
        signature_version='s3v4',
        s3={'addressing_style': 'path'}
    ),
    region_name='us-east-1'
)

# Parse database URL
# Format: postgresql://user:pass@host:port/dbname
url_parts = db_url.split('@')
user_pass = url_parts[0].replace('postgresql://', '').split(':')
db_user = user_pass[0]
db_pass = urllib.parse.unquote(user_pass[1])

host_port_db = url_parts[1].split('/')[0].split(':')
db_host = host_port_db[0]
db_port = int(host_port_db[1])
db_name = url_parts[1].split('/')[1].split('?')[0]

print(f"Connecting to database {db_name} on {db_host}...")
ssl_context = ssl.create_default_context()
ssl_context.check_hostname = False
ssl_context.verify_mode = ssl.CERT_NONE

conn = pg8000.dbapi.connect(
    user=db_user,
    host=db_host,
    database=db_name,
    port=db_port,
    password=db_pass,
    ssl_context=ssl_context
)
cursor = conn.cursor()

def extract_file_id(url):
    if not url: return None
    # 1) https://drive.google.com/file/d/<ID>/...
    m = re.search(r'drive\.google\.com/file/d/([a-zA-Z0-9_-]{15,})', url)
    if m: return m[1]
    # 2) https://drive.google.com/open?id=<ID>
    m = re.search(r'drive\.google\.com/(?:open|uc|thumbnail)\?[^#]*\bid=([a-zA-Z0-9_-]{15,})', url)
    if m: return m[1]
    return None

def download_gdrive_file(file_id):
    url = f"https://drive.google.com/uc?export=download&id={file_id}"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            return response.read(), response.info().get_content_type()
    except Exception as e:
        print(f"  [ERROR] Failed to download public file {file_id}: {e}")
        return None, None

def upload_to_r2(key, body, content_type):
    try:
        s3.put_object(
            Bucket=r2_bucket,
            Key=key,
            Body=body,
            ContentType=content_type
        )
        return True
    except Exception as e:
        print(f"  [ERROR] Failed to upload {key} to R2: {e}")
        return False

# 1. MIGRATE STUDENTS
print("\n=== MIGRATING STUDENT FILES ===")
cursor.execute("SELECT id, name, admission_no, photo_url, aadhar_doc_url, parent_aadhar_doc_url FROM students")
students = cursor.fetchall()
print(f"Found {len(students)} student records.")

for s_id, name, adm_no, photo_url, aadhar_url, parent_aadhar_url in students:
    updated_fields = {}
    print(f"Processing student: {name} ({adm_no or 'No admission no'})")
    
    # Photo
    photo_id = extract_file_id(photo_url)
    if photo_id:
        print(f"  Migrating photo (ID: {photo_id})...")
        data, mime = download_gdrive_file(photo_id)
        if data:
            ext = mime.split('/')[-1] if mime else 'png'
            key = f"students/{s_id}/photo.{ext}"
            if upload_to_r2(key, data, mime or 'image/png'):
                updated_fields['photo_url'] = key
                print(f"    Uploaded to R2: {key}")

    # Aadhar
    aadhar_id = extract_file_id(aadhar_url)
    if aadhar_id:
        print(f"  Migrating Aadhar (ID: {aadhar_id})...")
        data, mime = download_gdrive_file(aadhar_id)
        if data:
            ext = mime.split('/')[-1] if mime else 'pdf'
            key = f"students/{s_id}/aadhar.{ext}"
            if upload_to_r2(key, data, mime or 'application/pdf'):
                updated_fields['aadhar_doc_url'] = key
                print(f"    Uploaded to R2: {key}")

    # Parent Aadhar
    parent_aadhar_id = extract_file_id(parent_aadhar_url)
    if parent_aadhar_id:
        print(f"  Migrating Parent Aadhar (ID: {parent_aadhar_id})...")
        data, mime = download_gdrive_file(parent_aadhar_id)
        if data:
            ext = mime.split('/')[-1] if mime else 'pdf'
            key = f"students/{s_id}/parent_aadhar.{ext}"
            if upload_to_r2(key, data, mime or 'application/pdf'):
                updated_fields['parent_aadhar_doc_url'] = key
                print(f"    Uploaded to R2: {key}")

    if updated_fields:
        set_clause = ", ".join([f"{k} = %s" for k in updated_fields.keys()])
        params = list(updated_fields.values()) + [s_id]
        cursor.execute(f"UPDATE students SET {set_clause} WHERE id = %s", params)
        conn.commit()
        print(f"  [SUCCESS] Student database updated.")

# 2. MIGRATE STAFF
print("\n=== MIGRATING STAFF FILES ===")
cursor.execute("SELECT id, name, staff_no, photo_url, aadhar_doc_url, pan_doc_url, other_doc_url FROM staff")
staff_members = cursor.fetchall()
print(f"Found {len(staff_members)} staff records.")

for st_id, name, staff_no, photo_url, aadhar_url, pan_url, other_url in staff_members:
    updated_fields = {}
    print(f"Processing staff: {name} ({staff_no or 'No staff no'})")
    
    # Photo
    photo_id = extract_file_id(photo_url)
    if photo_id:
        print(f"  Migrating photo (ID: {photo_id})...")
        data, mime = download_gdrive_file(photo_id)
        if data:
            ext = mime.split('/')[-1] if mime else 'png'
            key = f"staff/{st_id}/photo.{ext}"
            if upload_to_r2(key, data, mime or 'image/png'):
                updated_fields['photo_url'] = key
                print(f"    Uploaded to R2: {key}")

    # Aadhar
    aadhar_id = extract_file_id(aadhar_url)
    if aadhar_id:
        print(f"  Migrating Aadhar (ID: {aadhar_id})...")
        data, mime = download_gdrive_file(aadhar_id)
        if data:
            ext = mime.split('/')[-1] if mime else 'pdf'
            key = f"staff/{st_id}/aadhar.{ext}"
            if upload_to_r2(key, data, mime or 'application/pdf'):
                updated_fields['aadhar_doc_url'] = key
                print(f"    Uploaded to R2: {key}")

    # PAN
    pan_id = extract_file_id(pan_url)
    if pan_id:
        print(f"  Migrating PAN (ID: {pan_id})...")
        data, mime = download_gdrive_file(pan_id)
        if data:
            ext = mime.split('/')[-1] if mime else 'pdf'
            key = f"staff/{st_id}/pan.{ext}"
            if upload_to_r2(key, data, mime or 'application/pdf'):
                updated_fields['pan_doc_url'] = key
                print(f"    Uploaded to R2: {key}")

    # Other
    other_id = extract_file_id(other_url)
    if other_id:
        print(f"  Migrating other doc (ID: {other_id})...")
        data, mime = download_gdrive_file(other_id)
        if data:
            ext = mime.split('/')[-1] if mime else 'pdf'
            key = f"staff/{st_id}/other.{ext}"
            if upload_to_r2(key, data, mime or 'application/pdf'):
                updated_fields['other_doc_url'] = key
                print(f"    Uploaded to R2: {key}")

    if updated_fields:
        set_clause = ", ".join([f"{k} = %s" for k in updated_fields.keys()])
        params = list(updated_fields.values()) + [st_id]
        cursor.execute(f"UPDATE staff SET {set_clause} WHERE id = %s", params)
        conn.commit()
        print(f"  [SUCCESS] Staff database updated.")

# 3. MIGRATE TRANSACTIONS
print("\n=== MIGRATING TRANSACTION RECEIPTS ===")
cursor.execute("SELECT id, description, receipt_url FROM transactions WHERE receipt_url IS NOT NULL")
transactions = cursor.fetchall()
print(f"Found {len(transactions)} transaction records with receipts.")

for t_id, desc, receipt_url in transactions:
    receipt_id = extract_file_id(receipt_url)
    if receipt_id:
        print(f"Processing transaction: {desc[:30]} (ID: {t_id})")
        data, mime = download_gdrive_file(receipt_id)
        if data:
            ext = mime.split('/')[-1] if mime else 'pdf'
            key = f"transactions/{t_id}/receipt.{ext}"
            if upload_to_r2(key, data, mime or 'application/pdf'):
                cursor.execute("UPDATE transactions SET receipt_url = %s WHERE id = %s", [key, t_id])
                conn.commit()
                print(f"    Uploaded to R2: {key} and updated DB.")

print("\n=== MIGRATION COMPLETE ===")
cursor.close()
conn.close()
