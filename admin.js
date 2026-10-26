// Must match the URL in app.js
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyMkTuDRTMRfSy6mrP2X_XSYMKSv4mG13dCdITgbe-fWQkLRr2VKHBXybH4aAwc8qX0/exec";

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
    if (r.expired) { alert(r.reason); logout(); }
    return r;
}

function logout() { sessionStorage.clear(); location.href = "index.html"; }

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ---------- Tabs ----------
document.querySelectorAll("nav button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("nav button").forEach((x) => x.classList.toggle("active", x === b));
    ["hours", "Users", "Sites"].forEach((t) => { $(t).hidden = t !== b.dataset.tab; });
}));

// ---------- Users & Sites ----------
async function loadLists() {
    const r = await api("list");
    if (r.status !== "SUCCESS") return alert(r.reason);
    state.Users = r.Users; state.Sites = r.Sites;
    renderTable("Users"); renderTable("Sites");
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
        const cls = v[5] === "FAILED" ? "failed" : v[5] === "MANUAL" ? "manual" : "";
        const note = [v[6], v[12]].filter(Boolean).join(" | ");
        return `<tr class="${cls}"><td>${day}</td><td>${esc(v[1])}</td><td>${esc(v[4] || v[3])}</td>` +
               `<td>${esc(v[0])}</td><td>${esc(v[9])}</td><td>${hm(m)}</td><td>${esc(v[5])}</td><td>${esc(note)}</td><td>${esc(v[13])}</td>` +
               `<td class="act"><button class="small" onclick="editLog(${r.row})">Edit</button>` +
               `<button class="small danger" onclick="delLog(${r.row})">Delete</button></td></tr>`;
    }).join("");
    $("t-hours").innerHTML = `<tr><th>Date</th><th>Employee</th><th>Site</th><th>In</th><th>Out</th><th>Hours</th><th>Status</th><th>Notes</th><th>Admin comment</th><th></th></tr>${body}`;
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
    const lines = [["Date", "Employee", "Site", "In", "Out", "Hours", "Status", "Notes", "Admin Comment"].join(",")];
    visibleLogs().forEach((r) => {
        const v = r.v, m = mins(v[0], v[9]);
        const day = (v[0].match(/^\d{4}-\d\d-\d\d/) || v[9].match(/^\d{4}-\d\d-\d\d/) || [""])[0];
        lines.push([day, v[1], v[4] || v[3], v[0], v[9], m === null ? "" : (m / 60).toFixed(2), v[5], [v[6], v[12]].filter(Boolean).join(" | "), v[13]].map(q).join(","));
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    a.download = `attendance-${$("f-from").value}-to-${$("f-to").value}.csv`;
    a.click();
}

$("f-emp").addEventListener("input", renderHours);
$("f-failed").addEventListener("change", renderHours);

// ---------- Start ----------
$("who").innerText = "Logged in as " + (sessionStorage.getItem("adminName") || "Admin");
$("yr").innerText = new Date().getFullYear();
const today = new Date(), weekAgo = new Date(Date.now() - 6 * 864e5);
const iso = (d) => d.toLocaleDateString("en-CA");
$("f-from").value = iso(weekAgo);
$("f-to").value = iso(today);
loadLists();
loadHours();
