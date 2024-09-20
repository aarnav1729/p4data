// server.js
const express = require("express");
const fs = require("fs");
const csv = require("csv-parser");
const cors = require("cors");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.static(__dirname));

// Endpoint to serve the parsed data
app.get("/data", (req, res) => {
  const { operation, line, shift, dataset } = req.query;

  let filePath;
  if (dataset === '2') {
    filePath = "extract2.csv";
  } else {
    filePath = "extract.csv";
  }

  // Check if the file exists
  if (!fs.existsSync(filePath)) {
    return res.json({ high: 0, medium: 0, low: 0 });
  }

  const qualityCounts = {
    high: 0,
    medium: 0,
    low: 0,
  };

  fs.createReadStream(filePath)
    .pipe(csv())
    .on("data", (row) => {
      if (
        row.Operation.trim() === operation &&
        (line === "all" || row.Line.trim() === line) &&
        (shift === "all" || shift in row)
      ) {
        incrementQualityCounts(row, shift, qualityCounts);
      }
    })
    .on("end", () => {
      res.json(qualityCounts);
    })
    .on("error", (err) => {
      console.error("Error reading CSV file:", err);
      res.status(500).send("Internal Server Error");
    });
});

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

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});