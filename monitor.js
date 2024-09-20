const { google } = require("googleapis");
const fs = require("fs");
const csvWriter = require("csv-write-stream");
const csv = require("csv-parser");

// Gmail API credentials
const CLIENT_ID =
  "877959844332-a8cr2mq2pdsa36dvajp7t524bs9fdeg1.apps.googleusercontent.com";
const CLIENT_SECRET = "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";
const REFRESH_TOKEN =
  "1//04Dq9JjUV-M5LCgYIARAAGAQSNwF-L9IraCNZ0mN-v1okPQ9m5ag38GPQ2wXAf5M64-yqwT9sA2xVB_zyTRJcvz656PbTqXX-TSI";

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];
const OUTPUT_FILE = "extract.csv";

// Create an OAuth2 client directly with the provided credentials
const oAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
oAuth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

// Variables to store the current day and sequence number
let currentDay = new Date().getDate();
let seqCounter = 1; // Global SeqNbr counter

// Function to initialize the sequence number based on existing data
function initializeSeqCounter() {
  if (fs.existsSync(OUTPUT_FILE) && fs.statSync(OUTPUT_FILE).size > 0) {
    let maxSeqNbr = 0;
    fs.createReadStream(OUTPUT_FILE)
      .pipe(csv())
      .on("data", (row) => {
        const seqNbr = parseInt(row.SeqNbr, 10);
        if (seqNbr > maxSeqNbr) {
          maxSeqNbr = seqNbr;
        }
      })
      .on("end", () => {
        seqCounter = maxSeqNbr + 1; // Set the sequence counter based on the highest SeqNbr in the file
        console.log(`SeqNbr initialized to ${seqCounter}`);
      });
  } else {
    console.log(`SeqNbr initialized to ${seqCounter}`);
  }
}

/**
 * Ensures that the access token is refreshed automatically when expired.
 */
async function ensureAuthenticated() {
  try {
    const tokenResponse = await oAuth2Client.getAccessToken();
    oAuth2Client.setCredentials({ access_token: tokenResponse.token });
    console.log("Access token refreshed");
  } catch (error) {
    console.error("Error refreshing access token:", error);
  }
}

// Function to monitor Gmail inbox for specific emails
function watchInbox() {
  const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

  setInterval(() => {
    const today = new Date().getDate();

    // Reset the file and sequence number if it's a new day
    if (today !== currentDay) {
      currentDay = today;
      seqCounter = 1; // Reset the sequence number at the start of the day
      console.log("A new day has started. Overwriting the file.");
      fs.writeFileSync(OUTPUT_FILE, ""); // Overwrite the file at the start of the day
    }

    gmail.users.messages.list(
      {
        userId: "me",
        q: 'subject:"MES PEIPL Module - Quality - 90 Degree Visual & Final EL - Hourly - Defect Rate Status"',
        maxResults: 1,
      },
      (err, res) => {
        if (err) return console.log("The API returned an error: " + err);
        const messages = res.data.messages;
        if (messages && messages.length > 0) {
          console.log("Email found, processing...");
          const messageId = messages[0].id;
          getMessage(messageId);
        } else {
          console.log("No new emails found.");
        }
      }
    );
  }, 30000); // Poll every 30 seconds
}

// Retrieve and process the message with the specified ID
function getMessage(messageId) {
  const gmail = google.gmail({ version: "v1", auth: oAuth2Client });
  gmail.users.messages.get({ userId: "me", id: messageId }, (err, res) => {
    if (err) return console.log("Error fetching email:", err);

    const message = res.data;
    const payload = message.payload;

    let plainTextBody = "";
    let htmlBody = "";

    // Recursively process parts and extract the plain text or HTML body
    function getBody(parts) {
      parts.forEach((part) => {
        if (part.mimeType === "text/plain" && part.body.data) {
          plainTextBody = Buffer.from(part.body.data, "base64").toString();
        } else if (part.mimeType === "text/html" && part.body.data) {
          htmlBody = Buffer.from(part.body.data, "base64").toString();
        } else if (part.parts) {
          getBody(part.parts); // Check nested parts
        }
      });
    }

    getBody(payload.parts || []);

    if (plainTextBody) {
      console.log("Extracting table data from text body...");
      extractTableDataFromText(plainTextBody);
    } else if (htmlBody) {
      console.log("Extracting table data from HTML body...");
      extractTableData(htmlBody);
    } else {
      console.log("No plain text or HTML body found.");
    }
  });
}

// Function to extract table data from the plain text body
function extractTableDataFromText(textBody) {
  const tableStartIndex = textBody.indexOf("SeqNbr");
  const tableEndIndex = textBody.lastIndexOf("Thanks,") || textBody.length;

  if (tableStartIndex === -1) {
    console.log("No table found in the email body.");
    return;
  }

  // Extract and log the table text
  const tableText = textBody.substring(tableStartIndex, tableEndIndex).trim();
  console.log("Table text extracted:", tableText);

  // Split the table into lines
  const lines = tableText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    console.log("No lines found in the extracted table.");
    return;
  }

  // Prepare the CSV writer with appropriate headers
  let writer;
  const isFileEmpty =
    !fs.existsSync(OUTPUT_FILE) || fs.statSync(OUTPUT_FILE).size === 0;

  // Always open the file in append mode
  writer = csvWriter({ sendHeaders: isFileEmpty }); // sendHeaders only if file is empty
  writer.pipe(fs.createWriteStream(OUTPUT_FILE, { flags: "a" }));

  // Parse each line using the new parsing function
  lines.forEach((line) => {
    const parsedLine = parseLine(line);
    if (parsedLine) {
      // Assign your own sequential counter
      parsedLine.SeqNbr = seqCounter++;

      // Write the parsed line to CSV
      writer.write(parsedLine);
    }
  });

  writer.end(() => {
    console.log("Table data extracted and saved to extract.csv");
  });
}

// Function to parse a line of the table
function parseLine(line) {
  // Split the line into tokens
  const tokens = line.trim().split(/\s+/);

  // If the line has less than the expected number of tokens, skip it
  if (tokens.length < 8) {
    return null;
  }

  // Extract the last five tokens as the numeric columns
  const percentage = tokens.pop();
  const aPlusBPlusCShift = tokens.pop();
  const cShift = tokens.pop();
  const bShift = tokens.pop();
  const aShift = tokens.pop();

  // Now, find the index of the token that matches Line-\d+
  const lineIndex = tokens.findIndex((token) => /^Line-\d+$/.test(token));

  if (lineIndex === -1) {
    return null; // Can't find Line-\d+, skip this line
  }

  // The first token is SeqNbr from the email, which we'll ignore
  // Operation is tokens[1] up to (but not including) lineIndex
  const operationTokens = tokens.slice(1, lineIndex);
  const operation = operationTokens.join(" ");

  // Line is tokens[lineIndex]
  const lineField = tokens[lineIndex];

  // Category is tokens from lineIndex+1 up to the end
  const categoryTokens = tokens.slice(lineIndex + 1);
  const category = categoryTokens.join(" ");

  return {
    SeqNbr: null, // Will be overwritten with seqCounter
    Operation: operation,
    Line: lineField,
    Category: category,
    "A-Shift": aShift.replace(/,/g, ""),
    "B-Shift": bShift.replace(/,/g, ""),
    "C-Shift": cShift.replace(/,/g, ""),
    "A+B+C Shift": aPlusBPlusCShift.replace(/,/g, ""),
    "% - Percentage": percentage,
  };
}

// Start the inbox monitoring process
initializeSeqCounter(); // Initialize seqCounter before starting inbox watch
watchInbox();