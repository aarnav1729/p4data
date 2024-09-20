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

const SCOPES = ["https://www.googleapis.com/auth/gmail.modify"];

// Create an OAuth2 client directly with the provided credentials
const oAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
oAuth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

// Array of email configurations
const emailConfigs = [
  {
    subject:
      "MES PEIPL Module - Quality - 90 Degree Visual & Final EL - Hourly - Defect Rate Status",
    outputFile: "extract.csv",
    seqCounter: 1,
    currentDay: new Date().getDate(),
  },
  {
    subject:
      "MES PEPPL - Quality - 90 Degree Visual & Final EL - Hourly - Defect Rate Status",
    outputFile: "extract2.csv",
    seqCounter: 1,
    currentDay: new Date().getDate(),
  },
];

// Function to initialize the sequence numbers based on existing data
function initializeSeqCounters() {
  emailConfigs.forEach((config) => {
    if (
      fs.existsSync(config.outputFile) &&
      fs.statSync(config.outputFile).size > 0
    ) {
      let maxSeqNbr = 0;
      fs.createReadStream(config.outputFile)
        .pipe(csv())
        .on("data", (row) => {
          const seqNbr = parseInt(row.SeqNbr, 10);
          if (seqNbr > maxSeqNbr) {
            maxSeqNbr = seqNbr;
          }
        })
        .on("end", () => {
          config.seqCounter = maxSeqNbr + 1;
          console.log(
            `SeqNbr initialized to ${config.seqCounter} for ${config.outputFile}`
          );
        });
    } else {
      console.log(
        `SeqNbr initialized to ${config.seqCounter} for ${config.outputFile}`
      );
    }
  });
}

// Function to monitor Gmail inbox for specific emails
function watchInboxForConfig(config) {
  const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

  setInterval(() => {
    const today = new Date().getDate();

    // Reset the file and sequence number if it's a new day
    if (today !== config.currentDay) {
      config.currentDay = today;
      config.seqCounter = 1; // Reset the sequence number at the start of the day
      console.log(
        `A new day has started. Overwriting the file ${config.outputFile}.`
      );
      fs.writeFileSync(config.outputFile, ""); // Overwrite the file at the start of the day
    }

    gmail.users.messages.list(
      {
        userId: "me",
        q: `is:unread subject:"${config.subject}"`,
        maxResults: 10, // Fetch up to 10 unread emails matching the query
      },
      (err, res) => {
        if (err) return console.log("The API returned an error: " + err);
        const messages = res.data.messages;
        if (messages && messages.length > 0) {
          console.log(
            `Found ${messages.length} new email(s) for subject "${config.subject}". Processing...`
          );
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

// Retrieve and process the message with the specified ID
function getMessage(messageId, config) {
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
      extractTableDataFromText(plainTextBody, config);
    } else if (htmlBody) {
      console.log("Extracting table data from HTML body...");
      extractTableDataFromText(htmlBody, config); // Assuming similar parsing for HTML
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
          console.log("Error marking email as read:", err);
        } else {
          console.log(`Email with ID ${messageId} marked as read.`);
        }
      }
    );
  });
}

// Function to reconstruct lines that are split across multiple lines
function reconstructLines(lines) {
  const reconstructedLines = [];
  let currentLine = "";

  lines.forEach((line) => {
    if (/^\d+\.\d+/.test(line.trim())) {
      // New data entry starts
      if (currentLine) {
        reconstructedLines.push(currentLine.trim());
      }
      currentLine = line.trim();
    } else {
      // Continuation of the current data entry
      currentLine += " " + line.trim();
    }
  });

  // Add the last data entry
  if (currentLine) {
    reconstructedLines.push(currentLine.trim());
  }

  return reconstructedLines;
}

// Function to extract table data from the plain text body
function extractTableDataFromText(textBody, config) {
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

  // Reconstruct lines to combine split data entries
  const reconstructedLines = reconstructLines(lines);

  // Prepare the CSV writer with appropriate headers
  let writer;
  const isFileEmpty =
    !fs.existsSync(config.outputFile) ||
    fs.statSync(config.outputFile).size === 0;

  // Always open the file in append mode
  writer = csvWriter({ sendHeaders: isFileEmpty }); // sendHeaders only if file is empty
  writer.pipe(fs.createWriteStream(config.outputFile, { flags: "a" }));

  // Parse each reconstructed line
  reconstructedLines.forEach((line) => {
    const parsedLine = parseLine(line);
    if (parsedLine) {
      // Assign your own sequential counter
      parsedLine.SeqNbr = config.seqCounter++;

      // Write the parsed line to CSV
      writer.write(parsedLine);
    }
  });

  writer.end(() => {
    console.log(`Table data extracted and saved to ${config.outputFile}`);
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
initializeSeqCounters(); // Initialize seqCounters before starting inbox watch
emailConfigs.forEach((config) => {
  watchInboxForConfig(config);
});