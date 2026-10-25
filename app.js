const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyMkTuDRTMRfSy6mrP2X_XSYMKSv4mG13dCdITgbe-fWQkLRr2VKHBXybH4aAwc8qX0/exec";

// If nobody scans anything for this long, the PIN is cleared and the PIN screen returns.
const IDLE_LIMIT_MS = 2 * 60 * 1000;

let enteredPin = "";
let currentAction = "Check-In";
let html5QrCode = null;
let busy = false;
let handlingScan = false;
let idleTimer = null;

// --- Backend helper ---
// text/plain avoids a CORS preflight, which Apps Script can't answer.
async function callBackend(payload) {
    const res = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
    });
    return res.json();
}

// --- Idle timeout / log out ---
function startIdleTimer() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { location.reload(); }, IDLE_LIMIT_MS);
}

function logout() {
    clearTimeout(idleTimer);
    location.reload(); // clears the PIN from memory and stops the camera
}

// --- PIN Pad Logic ---
function pressKey(num) {
    if (busy) return;
    if (enteredPin.length < 4) {
        enteredPin += num;
        updatePinDots();
    }
}

function clearPin() {
    if (busy) return;
    enteredPin = "";
    updatePinDots();
    document.getElementById("pin-error").innerText = "";
}

function updatePinDots() {
    const dots = "●".repeat(enteredPin.length) + "○".repeat(4 - enteredPin.length);
    document.getElementById("pin-dots").innerText = dots;
}

async function submitPin() {
    if (busy) return;
    const errorEl = document.getElementById("pin-error");

    if (enteredPin.length !== 4) {
        errorEl.innerText = "Please enter a valid 4-digit PIN.";
        return;
    }

    busy = true;
    errorEl.innerText = "Checking PIN...";

    try {
        const result = await callBackend({ type: "verify", pin: enteredPin });

        if (result.status !== "SUCCESS") {
            errorEl.innerText = (result.reason === "Invalid or Inactive PIN")
                ? "PIN not recognised. Try again."
                : (result.reason || "Something went wrong. Try again.");
            enteredPin = "";
            updatePinDots();
            return;
        }

        errorEl.innerText = "";
        document.getElementById("contractor-greeting").innerText = `Welcome, ${result.name}`;
        document.getElementById("pin-screen").classList.add("hidden");
        document.getElementById("scanner-screen").classList.remove("hidden");
        document.getElementById("app-subtitle").innerText = "Scan site QR code";
        startIdleTimer();
        startCameraScanner();
    } catch (err) {
        errorEl.innerText = "Could not reach the server. Check your signal and try again.";
    } finally {
        busy = false;
    }
}

// --- Action Toggle Logic ---
function setAction(action) {
    currentAction = action;
    document.getElementById("btn-in").classList.toggle("active", action === "Check-In");
    document.getElementById("btn-out").classList.toggle("active", action === "Check-Out");
    startIdleTimer();
}

// --- Camera & Scanner Logic ---
async function startCameraScanner() {
    handlingScan = false;

    if (html5QrCode) {
        try { await html5QrCode.clear(); } catch (err) {}
    }
    html5QrCode = new Html5Qrcode("qr-reader");

    html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (scannedSiteId) => {
            // The camera can report the same code several times before it stops: only act once
            if (handlingScan) return;
            handlingScan = true;
            html5QrCode.stop().catch(() => {});
            processScanAttempt(scannedSiteId);
        },
        () => {}
    ).catch(() => {
        showStatus("Camera permissions denied or unavailable.", "error");
        showRetry();
    });
}

function showRetry() {
    document.getElementById("retry-btn").classList.remove("hidden");
}

function retryScan() {
    startIdleTimer();
    document.getElementById("retry-btn").classList.add("hidden");
    document.getElementById("status-card").classList.add("hidden");
    startCameraScanner();
}

// --- Location Capture & Logging ---
function processScanAttempt(siteId) {
    showStatus("Requesting GPS location...", "info");

    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                sendLog(siteId, position.coords.latitude, position.coords.longitude);
            },
            () => {
                sendLog(siteId, "Denied", "Denied");
            },
            { enableHighAccuracy: true, timeout: 8000 }
        );
    } else {
        sendLog(siteId, "Not Supported", "Not Supported");
    }
}

async function sendLog(siteId, lat, lng) {
    showStatus("Logging attendance...", "info");

    try {
        const result = await callBackend({
            type: "log",
            pin: enteredPin,
            siteId: siteId,
            action: currentAction,
            latitude: lat,
            longitude: lng
        });

        if (result.status === "SUCCESS") {
            // Success ends the session so the next person starts from the PIN screen
            clearTimeout(idleTimer);
            showStatus(`√ ${currentAction} logged for ${result.name}`, "success");
            setTimeout(() => { location.reload(); }, 3000);
        } else if (result.reason === "Invalid or Inactive PIN") {
            // PIN was switched off mid-session: retrying can't help
            showStatus(`${currentAction} failed: ${result.reason}.`, "error");
            setTimeout(() => { location.reload(); }, 4000);
        } else {
            // Stay logged in so they can try again
            showStatus(`${currentAction} failed: ${result.reason || "unknown error"}. This attempt has been recorded.`, "error");
            showRetry();
        }
    } catch (err) {
        showStatus("Submission failed. Network issue. Please try again.", "error");
        showRetry();
    }
}

function showStatus(message, type) {
    const card = document.getElementById("status-card");
    const text = document.getElementById("status-text");
    card.classList.remove("hidden", "info", "success", "error");
    card.classList.add(type);
    text.innerText = message;
}

// --- Footer year ---
document.getElementById("footer-year").innerText = new Date().getFullYear();
