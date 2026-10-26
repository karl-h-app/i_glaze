// Must match the URL in app.js
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyMkTuDRTMRfSy6mrP2X_XSYMKSv4mG13dCdITgbe-fWQkLRr2VKHBXybH4aAwc8qX0/exec";

// --- Version (change APP_VERSION on every release, and the ?v= numbers in the HTML) ---
const APP_VERSION = "1.0.0";
let lastScriptV = "";

function showVersion(scriptV) {
    const el = document.getElementById("version-line");
    if (!el) return;
    if (scriptV) lastScriptV = scriptV;
    el.textContent = "Page v" + APP_VERSION + (lastScriptV ? " | Script v" + lastScriptV : "");
    el.classList.toggle("mismatch", !!lastScriptV && lastScriptV !== APP_VERSION);
}

const token = sessionStorage.getItem("adminToken");
if (!token) location.href = "index.html";

const $ = (id) => document.getElementById(id);
const dlg = $("dlg");
const state = { Users: [], Sites: [], logs: [] };

const SCHEMAS = {
    Users: [
        { l: "Name" },
        { l: "PIN (4 digits; admins 6-8)", mask: true },
        { l: "Status", o: ["Active", "Inactive"] },
        { l: "Role", o: ["Contractor", "Admin"] }
    ],
    Sites: [
        { l: "Site ID" }, { l: "Site name" }, { l: "Latitude" }, { l: "Longitude" },
        { hidden: true },
        { l: "Status", o: ["Active", "Inactive"] }
    ]
};

async function api(op, extra) {
    const res = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(Object.assign({ type: "admin", token, op }, extra))
    });
    const r = await res.json();
    showVersion(r.version);
    if (r.expired) { alert(r.reason); logout(); }
    return r;
}

function logout() { sessionStorage.clear(); location.href = "index.html"; }

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ---------- Tabs ----------
document.querySelectorAll("nav button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("nav button").forEach((x) => x.classList.toggle("active", x === b));
    ["hours", "Users", "Sites", "qr"].forEach((t) => { $(t).hidden = t !== b.dataset.tab; });
}));

// ---------- Users & Sites ----------
async function loadLists() {
    const r = await api("list");
    if (r.status !== "SUCCESS") return alert(r.reason);
    state.Users = r.Users; state.Sites = r.Sites;
    renderTable("Users"); renderTable("Sites"); fillQrSites();
}

function renderTable(tab) {
    const fields = SCHEMAS[tab].filter((f) => !f.hidden);
    const head = fields.map((f) => `<th>${esc(f.l.replace(/ \(.*/, ""))}</th>`).join("") + "<th></th>";
    const body = state[tab].map((r) => {
        const cells = SCHEMAS[tab].map((f, i) => f.hidden ? "" : `<td>${f.mask ? "••••" : esc(r.v[i])}</td>`).join("");
        return `<tr>${cells}<td class="act"><button class="small" onclick="openEdit('${tab}', ${r.row})">Edit</button>` +
               `<button class="small danger" onclick="del('${tab}', ${r.row})">Delete</button></td></tr>`;
    }).join("");
    $("t-" + tab).innerHTML = `<tr>${head}</tr>${body}`;
}

function openEdit(tab, row) {
    const cur = state[tab].find((r) => r.row === row);
    $("dt").innerText = (row ? "Edit " : "Add ") + (tab === "Users" ? "user" : "site");
    $("de").innerText = "";
    $("df").innerHTML = SCHEMAS[tab].map((f, i) => {
        if (f.hidden) return "";
        const val = cur ? cur.v[i] : (f.o ? f.o[0] : "");
        const input = f.o
            ? `<select data-i="${i}">${f.o.map((o) => `<option${o === val ? " selected" : ""}>${o}</option>`).join("")}</select>`
            : `<input data-i="${i}" value="${esc(val)}">`;
        return `<label class="field">${esc(f.l)}${input}</label>`;
    }).join("");
    if (tab === "Sites") {
        $("df").insertAdjacentHTML("beforeend", '<button class="ghost" type="button" onclick="openPicker()">&#128205; Pick location on map</button>');
    }
    $("ds").onclick = () => saveRow(tab, row, cur);
    dlg.showModal();
}

