import express from "express";
import cors from "cors";
import dotenv from "dotenv";
const app = express();

dotenv.config();
app.use(cors());

app.get("/config", (req, res) => {
  res.json({
    contractAddress: process.env.CONTRACT_ADDRESS,
    pinataJWT: process.env.PINATA_JWT
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
