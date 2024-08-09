const express = require('express');
const fs = require('fs');
const csv = require('csv-parser');
const cors = require('cors'); // Import cors

const app = express();
const PORT = 3000;

// Enable CORS for all routes
app.use(cors());

// Serve static files from the current directory
app.use(express.static(__dirname));

// Endpoint to serve the parsed data
app.get('/data', (req, res) => {
    const filePath = 'sample.csv'; // Ensure this path is correct
    const { operation, line, shift } = req.query;

    const qualityCounts = {
        high: 0,
        medium: 0,
        low: 0
    };

    console.log(`Filtering data for Operation: ${operation}, Line: ${line}, Shift: ${shift}`);

    fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => {
            const {
                Operation,
                Line,
                Category,
                'A-Shift': A_Shift,
                'B-Shift': B_Shift,
                'C-Shift': C_Shift,
            } = row;

            if (Operation.trim() === operation && (line === 'all' || Line.trim() === line)) {
                console.log(`Processing row: Operation=${Operation}, Line=${Line}, Category=${Category}`);

                const shifts = {
                    'A-Shift': Number(A_Shift),
                    'B-Shift': Number(B_Shift),
                    'C-Shift': Number(C_Shift),
                };

                if (shift === 'all') {
                    if (Category === 'OK') {
                        qualityCounts.high += shifts['A-Shift'] + shifts['B-Shift'] + shifts['C-Shift'];
                    } else if (Category === 'TOTAL M GRADE') {
                        qualityCounts.medium += shifts['A-Shift'] + shifts['B-Shift'] + shifts['C-Shift'];
                    } else if (Category === 'TOTAL L GRADE') {
                        qualityCounts.low += shifts['A-Shift'] + shifts['B-Shift'] + shifts['C-Shift'];
                    }
                } else {
                    if (Category === 'OK') {
                        qualityCounts.high += shifts[shift];
                    } else if (Category === 'TOTAL M GRADE') {
                        qualityCounts.medium += shifts[shift];
                    } else if (Category === 'TOTAL L GRADE') {
                        qualityCounts.low += shifts[shift];
                    }
                }
            }
        })
        .on('end', () => {
            console.log('Final quality counts:', qualityCounts);
            res.json(qualityCounts);
        });
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