async function saveRow(tab, row, cur) {
    const values = SCHEMAS[tab].map((f, i) => {
        if (f.hidden) return cur ? cur.v[i] : "";
        return $("df").querySelector(`[data-i="${i}"]`).value;
    });
    $("de").innerText = "Saving...";
    const r = await api("save", { tab, row, values });
    if (r.status !== "SUCCESS") { $("de").innerText = r.reason; return; }
    dlg.close();
    loadLists();
}

async function del(tab, row) {
    const cur = state[tab].find((r) => r.row === row);
    if (!confirm(`Delete "${cur.v[0]}"? This can't be undone.`)) return;
    const r = await api("delete", { tab, row, key: cur.v[0] });
    if (r.status !== "SUCCESS") return alert(r.reason);
    loadLists();
}

// ---------- Hours ----------
// Display dates as dd/mm/yyyy (data stays yyyy-mm-dd underneath)
const dmy = (s) => String(s).replace(/^(\d{4})-(\d\d)-(\d\d)/, "$3/$2/$1");
const dmyAll = (s) => String(s).replace(/(\d{4})-(\d\d)-(\d\d)/g, "$3/$2/$1");
// Rows an admin has edited show as ADMIN UPDATED (also covers rows edited before this change)
const statusOf = (v) => (v[13] && (v[5] === "MANUAL" || v[5] === "SUCCESS")) ? "ADMIN UPDATED" : v[5];
// Distance + Google Maps link, from the check-in (H, I) and check-out (K, L) columns
const isMap = (u) => /^https:\/\/www\.google\.com\/maps/.test(u);
const locBit = (d, u, row, w) => (!d || d === "N/A") ? "-" : isMap(u) ? `<a href="#" onclick="showMap(${row}, '${w}'); return false;">${esc(d)} &#128205;</a>` : esc(d);
const locCell = (v, row) => `In ${locBit(v[7], v[8], row, "in")}<br>Out ${locBit(v[10], v[11], row, "out")}`;
const toLocal = (s) => /^\d{4}-\d\d-\d\d \d\d:\d\d$/.test(s) ? s.replace(" ", "T") : "";
const mins = (a, b) => (toLocal(a) && toLocal(b)) ? Math.round((new Date(toLocal(b)) - new Date(toLocal(a))) / 60000) : null;
const hm = (m) => m === null ? "" : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;

function visibleLogs() {
    const emp = $("f-emp").value.trim().toLowerCase();
    return state.logs.filter((r) =>
        (r.v[5] !== "FAILED" || $("f-failed").checked) && (!emp || r.v[1].toLowerCase().includes(emp)));
}

async function loadHours() {
    const r = await api("logs", { from: $("f-from").value, to: $("f-to").value });
    if (r.status !== "SUCCESS") return alert(r.reason);
    state.logs = r.rows.reverse();   // newest first
    renderHours();
}

