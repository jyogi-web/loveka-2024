import 'dotenv/config';
import express from 'express';
import { Client, middleware } from '@line/bot-sdk';

const app = express();
const port = process.env.port || 3000;

const config = {
  channelSecret: process.env.ChannelSecret,
  channelAccessToken: process.env.channelAccessToken
};

const client = new Client(config);

// index
app.get("/", (req, res) => {
  res.send("Hello World");
});

// メッセージ送信エンドポイント
app.post('/send-message', (req, res) => {
  const message = {
    type: 'text',
    text: 'Hello from LINE Messaging API'
  };

  client.pushMessage('U4cb7355db135ea19f7d2101a5315bfab', message)
    .then(() => {
      res.status(200).send('Message sent');
    })
    .catch((err) => {
      console.error(err);
      res.status(500).send('Failed to send message');
    });
});

// Webhookエンドポイント
app.post("/webhook", middleware(config), (req, res) => {
  Promise
    .all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

app.listen(port, () => console.log(`Server is running on port ${port}`));

async function handleEvent(event) {
  if (event.type !== 'message') {
    return Promise.resolve(null);
  }

  if (event.message.type === 'text') {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: event.message.text // 実際に返信の言葉を入れる箇所
    });
  } else if (event.message.type === 'sticker') {
    return client.replyMessage(event.replyToken, {
      type: 'sticker',
      packageId: event.message.packageId,
      stickerId: event.message.stickerId
    });
  }

  return Promise.resolve(null);
}