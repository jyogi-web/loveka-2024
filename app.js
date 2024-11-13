const express = require('express');
const app = express();
const port = 5000;

// 以下にルーティングを記述する

// index
app.get("/", (req, res) => {
    res.send("Hello World");
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});