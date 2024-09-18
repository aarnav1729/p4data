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
    const filePath = "extracted_data.csv";
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

function incrementQualityCounts(row, shift, qualityCounts) {
    ["A-Shift", "B-Shift", "C-Shift"].forEach((s) => {
        if (shift === "all" || shift === s) {
            qualityCounts.high += row.Category === "OK" ? Number(row[s]) : 0;
            qualityCounts.medium += row.Category === "TOTAL M GRADE" ? Number(row[s]) : 0;
            qualityCounts.low += row.Category === "TOTAL L GRADE" ? Number(row[s]) : 0;
        }
    });
}

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});