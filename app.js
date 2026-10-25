
Claude
App · JS
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyMkTuDRTMRfSy6mrP2X_XSYMKSv4mG13dCdITgbe-fWQkLRr2VKHBXybH4aAwc8qX0/exec";
 
let enteredPin = "";
let currentAction = "Check-In";
let html5QrCode = null;
 
// --- PIN Pad Logic ---
function pressKey(num) {
    if (enteredPin.length < 4) {
        enteredPin += num;
        updatePinDots();
    }
}
 
function clearPin() {
    enteredPin = "";
    updatePinDots();
    document.getElementById("pin-error").innerText = "";
}
 
function updatePinDots() {
    // Filled dots for entered digits, hollow for remaining
    const dots = "●".repeat(enteredPin.length) + "○".repeat(4 - enteredPin.length);
    document.getElementById("pin-dots").innerText = dots;
}
 
function submitPin() {
    if (enteredPin.length !== 4) {
        document.getElementById("pin-error").innerText = "Please enter a valid 4-digit PIN.";
        return;
    }
 
    document.getElementById("pin-screen").classList.add("hidden");
    document.getElementById("scanner-screen").classList.remove("hidden");
    document.getElementById("app-subtitle").innerText = "Scan site QR code";
 
    startCameraScanner();
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
        () => {
            // Frame scanning... ignore minor capture drops
        }
    ).catch(() => {
        showStatus("Camera permissions denied or unavailable.", "error");
    });
}
 
// --- Location Capture & Payload Delivery ---
function processScanAttempt(siteId) {
    showStatus("Requesting GPS location...", "info");
 
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                sendPayloadToBackend(siteId, position.coords.latitude, position.coords.longitude);
            },
            () => {
                sendPayloadToBackend(siteId, "Denied", "Denied");
            },
            { enableHighAccuracy: true, timeout: 8000 }
        );
    } else {
        sendPayloadToBackend(siteId, "Not Supported", "Not Supported");
    }
}
 
function sendPayloadToBackend(siteId, lat, lng) {
    showStatus("Logging attendance attempt...", "info");
 
    const payload = {
        pin: enteredPin,
        siteId: siteId,
        action: currentAction,
        latitude: lat,
        longitude: lng
    };
 
    fetch(APPS_SCRIPT_URL, {
        method: "POST",
        mode: "no-cors",
        // text/plain keeps this a "simple" request; Apps Script reads it via e.postData.contents
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
    })
    .then(() => {
        showStatus(`√ ${currentAction} request sent!`, "success");
        setTimeout(() => { location.reload(); }, 3000);
    })
    .catch(() => {
        showStatus("Submission failed. Network issue.", "error");
    });
}
 
function showStatus(message, type) {
    const card = document.getElementById("status-card");
    const text = document.getElementById("status-text");
    card.classList.remove("hidden", "info", "success", "error");
    card.classList.add(type);
    text.innerText = message;
}
 
