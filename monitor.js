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

// Scopes required for Gmail API
const SCOPES = ["https://www.googleapis.com/auth/gmail.modify"];

// Create an OAuth2 client with the provided credentials
const oAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
oAuth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

// Email configurations for daily and cumulative data
const emailConfigs = [
  {
    subject:
      'MES PEIPL Module - Quality - 90 Degree Visual & Final EL - Hourly - Defect Rate Status',
    dailyOutputFile: 'extract.csv',
    cumulativeOutputFile: 'cumulative1.csv',
    dailySeqCounter: 1,
    cumulativeSeqCounter: 1,
    dailyCurrentDay: new Date().getDate(),
  },
  {
    subject:
      'MES PEPPL - Quality - 90 Degree Visual & Final EL - Hourly - Defect Rate Status', // Ensure this matches exactly
    dailyOutputFile: 'extract2.csv',
    cumulativeOutputFile: 'cumulative2.csv',
    dailySeqCounter: 1,
    cumulativeSeqCounter: 1,
    dailyCurrentDay: new Date().getDate(),
  },
];

// Function to initialize sequence counters based on existing CSV files
function initializeSeqCounters() {
  emailConfigs.forEach((config) => {
    // Initialize daily sequence counter
    if (fs.existsSync(config.dailyOutputFile) && fs.statSync(config.dailyOutputFile).size > 0) {
      let maxSeqNbr = 0;
      fs.createReadStream(config.dailyOutputFile)
        .pipe(csv())
        .on("data", (row) => {
          const seqNbr = parseInt(row.SeqNbr, 10);
          if (seqNbr > maxSeqNbr) {
            maxSeqNbr = seqNbr;
          }
        })
        .on("end", () => {
          config.dailySeqCounter = maxSeqNbr + 1;
          console.log(`Daily SeqNbr initialized to ${config.dailySeqCounter} for ${config.dailyOutputFile}`);
        });
    } else {
      console.log(`Daily SeqNbr initialized to ${config.dailySeqCounter} for ${config.dailyOutputFile}`);
    }

    // Initialize cumulative sequence counter
    if (fs.existsSync(config.cumulativeOutputFile) && fs.statSync(config.cumulativeOutputFile).size > 0) {
      let maxSeqNbr = 0;
      fs.createReadStream(config.cumulativeOutputFile)
        .pipe(csv())
        .on("data", (row) => {
          const seqNbr = parseInt(row.SeqNbr, 10);
          if (seqNbr > maxSeqNbr) {
            maxSeqNbr = seqNbr;
          }
        })
        .on("end", () => {
          config.cumulativeSeqCounter = maxSeqNbr + 1;
          console.log(`Cumulative SeqNbr initialized to ${config.cumulativeSeqCounter} for ${config.cumulativeOutputFile}`);
        });
    } else {
      console.log(`Cumulative SeqNbr initialized to ${config.cumulativeSeqCounter} for ${config.cumulativeOutputFile}`);
    }
  });
}

// Function to monitor Gmail inbox for specific emails
function watchInboxForConfig(config) {
  const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

  setInterval(() => {
    const today = new Date().getDate();

    // Reset the daily file and sequence number if it's a new day
    if (today !== config.dailyCurrentDay) {
      config.dailyCurrentDay = today;
      config.dailySeqCounter = 1; // Reset the daily sequence number
      console.log(`A new day has started. Overwriting the file ${config.dailyOutputFile}.`);
      fs.writeFileSync(config.dailyOutputFile, ""); // Overwrite the daily file

      // Initialize the daily CSV with headers
      const dailyWriter = csvWriter({ sendHeaders: true });
      dailyWriter.pipe(fs.createWriteStream(config.dailyOutputFile, { flags: 'a' }));
      dailyWriter.end();
    }

    // Search for unread emails matching the subject
    gmail.users.messages.list(
      {
        userId: "me",
        q: `is:unread subject:"${config.subject}"`,
        maxResults: 10, // Adjust as needed
      },
      (err, res) => {
        if (err) {
          console.error("The API returned an error: ", err);
          return;
        }
        const messages = res.data.messages;
        if (messages && messages.length > 0) {
          console.log(`Found ${messages.length} new email(s) for subject "${config.subject}". Processing...`);
          messages.forEach((message) => {
            const messageId = message.id;
            getMessage(messageId, config);
          });
        } else {
          console.log(`No new emails found for subject "${config.subject}".`);
        }
      }
    );
  }, 30000); // Poll every 30 seconds
}

