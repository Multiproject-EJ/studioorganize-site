# Google Sheets signup capture

This guide explains how to forward StudioOrganize signups to a private Google Sheet while capturing the visitor's marketing consent preference.

## 1. Create the spreadsheet

1. Visit [Google Sheets](https://sheets.google.com) and create a new spreadsheet (for example, **StudioOrganize Signups**).
2. Rename the first tab to `Signups` (or adjust the script below to reference the tab name you prefer).
3. Keep the spreadsheet private so only your Google account can open it. As long as you do not share the sheet with anyone else, only you can view the captured data.

## 2. Publish an Apps Script web app

1. In the spreadsheet, choose **Extensions → Apps Script** to open a bound script.
2. Replace the default `Code.gs` contents with the following handler:

   ```js
   const SECRET_TOKEN = 'replace-with-a-long-random-string';

   function doPost(e) {
     const body = JSON.parse(e.postData.contents);
     const providedToken = e.parameter.token || body.token;
     if (SECRET_TOKEN && providedToken !== SECRET_TOKEN) {
       return ContentService
         .createTextOutput(JSON.stringify({ success: false, error: 'unauthorised' }))
         .setMimeType(ContentService.MimeType.JSON)
         .setResponseCode(401);
     }

     const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Signups');
     if (!sheet) {
       throw new Error('Signups sheet not found.');
     }

     const timestamp = new Date();
     sheet.appendRow([
       timestamp,
       body.name || '',
       body.email || '',
       body.marketingOptOut ? 'Opted out' : 'Consented',
       body.source || '',
       body.consentCapturedAt || ''
     ]);

     return ContentService
       .createTextOutput(JSON.stringify({ success: true }))
       .setMimeType(ContentService.MimeType.JSON);
   }
   ```

   The optional `SECRET_TOKEN` adds a lightweight guard so only callers that know the token value can hit the endpoint. Because the static marketing site cannot safely store secrets, keep this web app URL private. When testing locally you can temporarily clear the `SECRET_TOKEN` value.

3. Click **Deploy → Test deployments → Select type → Web app** and configure:
   - **Description**: `Signup capture`
   - **Web app**: execute as `Me`
   - **Who has access**: `Anyone with the link`

4. Press **Deploy** and copy the generated web app URL (it should look like `https://script.google.com/macros/s/.../exec`).

## 3. Configure the marketing site

1. Open [`supabase-test.html`](../supabase-test.html) and set the `content` attribute of the `<meta name="google-sheet-endpoint">` tag to the Apps Script URL you copied above.
2. (Optional) If you enabled the `SECRET_TOKEN` check, append the token as a query parameter: `https://script.google.com/macros/s/.../exec?token=YOUR_TOKEN`.
3. Publish the updated site. The Supabase test page (which powers the sign-up flow) now sends a JSON payload with the visitor's name, email, opt-out choice, and the capture timestamp to the Apps Script web app whenever registration succeeds.

The Apps Script runs entirely inside your Google account, so only you can open the spreadsheet and view the captured data. Anyone else who finds the URL can submit entries (similar to a form submission), but they still cannot read or download the sheet contents unless you explicitly share the document with them.

## 4. Verifying the integration

1. Load `supabase-test.html` locally or in production.
2. Fill out the sign-up form and choose whether to opt out of sister-site marketing.
3. After Supabase confirms the sign-up request, the event log should display `Captured signup consent in Google Sheets.`
4. Refresh your Google Sheet—you should see a new row containing the timestamp, name, email address, consent status, source, and capture timestamp.

If the log shows `Failed to capture signup consent in Google Sheets`, open the browser console for the full error message. Common issues include an incorrect web app URL, an expired Apps Script deployment, or failing the optional secret-token check.
