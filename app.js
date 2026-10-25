// Paste the new Web App URL from your Apps Script deployment here
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyMkTuDRTMRfSy6mrP2X_XSYMKSv4mG13dCdITgbe-fWQkLRr2VKHBXybH4aAwc8qX0/exec";

let enteredPin = "";
let currentAction = "Check-In";
let html5QrCode = null;
let busy = false;

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
}

// --- Camera & Scanner Logic ---
function startCameraScanner() {
    html5QrCode = new Html5Qrcode("qr-reader");

    html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (scannedSiteId) => {
            html5QrCode.stop().catch(() => {});
            processScanAttempt(scannedSiteId);
        },
        () => {}
    ).catch(() => {
        showStatus("Camera permissions denied or unavailable.", "error");
    });
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
            showStatus(`√ ${currentAction} logged for ${result.name}`, "success");
            setTimeout(() => { location.reload(); }, 3000);
        } else {
            showStatus(`${currentAction} failed: ${result.reason || "unknown error"}. This attempt has been recorded.`, "error");
            setTimeout(() => { location.reload(); }, 6000);
        }
    } catch (err) {
        showStatus("Submission failed. Network issue.", "error");
    }
}

function showStatus(message, type) {
    const card = document.getElementById("status-card");
    const text = document.getElementById("status-text");
    card.classList.remove("hidden", "info", "success", "error");
    card.classList.add(type);
    text.innerText = message;
}