// Function to retrieve and process a specific email
function getMessage(messageId, config) {
  const gmail = google.gmail({ version: "v1", auth: oAuth2Client });
  gmail.users.messages.get({ userId: "me", id: messageId }, (err, res) => {
    if (err) {
      console.error(`Error fetching email ID ${messageId}:`, err);
      return;
    }

    const message = res.data;
    const payload = message.payload;

    let plainTextBody = "";
    let htmlBody = "";

    // Recursively extract the body from email parts
    function getBody(parts) {
      parts.forEach((part) => {
        if (part.mimeType === "text/plain" && part.body.data) {
          plainTextBody = Buffer.from(part.body.data, "base64").toString();
        } else if (part.mimeType === "text/html" && part.body.data) {
          htmlBody = Buffer.from(part.body.data, "base64").toString();
        } else if (part.parts) {
          getBody(part.parts);
        }
      });
    }

    getBody(payload.parts || []);

    if (plainTextBody) {
      console.log("Extracting table data from text body...");
      extractTableDataFromText(plainTextBody, config);
    } else if (htmlBody) {
      console.log("Extracting table data from HTML body...");
      // Implement HTML parsing if necessary
      extractTableDataFromText(htmlBody, config); // Assuming similar structure
    } else {
      console.log("No plain text or HTML body found.");
    }

    // Mark the email as read after processing
    gmail.users.messages.modify(
      {
        userId: "me",
        id: messageId,
        resource: {
          removeLabelIds: ["UNREAD"],
        },
      },
      (err) => {
        if (err) {
          console.error(`Error marking email ID ${messageId} as read:`, err);
        } else {
          console.log(`Email with ID ${messageId} marked as read.`);
        }
      }
    );
  });
}

// Function to reconstruct lines that may be split across multiple lines
function reconstructLines(lines) {
  const reconstructedLines = [];
  let currentLine = "";

  lines.forEach((line) => {
    currentLine += " " + line.trim();
    const tokens = currentLine.trim().split(/\s+/);
    if (tokens.length >= 9) { // Adjust based on expected number of tokens
      reconstructedLines.push(currentLine.trim());
      currentLine = "";
    }
  });

  // Add any remaining line
  if (currentLine.trim().length > 0) {
    reconstructedLines.push(currentLine.trim());
  }

  return reconstructedLines;
}

// Function to extract table data from the email body
function extractTableDataFromText(textBody, config) {
  const tableStartIndex = textBody.indexOf("SeqNbr");
  const tableEndIndex = textBody.lastIndexOf("Thanks,") || textBody.length;

  if (tableStartIndex === -1) {
    console.log("No table found in the email body.");
    return;
  }

  // Extract the table text
  const tableText = textBody.substring(tableStartIndex, tableEndIndex).trim();
  console.log("Table text extracted:", tableText);

  // Split into lines and clean
  const lines = tableText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    console.log("No lines found in the extracted table.");
    return;
  }

  // Reconstruct lines to handle multi-line entries
  const reconstructedLines = reconstructLines(lines);

  // Prepare the CSV writers
  // Daily CSV
  const isDailyFileEmpty =
    !fs.existsSync(config.dailyOutputFile) || fs.statSync(config.dailyOutputFile).size === 0;
  const dailyWriter = csvWriter({ sendHeaders: isDailyFileEmpty });
  dailyWriter.pipe(fs.createWriteStream(config.dailyOutputFile, { flags: 'a' }));

  // Cumulative CSV
  const isCumulativeFileEmpty =
    !fs.existsSync(config.cumulativeOutputFile) || fs.statSync(config.cumulativeOutputFile).size === 0;
  const cumulativeWriter = csvWriter({ sendHeaders: isCumulativeFileEmpty });
  cumulativeWriter.pipe(fs.createWriteStream(config.cumulativeOutputFile, { flags: 'a' }));

  // Parse each reconstructed line
  reconstructedLines.forEach((line) => {
    const parsedLine = parseLine(line);
    if (parsedLine) {
      // Write to daily CSV
      parsedLine.SeqNbr = config.dailySeqCounter++;
      dailyWriter.write(parsedLine);

      // Write to cumulative CSV
      parsedLine.SeqNbr = config.cumulativeSeqCounter++;
      cumulativeWriter.write(parsedLine);
    }
  });

  dailyWriter.end(() => {
    console.log(`Daily data extracted and saved to ${config.dailyOutputFile}`);
  });

  cumulativeWriter.end(() => {
    console.log(`Cumulative data extracted and saved to ${config.cumulativeOutputFile}`);
  });
}

// Function to parse a single line of the table
function parseLine(line) {
  // Split the line into tokens
  const tokens = line.trim().split(/\s+/);

  // If the line has less than the expected number of tokens, skip it
  if (tokens.length < 9) { // Adjust based on expected number of tokens
    console.log(`Skipping line due to insufficient tokens: "${line}"`);
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
    console.log(`Skipping line due to missing Line identifier: "${line}"`);
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

// Initialize sequence counters
initializeSeqCounters();

// Start monitoring inbox for each configuration
emailConfigs.forEach((config) => {
  watchInboxForConfig(config);
});