function renderHours() {
    const rows = visibleLogs(), totals = {};
    const body = rows.map((r) => {
        const v = r.v, m = mins(v[0], v[9]);
        if (m !== null && v[5] !== "FAILED") totals[v[1]] = (totals[v[1]] || 0) + m;
        const day = (v[0].match(/^\d{4}-\d\d-\d\d/) || v[9].match(/^\d{4}-\d\d-\d\d/) || [""])[0];
        const st = statusOf(v), cls = st === "FAILED" ? "failed" : st === "MANUAL" ? "manual" : "";
        const note = [v[6], v[12]].filter(Boolean).join(" | ");
        return `<tr class="${cls}"><td>${dmy(day)}</td><td>${esc(v[1])}</td><td>${esc(v[4] || v[3])}</td>` +
               `<td>${esc(dmy(v[0]))}</td><td>${esc(dmy(v[9]))}</td><td>${hm(m)}</td><td>${locCell(v, r.row)}</td><td>${esc(st)}</td><td>${esc(note)}</td><td>${esc(dmyAll(v[13]))}</td>` +
               `<td class="act"><button class="small" onclick="editLog(${r.row})">Edit</button>` +
               `<button class="small danger" onclick="delLog(${r.row})">Delete</button></td></tr>`;
    }).join("");
    $("t-hours").innerHTML = `<tr><th>Date</th><th>Employee</th><th>Site</th><th>In</th><th>Out</th><th>Hours</th><th>Location</th><th>Status</th><th>Notes</th><th>Admin comment</th><th></th></tr>${body}`;
    $("summary").innerHTML = Object.keys(totals).sort().map((n) => `<span class="chip">${esc(n)}: <b>${hm(totals[n])}</b></span>`).join("");
}

function editLog(row) {
    const r = state.logs.find((x) => x.row === row), v = r.v;
    $("dt").innerText = "Edit hours: " + v[1];
    $("de").innerText = "";
    const prefill = v[13].replace(/^\[Edited by .*?\]( - )?/, "");
    $("df").innerHTML =
        `<label class="field">Check-in<input type="datetime-local" id="e-in" value="${toLocal(v[0])}"></label>` +
        `<label class="field">Check-out<input type="datetime-local" id="e-out" value="${toLocal(v[9])}"></label>` +
        `<p class="field">User comment: ${esc(v[12]) || "none"}</p>` +
        `<label class="field">Admin comment<textarea id="e-c" rows="3" maxlength="300" placeholder="e.g. approved by Liam">${esc(prefill)}</textarea></label>`;
    $("ds").onclick = async () => {
        $("de").innerText = "Saving...";
        const res = await api("editLog", {
            row, key: v[1],
            checkIn: $("e-in").value.replace("T", " "),
            checkOut: $("e-out").value.replace("T", " "),
            adminComment: $("e-c").value
        });
        if (res.status !== "SUCCESS") { $("de").innerText = res.reason; return; }
        dlg.close(); loadHours();
    };
    dlg.showModal();
}

async function delLog(row) {
    const r = state.logs.find((x) => x.row === row);
    if (!confirm(`Delete this log row for ${r.v[1]}? This can't be undone.`)) return;
    const res = await api("deleteLog", { row, key: r.v[1] });
    if (res.status !== "SUCCESS") return alert(res.reason);
    loadHours();
}

