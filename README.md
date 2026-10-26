# i-Glaze Site Attendance

Staff check in and out by PIN + site QR code. Admins manage users, sites and hours from `admin.html`.

**Current release: 1.0.1**

## Where each file lives
| File | Goes in |
|---|---|
| `index.html`, `app.js`, `style.css` | GitHub (check-in page) |
| `admin.html`, `admin.js`, `admin.css` | GitHub (admin dashboard) |
| `company logo1.png` | GitHub |
| `Code.gs` | Google Apps Script (Extensions > Apps Script in the Google Sheet), NOT in GitHub |

## Version numbers (how to tell what's loaded)
The footer of both pages shows `Page v... | Script v...`.
- Both the same: everything is up to date.
- Amber text: they differ. "Page out of date" means press Ctrl+Shift+R, and if that doesn't fix it the GitHub files need updating. "Script needs redeploying" means Code.gs in Apps Script needs a new deployment.

The version must match in all of these (change them together, same number):
1. `APP_VERSION` at the top of `app.js` and `admin.js`
2. `SCRIPT_VERSION` at the top of `Code.gs`
3. The `?v=` numbers on the script/style links in `index.html` and `admin.html`

## Releasing a change
1. Update the files in GitHub and bump the version numbers above.
2. Paste the new `Code.gs` into Apps Script, then Deploy > Manage deployments > pencil icon > Version: New version > Deploy.
3. Wait a minute or two for GitHub Pages, hard refresh (Ctrl+Shift+R), check the footer shows matching versions.

## Google Sheet tabs
- **Users:** Name | PIN | Status (Active/Inactive) | Role (Contractor/Admin). Admin PINs must be 6-8 digits.
- **Sites:** SiteID | SiteName | Latitude | Longitude | (unused) | Status (Active/Inactive)
- **AuditLog:** Timestamp | Name | Action | Site ID | Site Name | Status | Reason | Dist | Google Maps Link | Check-Out Time | Check-Out Dist | Check-Out Map | User Comments | Admin Comments

Rules: check-in/out only within 500m of the site; anyone still checked in at 23:00 is closed automatically (needs `setupAutoLogoutTrigger` run once in Apps Script).

## Changelog
- **1.0.1** Refresh button on the admin dashboard; clearer version mismatch messages; README.
- **1.0.0** Version numbers in the footer; location picker; QR generator; admin dashboard; manual check-out; auto log-out.

Built by Karl Harris
