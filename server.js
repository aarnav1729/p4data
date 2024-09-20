// server.js
const express = require("express");
const fs = require("fs");
const csv = require("csv-parser");
const cors = require("cors");

const app = express();
const PORT = 3000;

app.use(cors());

// **Move the /data route above the static middleware**
// Endpoint to serve the parsed data
app.get("/data", (req, res) => {
  const { operation, line, shift, dataset } = req.query;

  console.log(`Received /data request with params: operation=${operation}, line=${line}, shift=${shift}, dataset=${dataset}`);

  let filePath;
  switch (dataset) {
    case '1':
      filePath = "extract.csv"; // Daily Dataset 1
      break;
    case '2':
      filePath = "extract2.csv"; // Daily Dataset 2
      break;
    case '3':
      filePath = "cumulative1.csv"; // Cumulative Dataset 1
      break;
    case '4':
      filePath = "cumulative2.csv"; // Cumulative Dataset 2
      break;
    default:
      console.error(`Invalid dataset parameter received: ${dataset}`);
      return res.status(400).json({ error: "Invalid dataset parameter." });
  }

  console.log(`Attempting to read file: ${filePath}`);

  // Check if the file exists
  if (!fs.existsSync(filePath)) {
    console.warn(`File not found: ${filePath}`);
    return res.json({ high: 0, medium: 0, low: 0 });
  }

  const qualityCounts = {
    high: 0,
    medium: 0,
    low: 0,
  };

  let totalRows = 0;
  let matchedRows = 0;

  fs.createReadStream(filePath)
    .pipe(csv())
    .on("data", (row) => {
      totalRows++;
      const rowOperation = row.Operation.trim();
      const rowLine = row.Line.trim();
      const rowShiftValue = row[shift] ? row[shift].trim() : '';

      // Log each row's relevant data
      console.log(`Processing Row ${totalRows}: Operation="${rowOperation}", Line="${rowLine}", Shift="${row[shift]}"`);

      if (
        rowOperation === operation &&
        (line === "all" || rowLine === line) &&
        (shift === "all" || rowShiftValue)
      ) {
        matchedRows++;
        incrementQualityCounts(row, shift, qualityCounts);
        console.log(`Matched Row ${totalRows}: ${JSON.stringify(row)}`);
      }
    })
    .on("end", () => {
      console.log(`Finished processing file: ${filePath}`);
      console.log(`Total Rows Processed: ${totalRows}, Matched Rows: ${matchedRows}`);
      console.log(`Quality Counts:`, qualityCounts);
      res.json(qualityCounts);
    })
    .on("error", (err) => {
      console.error("Error reading CSV file:", err);
      res.status(500).send("Internal Server Error");
    });
});

// Function to increment quality counts based on category and shift
function incrementQualityCounts(row, shift, qualityCounts) {
  const shifts = ["A-Shift", "B-Shift", "C-Shift"];

  shifts.forEach((s) => {
    if (shift === "all" || shift === s) {
      const value = Number(row[s]) || 0;
      if (row.Category === "OK") {
        qualityCounts.high += value;
      } else if (row.Category === "TOTAL M GRADE") {
        qualityCounts.medium += value;
      } else if (row.Category === "TOTAL L GRADE") {
        qualityCounts.low += value;
      }
    }
  });
}

app.use(express.static(__dirname));

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});