const express = require("express");
const cors = require("cors");
const axios = require("axios");
const app = express();
const port = 3001;

app.use(cors()); // Enable CORS for cross-origin requests

//receiving time range selected by user as req
app.get("/api/no2data", async (req, res) => {
  try {
    const { range } = req.query;
    const now = new Date();
    let pastDate;
    let isHourly = false;
    let datalimit = 300;

    //according to sleected time range
    switch (range) {
      case "48h":
        pastDate = new Date(now.getTime() - 48 * 60 * 60 * 1000);
        endpoint = `hourly`;
        isHourly = true;
        break;
      case "7d":
        pastDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        endpoint = `daily`;
        datalimit = 7;
        break;
      case "30d":
        pastDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        endpoint = `daily`;
        datalimit = 30;
        break;
      case "24h":
      default:
        pastDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        endpoint = `hourly`;
        isHourly = true;
        break;
    }

    const datetimeFrom = pastDate.toISOString();
    const datetimeTo = now.toISOString();
    //constructing url to fetch data
    const API_URL = `https://api.openaq.org/v3/sensors/5022/measurements/${endpoint}?date_from=${datetimeFrom}&date_to=${datetimeTo}&limit=${datalimit}`;
    const API_KEY = "";

    // Fetch data using Axios
    const response = await axios.get(API_URL, {
      headers: {
        "X-API-Key": API_KEY,
      },
    });

    //convert buffer data to json format
    const jsonData = response.data;

    //check data is received
    if (!jsonData || !jsonData.results) {
      return res.status(404).json({ error: "No valid data received" });
    }

    // retrive only no2 value and recorded time and date
    const dataArray = jsonData.results
      .map((item) => {
        if (
          item.period &&
          item.period.datetimeFrom &&
          item.value !== undefined
        ) {
          return {
            value: item.summary.median,
            time: isHourly
              ? item.period.datetimeFrom.utc
                  .split("T")[1]
                  .split("Z")[0]
                  .slice(0, 5) // to retrive time in HH:MM format
              : item.period.datetimeFrom.utc.split("T")[0], // to retrive date in YYYY-MM-DD format
          };
        }
        return null;
      })
      .filter((item) => item !== null);

    // Sort data by time (descending order)
    dataArray.sort((a, b) => {
      return (
        new Date(`1970-01-01T${b.time}:00Z`) -
        new Date(`1970-01-01T${a.time}:00Z`)
      );
    });

    // sometimes data is recorded multiple values for same time. such case need to take Aggregate data by time
    const aggregatedData = [];
    dataArray.forEach((item) => {
      const existingTime = aggregatedData.find(
        (entry) => entry.time === item.time
      );
      if (existingTime) {
        existingTime.value.push(item.value);
      } else {
        aggregatedData.push({
          time: item.time,
          value: [item.value],
        });
      }
    });

    //from aggregated data we can calculate mean values for the particular time
    const meanData = aggregatedData.map((entry) => {
      const meanValue =
        entry.value.reduce((sum, value) => sum + value, 0) / entry.value.length;
      return {
        time: entry.time,
        value: parseFloat(meanValue.toFixed(2)),
      };
    });

    res.json(meanData); // Send processed data as response
  } catch (error) {
    console.error("Error fetching or processing data:", error);
    res.status(500).json({ error: "Error fetching or processing data" });
  }
});

// Start the backend server
app.listen(port, () => {
  console.log(`✅ Backend server is running on http://localhost:${port}`);
});
