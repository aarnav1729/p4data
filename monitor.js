const { google } = require('googleapis');
const fs = require('fs');
const csvWriter = require('csv-write-stream');

// Gmail API credentials
const CLIENT_ID = '877959844332-a8cr2mq2pdsa36dvajp7t524bs9fdeg1.apps.googleusercontent.com';
const CLIENT_SECRET = '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';
const REFRESH_TOKEN = '1//04Dq9JjUV-M5LCgYIARAAGAQSNwF-L9IraCNZ0mN-v1okPQ9m5ag38GPQ2wXAf5M64-yqwT9sA2xVB_zyTRJcvz656PbTqXX-TSI';

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
const OUTPUT_FILE = 'extract.csv';

// Create an OAuth2 client directly with the provided credentials
const oAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
oAuth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

/**
 * Ensures that the access token is refreshed automatically when expired.
 */
async function ensureAuthenticated() {
    try {
        const tokenResponse = await oAuth2Client.getAccessToken();
        oAuth2Client.setCredentials({ access_token: tokenResponse.token });
        console.log('Access token refreshed');
    } catch (error) {
        console.error('Error refreshing access token:', error);
    }
}

// Function to monitor Gmail inbox for specific emails
function watchInbox() {
    const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });

    setInterval(() => {
        gmail.users.messages.list(
            {
                userId: 'me',
                q: 'subject:"MES PEIPL Module - Quality - 90 Degree Visual & Final EL - Hourly - Defect Rate Status"',
                maxResults: 1,
            },
            (err, res) => {
                if (err) return console.log('The API returned an error: ' + err);
                const messages = res.data.messages;
                if (messages && messages.length > 0) {
                    console.log('Email found, processing...');
                    const messageId = messages[0].id;
                    getMessage(messageId);
                } else {
                    console.log('No new emails found.');
                }
            }
        );
    }, 30000); // Poll every 30 seconds
}

// Retrieve and process the message with the specified ID
function getMessage(messageId) {
    const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });
    gmail.users.messages.get({ userId: 'me', id: messageId }, (err, res) => {
        if (err) return console.log('Error fetching email:', err);

        const message = res.data;
        const payload = message.payload;

        let plainTextBody = '';
        let htmlBody = '';

        // Recursively process parts and extract the plain text or HTML body
        function getBody(parts) {
            parts.forEach((part) => {
                if (part.mimeType === 'text/plain' && part.body.data) {
                    plainTextBody = Buffer.from(part.body.data, 'base64').toString();
                } else if (part.mimeType === 'text/html' && part.body.data) {
                    htmlBody = Buffer.from(part.body.data, 'base64').toString();
                } else if (part.parts) {
                    getBody(part.parts); // Check nested parts
                }
            });
        }

        getBody(payload.parts || []);

        if (plainTextBody) {
            console.log('Extracting table data from text body...');
            extractTableDataFromText(plainTextBody);
        } else if (htmlBody) {
            console.log('Extracting table data from HTML body...');
            extractTableData(htmlBody);
        } else {
            console.log('No plain text or HTML body found.');
        }
    });
}

// Function to extract table data from the plain text body
function extractTableDataFromText(textBody) {
    const tableStartIndex = textBody.indexOf('SeqNbr');
    const tableEndIndex = textBody.lastIndexOf('Thanks,') || textBody.length;

    if (tableStartIndex === -1) {
        console.log('No table found in the email body.');
        return;
    }

    // Extract and log the table text
    const tableText = textBody.substring(tableStartIndex, tableEndIndex).trim();
    console.log('Table text extracted:', tableText);

    // Split the table into lines
    const lines = tableText.split('\n').map(line => line.trim()).filter(line => line.length > 0);

    if (lines.length === 0) {
        console.log('No lines found in the extracted table.');
        return;
    }

    // Prepare the CSV writer with appropriate headers
    const writer = csvWriter({ headers: ['SeqNbr', 'Operation', 'Line', 'Category', 'A-Shift', 'B-Shift', 'C-Shift', 'A+B+C Shift', '% - Percentage'] });
    writer.pipe(fs.createWriteStream(OUTPUT_FILE));

    lines.forEach((line, index) => {
        console.log('Processing line:', line);

        // Match the columns ensuring "Operation" and "Line" stay together
        const columns = line.match(/^(\d+(\.\d{2})?)\s+([A-Za-z\s]+)\s+(Line-\d+)\s+([A-Za-z\s\(\)+]+)\s+([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)/);

        if (columns && columns.length === 11) {
            writer.write({
                'SeqNbr': columns[1],
                'Operation': columns[3].trim(),
                'Line': columns[4],
                'Category': columns[5].trim(),
                'A-Shift': columns[6].replace(',', ''),
                'B-Shift': columns[7].replace(',', ''),
                'C-Shift': columns[8].replace(',', ''),
                'A+B+C Shift': columns[9].replace(',', ''),
                '% - Percentage': columns[10].replace(',', '')
            });
        } else {
            console.log(`Skipping line ${index + 1} due to unexpected format: ${line}`);
        }
    });

    writer.end();
    console.log('Table data extracted and saved to extract.csv');
}


// Start the inbox monitoring process
watchInbox();
