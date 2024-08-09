const express = require("express");
const fs = require("fs");
const csv = require("csv-parser");
const cors = require("cors");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.static(__dirname));

app.get("/data", (req, res) => {
  const filePath = "sample.csv";
  const { operation, line, shift } = req.query;

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
        (shift === "all" || row[shift])
      ) {
        incrementQualityCounts(row, shift, qualityCounts);
      }
    })
    .on("end", () => {
      res.json(qualityCounts);
    });
});

app.get("/comparisonData", (req, res) => {
  const filePath = "sample.csv";
  const { line, operation, shift } = req.query;
  let comparisonData = [];

  fs.createReadStream(filePath)
    .pipe(csv())
    .on("data", (row) => {
      if (row.Operation.trim() === operation && row.Line.trim() !== line) {
        comparisonData.push({
          line: row.Line.trim(),
          shift: row[shift] ? shift : "All Shifts",
          high: row.Category === "OK" ? Number(row[shift]) : 0,
          medium: row.Category === "TOTAL M GRADE" ? Number(row[shift]) : 0,
          low: row.Category === "TOTAL L GRADE" ? Number(row[shift]) : 0,
        });
      }
    })
    .on("end", () => {
      res.json(comparisonData);
    });
});

function incrementQualityCounts(row, shift, qualityCounts) {
  ["A-Shift", "B-Shift", "C-Shift"].forEach((s) => {
    if (shift === "all" || shift === s) {
      qualityCounts.high += row.Category === "OK" ? Number(row[s]) : 0;
      qualityCounts.medium +=
        row.Category === "TOTAL M GRADE" ? Number(row[s]) : 0;
      qualityCounts.low +=
        row.Category === "TOTAL L GRADE" ? Number(row[s]) : 0;
    }
  });
}

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
