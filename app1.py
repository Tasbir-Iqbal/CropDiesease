from flask import Flask, render_template, request, redirect, url_for, flash, session,jsonify # type: ignore
import sqlite3
import os
import uuid
import json
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash # type: ignore

from PIL import Image
import PyPDF2
import docx
from werkzeug.utils import secure_filename # type: ignore





from ultralytics import YOLO
from pathlib import Path






app = Flask(__name__)
app.secret_key = "fieldscan-secret-key"

app.config["UPLOAD_FOLDER"] = "uploads"

os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)


DATABASE = "FieldScan.db"



def get_db():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn



# -----------------------------
# Home
# -----------------------------
@app.route("/")
def index():
    return render_template("index.html")


# -----------------------------
# Registration
# -----------------------------
@app.route("/register", methods=["GET", "POST"])
def register():

    if request.method == "POST":

        first_name = request.form.get("first-name", "").strip()
        last_name = request.form.get("last-name", "").strip()
        email = request.form.get("email", "").strip().lower()
        primary_crop = request.form.get("primary-crop", "").strip()
        password = request.form.get("password", "")
        confirm_password = request.form.get("confirm-password", "")

        # -----------------------------
        # Validation
        # -----------------------------

        if not first_name or not last_name:
            flash("First name and last name are required.", "error")
            return redirect(url_for("register"))

        if not email:
            flash("Email address is required.", "error")
            return redirect(url_for("register"))

        if not primary_crop:
            flash("Please select your primary crop.", "error")
            return redirect(url_for("register"))

        if len(password) < 8:
            flash("Password must be at least 8 characters.", "error")
            return redirect(url_for("register"))

        if password != confirm_password:
            flash("Passwords do not match.", "error")
            return redirect(url_for("register"))

        # -----------------------------
        # Check existing email
        # -----------------------------

        conn = get_db()

        existing_user = conn.execute(
            "SELECT id FROM users WHERE email = ?",
            (email,)
        ).fetchone()

        if existing_user:
            conn.close()
            flash("An account with this email already exists.", "error")
            return redirect(url_for("register"))

        # -----------------------------
        # Hash password
        # -----------------------------

        hashed_password = generate_password_hash(password)

        # -----------------------------
        # Insert user
        # -----------------------------

        conn.execute("""
            INSERT INTO users
            (first_name, last_name, email, primary_crop, password)
            VALUES (?, ?, ?, ?, ?)
        """, (
            first_name,
            last_name,
            email,
            primary_crop,
            hashed_password
        ))

        conn.commit()
        conn.close()

        flash("Account created successfully. Welcome to FieldScan!", "success")

        return redirect(url_for("login"))

    return render_template("signup.html")


# -----------------------------
# Login
# -----------------------------
@app.route("/login", methods=["GET", "POST"])
def login():

    if request.method == "POST":

        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")

        conn = get_db()

        user = conn.execute(
            "SELECT * FROM users WHERE email = ?",
            (email,)
        ).fetchone()

        conn.close()

        if user and check_password_hash(
            user["password"],
            password
        ):

            session["user_id"] = user["id"]

            session["user_name"] = (
                user["first_name"] +
                " " +
                user["last_name"]
            )

            return redirect(url_for("dashboard"))

        flash("Invalid email or password.", "error")

    return render_template("login.html")


# -----------------------------
# Dashboard
# -----------------------------
@app.route("/dashboard")
def dashboard():

    if "user_id" not in session:
        return redirect(url_for("login"))

    conn = get_db()

    user = conn.execute(
        "SELECT * FROM users WHERE id = ?",
        (session["user_id"],)
    ).fetchone()

    conn.close()

    return render_template("dashboard.html", user=user)



# =========================================================
# LOAD TRAINED MODEL ONCE AT STARTUP
# =========================================================

MODEL_PATH = os.environ.get("MODEL_PATH", "runs/classify/train/weights/best.pt")

if not os.path.exists(MODEL_PATH):
    raise FileNotFoundError(
        f"Model weights not found at {MODEL_PATH}. Run train.py first."
    )

model = YOLO(MODEL_PATH)
print(f"Loaded model from: {MODEL_PATH}")



# =========================================================
# ANALYZE ROUTE
# =========================================================