function exportCsv() {
    const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
    const lines = [["Date", "Employee", "Site", "In", "Out", "Hours", "In Distance", "In Map", "Out Distance", "Out Map", "Status", "Notes", "Admin Comment"].join(",")];
    visibleLogs().forEach((r) => {
        const v = r.v, m = mins(v[0], v[9]);
        const day = (v[0].match(/^\d{4}-\d\d-\d\d/) || v[9].match(/^\d{4}-\d\d-\d\d/) || [""])[0];
        lines.push([dmy(day), v[1], v[4] || v[3], dmy(v[0]), dmy(v[9]), m === null ? "" : (m / 60).toFixed(2), v[7], v[8], v[10], v[11], statusOf(v), [v[6], v[12]].filter(Boolean).join(" | "), dmyAll(v[13])].map(q).join(","));
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    a.download = `attendance-${$("f-from").value}-to-${$("f-to").value}.csv`;
    a.click();
}

$("f-emp").addEventListener("input", renderHours);
$("f-failed").addEventListener("change", renderHours);

// ---------- Location picker (Leaflet + OpenStreetMap, free, no API key) ----------
const pickdlg = $("pickdlg");
let pickMap = null, pickMarker = null, pickCircle = null, picked = null;
const RADIUS_M = 500;   // keep in step with MAX_RADIUS_METRES in Code.gs

function setPick(lat, lng) {
    picked = { lat: lat, lng: lng };
    if (!pickMarker) {
        pickMarker = L.marker([lat, lng], { draggable: true }).addTo(pickMap);
        pickCircle = L.circle([lat, lng], { radius: RADIUS_M, color: "#0284c7", weight: 2, fillOpacity: 0.12 }).addTo(pickMap);
        pickMarker.on("drag", () => pickCircle.setLatLng(pickMarker.getLatLng()));
        pickMarker.on("dragend", () => { const p = pickMarker.getLatLng(); setPick(p.lat, p.lng); });
    } else {
        pickMarker.setLatLng([lat, lng]);
        pickCircle.setLatLng([lat, lng]);
    }
    $("p-info").innerText = `Selected: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

function openPicker() {
    if (typeof L === "undefined") return alert("The map couldn't load. Check your internet connection and refresh.");
    const latEl = $("df").querySelector('[data-i="2"]'), lngEl = $("df").querySelector('[data-i="3"]');
    const has = latEl.value.trim() !== "" && lngEl.value.trim() !== "" && isFinite(Number(latEl.value)) && isFinite(Number(lngEl.value));
    $("p-q").value = "";
    pickdlg.showModal();

    setTimeout(() => {   // wait for the dialog to be visible so the map gets its size
        if (!pickMap) {
            pickMap = L.map("pickmap");
            L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
                maxZoom: 19, attribution: "&copy; OpenStreetMap contributors"
            }).addTo(pickMap);
            pickMap.on("click", (e) => setPick(e.latlng.lat, e.latlng.lng));
        }
        pickMap.invalidateSize();
        if (pickMarker) { pickMap.removeLayer(pickMarker); pickMap.removeLayer(pickCircle); pickMarker = pickCircle = null; }
        picked = null;
        if (has) {
            pickMap.setView([Number(latEl.value), Number(lngEl.value)], 17);
            setPick(Number(latEl.value), Number(lngEl.value));
        } else {
            pickMap.setView([52.5, -1.5], 6);
            $("p-info").innerText = "Search above, or click the map to place the pin. The circle shows the 500m check-in area.";
        }
    }, 60);

    $("p-use").onclick = () => {
        if (!picked) { $("p-info").innerText = "Click the map to choose a spot first."; return; }
        latEl.value = picked.lat.toFixed(6);
        lngEl.value = picked.lng.toFixed(6);
        pickdlg.close();
    };
}

async function pickSearch() {
    const q = $("p-q").value.trim();
    if (!q) return;
    $("p-info").innerText = "Searching...";
    try {
        const res = await fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" + encodeURIComponent(q));
        const hits = await res.json();
        if (!hits.length) { $("p-info").innerText = "Nothing found. Try a postcode or a fuller address."; return; }
        const lat = Number(hits[0].lat), lng = Number(hits[0].lon);
        pickMap.setView([lat, lng], 17);
        setPick(lat, lng);
    } catch (err) {
        $("p-info").innerText = "Search failed. Check your connection, or click the map instead.";
    }
}

$("p-q").addEventListener("keydown", (e) => { if (e.key === "Enter") pickSearch(); });

// ---------- Map pop-up ----------
const mapdlg = $("mapdlg");
mapdlg.addEventListener("close", () => { $("mf").src = "about:blank"; });

function showMap(row, which) {
    const r = state.logs.find((x) => x.row === row);
    if (!r) return;
    const v = r.v, isIn = which === "in";
    const url = isIn ? v[8] : v[11], dist = isIn ? v[7] : v[10], when = isIn ? v[0] : v[9];
    const m = String(url).match(/maps\?q=(-?[\d.]+),(-?[\d.]+)/);
    if (!m) return;
    $("mt").innerText = `${v[1]}: ${isIn ? "check-in" : "check-out"} location`;
    $("mm").innerText = `${dmy(when)} | ${dist} from ${v[4] || v[3]}`;
    $("mf").src = `https://www.google.com/maps?q=${m[1]},${m[2]}&z=17&output=embed`;
    $("ml").href = url;
    mapdlg.showModal();
}

// ---------- QR codes ----------
const logoImg = new Image();
logoImg.onload = drawQr;
logoImg.src = "company%20logo1.png";   // same file as the page logo

function fillQrSites() {
    const sel = $("q-site"), keep = sel.value;
    sel.innerHTML = state.Sites.map((r) =>
        `<option value="${esc(r.v[0])}">${esc(r.v[1] || r.v[0])} (${esc(r.v[0])})${r.v[5] === "Inactive" ? " - inactive" : ""}</option>`).join("");
    if (keep) sel.value = keep;
    drawQr();
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function drawEye(ctx, x, y, cell) {
    const s = cell * 7;
    ctx.fillStyle = "#000"; roundRect(ctx, x, y, s, s, cell * 2.2); ctx.fill();
    ctx.fillStyle = "#fff"; roundRect(ctx, x + cell, y + cell, s - 2 * cell, s - 2 * cell, cell * 1.4); ctx.fill();
    ctx.fillStyle = "#000"; roundRect(ctx, x + 2 * cell, y + 2 * cell, s - 4 * cell, s - 4 * cell, cell * 0.9); ctx.fill();
}

function qrText() { return $("q-site").value; }

function drawQr() {
    const c = $("q-canvas"), ctx = c.getContext("2d"), text = qrText();
    if (typeof qrcode === "undefined" || !text) return;

    const site = state.Sites.find((r) => r.v[0] === text);
    const label = $("q-label").checked && site;
    const size = 800, pad = 40;

    const qr = qrcode(0, "H");          // "H" = highest error correction, so the logo can cover the middle
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount(), cell = (size - pad * 2) / n;

    c.width = size;
    c.height = size + (label ? 90 : 0);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);

    ctx.fillStyle = "#000";
    const inEye = (r, k) => (r < 7 && k < 7) || (r < 7 && k >= n - 7) || (r >= n - 7 && k < 7);
    for (let r = 0; r < n; r++) {
        for (let k = 0; k < n; k++) {
            if (!inEye(r, k) && qr.isDark(r, k)) ctx.fillRect(pad + k * cell, pad + r * cell, cell + 0.5, cell + 0.5);
        }
    }
    drawEye(ctx, pad, pad, cell);
    drawEye(ctx, pad + (n - 7) * cell, pad, cell);
    drawEye(ctx, pad, pad + (n - 7) * cell, cell);

    if (logoImg.complete && logoImg.naturalWidth) {
        const w = size * 0.34, h = w * logoImg.naturalHeight / logoImg.naturalWidth;
        const x = (size - w) / 2, y = (size - h) / 2;
        ctx.fillStyle = "#fff"; roundRect(ctx, x - 14, y - 14, w + 28, h + 28, 12); ctx.fill();
        ctx.drawImage(logoImg, x, y, w, h);
    }

    if (label) {
        ctx.fillStyle = "#000";
        ctx.font = "bold 40px -apple-system, Segoe UI, Roboto, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(site.v[1] || site.v[0], size / 2, size + 55);
    }
}

function downloadQr() {
    const text = qrText();
    if (!text) return;
    const a = document.createElement("a");
    a.href = $("q-canvas").toDataURL("image/png");
    a.download = "QR-" + text.replace(/[^\w-]+/g, "_") + ".png";
    a.click();
}

["q-site", "q-label"].forEach((id) => $(id).addEventListener("input", drawQr));

// ---------- Start ----------
$("who").innerText = "Logged in as " + (sessionStorage.getItem("adminName") || "Admin");
$("yr").innerText = new Date().getFullYear();
showVersion();
const today = new Date(), weekAgo = new Date(Date.now() - 6 * 864e5);
const iso = (d) => d.toLocaleDateString("en-CA");
$("f-from").value = iso(weekAgo);
$("f-to").value = iso(today);
loadLists();
loadHours();
