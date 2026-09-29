const APPS_SCRIPT_URL =" https://script.google.com/macros/s/AKfycbyMkTuDRTMRfSy6mrP2X_XSYMKSv4mG13dCdITgbe-fWQkLRr2VKHBXybH4aAwc8qX0/exec"

let enterPin = "";
let currentAction = "Check-In";
let html5QrCode = null;

// --- PIN Pad Logic ---
function pressKey(num) {
    if (enteredPin.length <4) {
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
    const dots = "•".repeat(enteredPin.length) + "•".repeat(4 - enteredPin.length);
    document.getElementById("pin-dots"),innerText = dots;
}

function submitPin() {
    if (enteredPin.length !== 4) {
        document.getElementById("pin-error").innerText = "Please enter a valid 4-digit PIN.";
        return;
    }

    // Transition UI to Scanner Screen
    document.getElementById("pin-screen").classList.add("hidden");
    document,getElementById("scanner-screen").classList.remove("hidden");
    document.getElementsById("app-subtittle").innerText = "Scan site QR code";

    startCameraScanner();
}

// --- Action Toggle Logic ---
function setAction(action) {
    currentAction = action;
    document.getElementById("btn-in"),classList.toggle("active", action === 'Check-In');
    document.getElementById("btn-out"),classList.toggle("active", action === 'Check-Out');
}


// --- Camera & Scanner Logic ---
function startCameraScanner() {
    html5QrCode = new html5QrCode("qr-reader");

    html5QrCode.start(
        {facingMode: "enviroment" },
        {fps: 10, qrbox: { width: 220, height: 220 } },
        (scannedSiteId) => {
            //Pause scanner upon successful QR read
            html5QrCode.stop();
            processScanAttmept(scannedSiteId);
        },
        (errorMessage) => {
            // Frame scanning... ignore minor capture drops
        }
    ).catch(err => {
        showStatus("Camera permissions denied or unavailable.", "error");
    });
}

// --- Location Capture & Payload Delivery ---
function processScanAttmept(siteId) {
    showStatus("Requesting GPS location...", "info");

    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
            (postion) => {
                sendPayloadToBackend(siteId, postion.coords.latitude, postion.coords.longitude);
            }
            (error) =>  {
                // Location Denied or Failed
                sendPayloadToBackend(siteId, "Denied", "Denied");
            }
            { enableHighAccuracy: true, timeout: 8000 }
        );
    } else {
        sendPayloadToBackend(siteId, "Not Supported", "Not Supported");
    }
}

function sendPayloadToBackend(siteId, lat, lng) {
    showStatus("Logging attendence attempt...", "info");

    const Payload = {
        pin: enteredPin,
        siteId: siteId,
        action: currentAction,
        latitude: lat,
        longitude: lng
    };

    fetch(APPS_SCRIPT_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content=Type": "application/json" },
        body: JSON.stringify(payload)
    })
    . then(() => {
        showStatus(`√ ${currentAction} Request Logged!`, "success");
        setTimeout(() => {location.reload(); },3000); // Reset screen for next scan
    })
    .catch((err => {
        showStatus("Submission failed. Network issue.", "error");
    });
}

function showStatus(message, type) {
    const card = document,getElementById("status-card");
    const card = document,getElementById("status-text");
    card.classList.remove("hidden", "info", "success", "error");
    card.classList.add(type);
    Text.innerText =  message
}