@app.route("/api/analyze", methods=["POST"])
def analyze_leaf():

    if "user_id" not in session:
        return jsonify({"success": False, "error": "Please log in first."}), 401

    if "image" not in request.files:
        return jsonify({"success": False, "error": "No image uploaded."}), 400

    image = request.files["image"]

    if image.filename == "":
        return jsonify({"success": False, "error": "Please select an image."}), 400

    crop = request.form.get("crop", "")
    field = request.form.get("field", "")

    allowed_extensions = {"jpg", "jpeg", "png", "webp"}
    original_filename = secure_filename(image.filename)

    if "." not in original_filename:
        return jsonify({"success": False, "error": "Invalid image filename."}), 400

    extension = original_filename.rsplit(".", 1)[-1].lower()

    if extension not in allowed_extensions:
        return jsonify({"success": False, "error": "Only JPG, PNG and WEBP images are allowed."}), 400

    unique_filename = f"leaf_{uuid.uuid4().hex}.{extension}"
    image_path = os.path.join(app.config["UPLOAD_FOLDER"], unique_filename)
    image.save(image_path)
    print("Image saved:", image_path)

    # ---------------------------------------------
    # Run inference
    # ---------------------------------------------
    try:
        results = model(image_path)
        result = results[0]

        if result.probs is None:
            raise ValueError(
                "Model did not return classification probabilities — "
                "check MODEL_PATH points to a classification checkpoint."
            )

        top1_idx = result.probs.top1
        top1_conf = result.probs.top1conf.item()
        disease = result.names[top1_idx]
        confidence = round(top1_conf * 100, 2)

        top5_predictions = [
            {"class": result.names[idx], "confidence": round(conf * 100, 2)}
            for idx, conf in zip(result.probs.top5, result.probs.top5conf.tolist())
        ]

        print(f"Top1 prediction: {disease} ({confidence}%)")

    except Exception as e:
        print("YOLO error:", e)
        if os.path.exists(image_path):
            os.remove(image_path)
        return jsonify({"success": False, "error": f"Image analysis failed: {str(e)}"}), 500

    latin = ""
    spread_risk = "Unknown"
    note = f"Detected {disease} with {confidence:.2f}% confidence."
    treatment = []

    user_id = session["user_id"]
    user_name = session.get("user_name", session.get("name", "User"))

    conn = get_db()
    cursor = conn.execute("""
        INSERT INTO leaf_scans (
            user_id, user_name, image_filename, image_path,
            crop, field, disease, confidence, latin, spread_risk,
            note, treatment, top5
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        user_id, user_name, original_filename, image_path,
        crop, field, disease, confidence, latin, spread_risk,
        note, json.dumps(treatment), json.dumps(top5_predictions)
    ))

    scan_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return jsonify({
        "success": True,
        "scan_id": scan_id,
        "user_id": user_id,
        "user_name": user_name,
        "image_filename": original_filename,
        "image_path": image_path,
        "crop": crop,
        "field": field,
        "disease": disease,
        "confidence": confidence,
        "latin": latin,
        "spread_risk": spread_risk,
        "note": note,
        "treatment": treatment,
        "top5": top5_predictions
    })




import g4f

def call_model(prompt):
    try:
        response = g4f.ChatCompletion.create(
            model=g4f.models.default,
            messages=[{"role": "user", "content": prompt}]
        )
        return {"response": response}
    except Exception as e:
        return {"error": str(e)}


@app.route("/generate", methods=["POST"])
def generate():
    prompt = request.json.get("prompt", "")
    response = call_model(prompt)
    return jsonify(response)


@app.route("/upload_document", methods=["POST"])
def upload_document():
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
    
    filename = secure_filename(file.filename)
    ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''
    content = ""
    
    try:
        if ext == 'pdf':
            reader = PyPDF2.PdfReader(file)
            for page in reader.pages:
                text = page.extract_text()
                if text:
                    content += text + "\n"
        elif ext == 'docx':
            doc = docx.Document(file)
            for para in doc.paragraphs:
                content += para.text + "\n"
        elif ext in ['txt', 'md', 'py', 'js', 'html', 'css']:
            content = file.read().decode('utf-8', errors='ignore')
        else:
            return jsonify({"error": f"Unsupported file type: {ext}"}), 400
        
        return jsonify({"content": content})
    except Exception as e:
        return jsonify({"error": str(e)}), 500







# =====================================================
# SETTINGS — ACCOUNT
# =====================================================

@app.route("/api/settings", methods=["POST"])
def update_settings():

    if "user_id" not in session:
        return jsonify({
            "success": False,
            "error": "Please log in first."
        }), 401

    user_id = session["user_id"]
    conn = None

    try:
        data = request.get_json(silent=True)

        if not data:
            return jsonify({
                "success": False,
                "error": "Invalid JSON request."
            }), 400

        name = str(data.get("name", "")).strip()
        email = str(data.get("email", "")).strip().lower()

        # -----------------------------
        # Validation
        # -----------------------------

        if not name:
            return jsonify({
                "success": False,
                "error": "Name is required."
            }), 400

        if not email or "@" not in email:
            return jsonify({
                "success": False,
                "error": "Enter a valid email."
            }), 400

        # -----------------------------
        # Split name
        # -----------------------------

        name_parts = name.split(maxsplit=1)

        first_name = name_parts[0]
        last_name = name_parts[1] if len(name_parts) > 1 else ""

        # -----------------------------
        # Database
        # -----------------------------

        conn = get_db()

        # Check duplicate email
        existing = conn.execute("""
            SELECT id
            FROM users
            WHERE email = ?
            AND id != ?
        """, (email, user_id)).fetchone()

        if existing:
            return jsonify({
                "success": False,
                "error": "This email is already being used."
            }), 409

        # -----------------------------
        # Update name and email only
        # -----------------------------

        conn.execute("""
            UPDATE users
            SET first_name = ?,
                last_name = ?,
                email = ?
            WHERE id = ?
        """, (
            first_name,
            last_name,
            email,
            user_id
        ))

        conn.commit()

        return jsonify({
            "success": True,
            "message": "Name and email updated successfully."
        }), 200

    except sqlite3.OperationalError as e:

        if conn:
            conn.rollback()

        print("DATABASE ERROR:", e)

        return jsonify({
            "success": False,
            "error": "Database is busy. Please try again."
        }), 503

    except Exception as e:

        if conn:
            conn.rollback()

        print("SETTINGS ERROR:", e)

        return jsonify({
            "success": False,
            "error": "Server error: " + str(e)
        }), 500

    finally:

        if conn:
            conn.close()



# =====================================================
# SETTINGS — PASSWORD
# =====================================================

@app.route("/api/settings/password", methods=["POST"])
def update_password():

    if "user_id" not in session:
        return jsonify({
            "success": False,
            "error": "Please log in first."
        }), 401

    user_id = session["user_id"]

    data = request.get_json()

    if not data:
        return jsonify({
            "success": False,
            "error": "Invalid request."
        }), 400

    current_password = data.get("current_password", "")
    new_password = data.get("new_password", "")

    # -----------------------------
    # Validation
    # -----------------------------

    if not current_password or not new_password:
        return jsonify({
            "success": False,
            "error": "Fill in all password fields."
        }), 400

    if len(new_password) < 8:
        return jsonify({
            "success": False,
            "error": "New password must be at least 8 characters."
        }), 400

    conn = get_db()

    try:

        user = conn.execute("""
            SELECT password
            FROM users
            WHERE id = ?
        """, (user_id,)).fetchone()

        if not user:
            return jsonify({
                "success": False,
                "error": "User not found."
            }), 404

        # Check old password
        if not check_password_hash(
            user["password"],
            current_password
        ):
            return jsonify({
                "success": False,
                "error": "Current password is incorrect."
            }), 400

        # Prevent same password
        if check_password_hash(
            user["password"],
            new_password
        ):
            return jsonify({
                "success": False,
                "error": "New password must be different."
            }), 400

        # Hash new password
        hashed_password = generate_password_hash(
            new_password
        )

        conn.execute("""
            UPDATE users
            SET password = ?
            WHERE id = ?
        """, (
            hashed_password,
            user_id
        ))

        conn.commit()

        return jsonify({
            "success": True,
            "message": "Password updated successfully."
        })

    finally:
        conn.close()
        
        
        # =====================================================
# SETTINGS — BILLING
# =====================================================

@app.route("/api/settings/billing", methods=["POST"])
def update_billing():

    if "user_id" not in session:
        return jsonify({
            "success": False,
            "error": "Please log in first."
        }), 401

    user_id = session["user_id"]

    data = request.get_json()

    if not data:
        return jsonify({
            "success": False,
            "error": "Invalid request."
        }), 400

    card_name = data.get("card_name", "").strip()
    card_number = data.get("card_number", "").replace(" ", "")
    expiry = data.get("expiry", "").strip()
    cvc = data.get("cvc", "").strip()

    # -----------------------------
    # Validation
    # -----------------------------

    if not card_name:
        return jsonify({
            "success": False,
            "error": "Enter the name on the card."
        }), 400

    if not card_number.isdigit():
        return jsonify({
            "success": False,
            "error": "Invalid card number."
        }), 400

    if len(card_number) < 13 or len(card_number) > 16:
        return jsonify({
            "success": False,
            "error": "Enter a valid card number."
        }), 400

    if len(cvc) not in (3, 4) or not cvc.isdigit():
        return jsonify({
            "success": False,
            "error": "Enter a valid CVC."
        }), 400

    # MM/YY
    try:
        month, year = expiry.split("/")

        month = int(month)
        year = int(year)

        if month < 1 or month > 12:
            raise ValueError

    except (ValueError, AttributeError):
        return jsonify({
            "success": False,
            "error": "Enter expiry as MM/YY."
        }), 400

    # =================================================
    # IMPORTANT
    # =================================================
    #
    # NEVER store:
    #   card_number
    #   cvc
    #
    # In a real application:
    # Send the card to Stripe/Braintree and receive
    # a payment-method/token ID.
    #
    # For this demo we only save the last 4 digits.
    # =================================================

    last4 = card_number[-4:]

    conn = get_db()

    try:

        conn.execute("""
            INSERT INTO user_settings
                (user_id, card_name, card_last4)
            VALUES (?, ?, ?)

            ON CONFLICT(user_id)
            DO UPDATE SET
                card_name = excluded.card_name,
                card_last4 = excluded.card_last4,
                updated_at = CURRENT_TIMESTAMP
        """, (
            user_id,
            card_name,
            last4
        ))

        conn.commit()

        return jsonify({
            "success": True,
            "message": "Card saved.",
            "last4": last4
        })

    finally:
        conn.close()



# =====================================================
# DANGER ZONE — DELETE ACCOUNT
# =====================================================

@app.route("/api/account", methods=["DELETE"])
def delete_account():

    if "user_id" not in session:
        return jsonify({
            "success": False,
            "error": "Please log in first."
        }), 401

    user_id = session["user_id"]

    conn = get_db()

    try:

        # -----------------------------
        # Check user
        # -----------------------------

        user = conn.execute("""
            SELECT id
            FROM users
            WHERE id = ?
        """, (user_id,)).fetchone()

        if not user:
            return jsonify({
                "success": False,
                "error": "User not found."
            }), 404

        # -----------------------------
        # Delete user's scans
        # -----------------------------

        conn.execute("""
            DELETE FROM leaf_scans
            WHERE user_id = ?
        """, (user_id,))

        # -----------------------------
        # Delete settings
        # -----------------------------

        conn.execute("""
            DELETE FROM user_settings
            WHERE user_id = ?
        """, (user_id,))

        # -----------------------------
        # Delete user
        # -----------------------------

        conn.execute("""
            DELETE FROM users
            WHERE id = ?
        """, (user_id,))

        conn.commit()

        # -----------------------------
        # Clear session
        # -----------------------------

        session.clear()

        return jsonify({
            "success": True,
            "message": "Account deleted successfully."
        })

    except Exception as e:

        conn.rollback()

        print("Delete account error:", e)

        return jsonify({
            "success": False,
            "error": "Could not delete account."
        }), 500

    finally:
        conn.close()
    




























# -----------------------------
# Logout
# -----------------------------
@app.route("/logout")
def logout():

    session.clear()

    return redirect(url_for("login"))





# ============================================================
# RUN SERVER
# ============================================================

if __name__ == "__main__":
    
    
    
    app.run(
        debug=True,
        host="127.0.0.1",
        port=5000,
        use_reloader=False   # avoids double model load / double startup log
    )

    