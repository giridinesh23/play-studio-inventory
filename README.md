# Play Studio Bhutan - Inventory Management System

A mobile-first Progressive Web App (PWA) for managing professional audio-visual equipment inventory.

## Setup Instructions

### 1. Create Google Sheet

1. Go to [Google Sheets](https://sheets.google.com) and create a new spreadsheet
2. Name it **"Play Studio Inventory"**

### 2. Deploy Google Apps Script

1. In your Google Sheet, go to **Extensions > Apps Script**
2. Delete any existing code in `Code.gs`
3. Paste the entire contents of the `Code.gs` file from this project
4. Click **Deploy > New deployment**
5. Choose type: **Web app**
6. Set:
   - **Description**: "Inventory API"
   - **Execute as**: Me
   - **Who has access**: Anyone
7. Click **Deploy**
8. Authorize the app when prompted
9. **Copy the Web App URL** (looks like `https://script.google.com/macros/s/.../exec`)

### 3. Initialize the Sheets

1. Open the app in a browser (serve the files with any HTTP server)
2. Click **"Configure API URL"** on the login screen
3. Paste the Web App URL and click **Save**
4. Click **"Initialize Google Sheets"** to auto-create the tabs and default users

### 4. Login

Default users created during initialization:
- **Admin** — PIN: `1234`
- **Staff User** — PIN: `5678`

### 5. Serve the App

Any static file server works:

```bash
# Python
python3 -m http.server 8080

# Node.js (npx)
npx serve .

# PHP
php -S localhost:8080
```

Open `http://localhost:8080` in your browser.

### 6. Install as PWA

On mobile, open the app in Chrome and tap **"Add to Home Screen"** when prompted.

## File Structure

```
index.html          - Single-page app shell (all 12 screens)
css/styles.css      - Dark theme with gold accent
js/api.js           - Google Sheets API communication
js/app.js           - Navigation, state, screen renderers
js/scanner.js       - Camera barcode scanning (html5-qrcode)
js/barcode.js       - Barcode generation (JsBarcode Code128)
js/export.js        - PDF and Excel export
manifest.json       - PWA manifest
sw.js               - Service worker for offline caching
Code.gs             - Google Apps Script backend
```

## Features

- PIN-based login with admin/staff roles
- Dashboard with summary cards and overdue alerts
- Searchable, filterable inventory list
- Camera-based barcode scanning
- Check out / check in workflow
- Maintenance logging
- Auto-generated barcodes (PSB-YYYY-XXXX format)
- Barcode label printing (single and batch)
- PDF and Excel export
- User management (admin)
- PWA installable on mobile

## Equipment Categories

- Audio (speakers, amps, mixers)
- Lighting (par cans, moving heads, controllers)
- Cables & Accessories
- Microphones & Stands

## Tech Stack

- HTML5, CSS3, Vanilla JavaScript
- Google Apps Script + Google Sheets
- html5-qrcode (scanner)
- JsBarcode (barcode generation)
- jsPDF + jspdf-autotable (PDF export)
- SheetJS (Excel export)
